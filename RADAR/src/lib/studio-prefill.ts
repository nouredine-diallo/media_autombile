export interface StudioPrefillData {
  t: string;      // title (truncated to 150 chars)
  s: string;      // source (feed name)
  i: string;      // image URL or 'empty'
  c: string;      // content_id
  b: string;      // brief headline
}

function toBase64Url(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeStudioUrl(data: StudioPrefillData): string {
  const params = new URLSearchParams();
  params.set('t', data.t.slice(0, 150));
  params.set('s', data.s);
  params.set('i', data.i || 'empty');
  params.set('c', data.c);
  params.set('b', data.b.slice(0, 200));
  const json = JSON.stringify(Object.fromEntries(params));
  const encoder = new TextEncoder();
  return toBase64Url(encoder.encode(json));
}

export function decodeStudioUrl(encoded: string): StudioPrefillData | null {
  try {
    const bytes = fromBase64Url(encoded);
    const decoder = new TextDecoder();
    const json = decoder.decode(bytes);
    const data = JSON.parse(json);
    return {
      t: data.t || '',
      s: data.s || '',
      i: data.i || 'empty',
      c: data.c || '',
      b: data.b || '',
    };
  } catch {
    return null;
  }
}

/**
 * Bug trouvé le 2026-08-28 : cette fonction est appelée depuis
 * `events/[id]/page.tsx`, un Client Component (`'use client'`). Le rendu
 * initial (SSR) a bien accès à `process.env.STUDIO_URL`, mais dès qu'un
 * re-render se déclenche côté navigateur (n'importe quel `setState`, par
 * exemple après le clic "Valider") — Next.js n'injecte JAMAIS une variable
 * sans préfixe `NEXT_PUBLIC_` dans le bundle client, donc la valeur y est
 * silencieusement `undefined` et retombe sur le fallback IP codé en dur, en
 * écrasant la bonne valeur affichée un instant plus tôt. Confirmé par test
 * réel : le lien "Carrousel →" pointait sur le fallback après validation,
 * peu importe la config de `.env.local`. Cause très probable du premier
 * lien mort signalé par l'utilisateur en session (le lien vers l'ancien
 * tunnel Cloudflare) — pas un problème de timing de déploiement comme
 * supposé à l'époque.
 *
 * `NEXT_PUBLIC_STUDIO_URL` est la variable exposée au client (inlinée au
 * build par Next.js) ; `STUDIO_URL` reste utilisée par le code
 * serveur-à-serveur (`visualSearch.ts` notamment) qui n'a pas ce problème.
 */
export function getStudioUrl(): string {
  return process.env.NEXT_PUBLIC_STUDIO_URL || process.env.STUDIO_URL || "http://89.168.53.133:3002";
}

export function buildStudioLink(params: {
  title: string;
  source: string;
  imageUrl: string | null;
  contentId: string;
  briefHeadline: string;
}): string {
  const encoded = encodeStudioUrl({
    t: params.title,
    s: params.source,
    i: params.imageUrl || 'empty',
    c: params.contentId,
    b: params.briefHeadline,
  });
  return `${getStudioUrl()}/titres?prefill=${encoded}`;
}

/**
 * Variante carrousel de `buildStudioLink` — même enveloppe `?prefill=`, route
 * dédiée `/titres/carrousel` (page STUDIO distincte, voir §6 étape 2.5 du
 * plan écosystème) plutôt qu'un drapeau sur `/titres` : évite de faire
 * porter au composant single-image, déjà volumineux et déjà éprouvé, une
 * branche carrousel qui risquerait de le régresser. Le chemin `/titres`
 * seul (single-image) reste totalement inchangé.
 */
export function buildCarouselStudioLink(params: {
  title: string;
  source: string;
  imageUrl: string | null;
  contentId: string;
  briefHeadline: string;
}): string {
  const encoded = encodeStudioUrl({
    t: params.title,
    s: params.source,
    i: params.imageUrl || 'empty',
    c: params.contentId,
    b: params.briefHeadline,
  });
  return `${getStudioUrl()}/titres/carrousel?prefill=${encoded}`;
}
