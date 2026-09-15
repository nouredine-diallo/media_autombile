import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getDb } from './db';
import { getSessionSecretString } from './sessionSecret';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

/**
 * Chiffrement au repos des tokens Drive — finding A5 (audit 2026-09-07) :
 * `access_token`/`refresh_token` étaient stockés en clair dans `google_tokens`
 * (table SQLite). Le `refresh_token` Google est longue durée — sa fuite via
 * une copie de `radar.db` (sauvegarde, accès disque) donnerait un accès
 * Drive persistant. AES-256-GCM, clé dérivée de `SESSION_SECRET` (déjà
 * présent, aucun nouveau secret à gérer) — natif `node:crypto`, aucune
 * dépendance ajoutée (RADAR/CLAUDE.md §3).
 */
function getTokenEncryptionKey(): Buffer {
  return createHash('sha256').update(`google-tokens:${getSessionSecretString()}`).digest();
}

function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(ciphertext: string): string {
  const [ivHex, authTagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !dataHex) {
    // Compatibilité : une valeur stockée avant ce correctif n'a pas ce
    // format — la traiter comme déjà en clair plutôt que planter, le
    // prochain `storeTokens()` (refresh normal) la re-chiffrera.
    return ciphertext;
  }
  const decipher = createDecipheriv('aes-256-gcm', getTokenEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  email?: string;
}

export function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * `state` obligatoire — finding A4 (audit 2026-09-07) : sans lui, un
 * attaquant peut obtenir un `code` d'autorisation pour SON PROPRE compte
 * Google puis forcer la navigation d'une victime déjà connectée vers
 * `/api/auth/google/callback?code=<code_attaquant>` (GET, cookie de session
 * joint même en sameSite=lax sur une navigation top-level) — les tokens
 * Drive de toute l'équipe (ligne unique partagée, `storeTokens`) basculent
 * alors silencieusement vers le Drive de l'attaquant. `state` est généré et
 * posé en cookie ici, vérifié dans le callback (route.ts) avant tout
 * échange de code.
 */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google OAuth error: ${err}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + (data.expires_in as number) * 1000,
  };
}

export async function refreshAccessToken(): Promise<GoogleTokens | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refresh_token) return null;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    console.error('Google token refresh failed:', await response.text());
    return null;
  }

  const data = await response.json();
  const newTokens: GoogleTokens = {
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.now() + (data.expires_in as number) * 1000,
    email: tokens.email,
  };

  storeTokens(newTokens);
  return newTokens;
}

export async function getValidAccessToken(): Promise<string | null> {
  let tokens = getStoredTokens();
  if (!tokens) return null;

  // Refresh if expired (with 5 min buffer)
  if (Date.now() > tokens.expiry_date - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    tokens = refreshed;
  }

  return tokens.access_token;
}

export function storeTokens(tokens: GoogleTokens): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO google_tokens (id, access_token, refresh_token, expiry_date, email, updated_at)
    VALUES (1, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expiry_date = excluded.expiry_date,
      email = COALESCE(excluded.email, google_tokens.email),
      updated_at = datetime('now')
  `).run(encryptToken(tokens.access_token), encryptToken(tokens.refresh_token), tokens.expiry_date, tokens.email ?? null);
}

export function getStoredTokens(): GoogleTokens | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM google_tokens WHERE id = 1').get() as {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    email: string | null;
  } | undefined;

  if (!row) return null;
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.expiry_date,
    email: row.email ?? undefined,
  };
}

export function disconnectGoogle(): void {
  const db = getDb();
  db.prepare('DELETE FROM google_tokens WHERE id = 1').run();
  db.prepare('DELETE FROM drive_files WHERE is_cloud = 1').run();
}

export async function getUserEmail(): Promise<string | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.email ?? null;
}
