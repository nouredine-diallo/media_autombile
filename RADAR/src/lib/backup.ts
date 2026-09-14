import path from 'path';
import fs from 'fs';
import { getDb } from './db';

/**
 * Sauvegarde de radar.db — finding E1 de l'audit du 2026-09-07 : aucune
 * sauvegarde n'existait nulle part, une perte de VM effaçait tout
 * l'historique éditorial sans recours.
 *
 * Choix technique vérifié empiriquement avant d'écrire ce fichier (pas
 * supposé) : `db.backup()` de better-sqlite3 utilise l'API SQLite Online
 * Backup — copie par pages sans verrou long, sûre à exécuter pendant que
 * l'app écrit (WAL). Mesuré sur radar.db réel (13 Mo, 3233 pages) :
 * 174ms, fichier résultant ré-ouvert et interrogé avec succès. Aucune
 * dépendance ajoutée (better-sqlite3 est déjà dans la stack figée §3).
 *
 * Fréquence : une fois par jour (pas à chaque cycle pipeline de 4h) —
 * le volume de données change lentement à cette échelle d'usage (5-10
 * utilisateurs), et désolidariser le calendrier de sauvegarde de celui
 * du pipeline évite tout couplage accidentel entre les deux.
 */

const RETENTION_DAYS = 7;
const BACKUP_FILE_PREFIX = 'radar-';

function getBackupDir(): string {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'radar.db');
  return process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
}

export interface BackupResult {
  file: string;
  sizeBytes: number;
  durationMs: number;
  pruned: number;
}

/**
 * Exécute une sauvegarde complète et purge les copies de plus de
 * RETENTION_DAYS jours. Ne lève jamais — un échec de sauvegarde ne doit
 * pas faire tomber le pipeline (même doctrine que le reste de cron.ts),
 * mais il doit être visible : voir `getLastBackupStatus()`.
 */
export async function runDatabaseBackup(): Promise<BackupResult> {
  const dir = getBackupDir();
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${BACKUP_FILE_PREFIX}${stamp}.db`);

  const db = getDb();
  const start = Date.now();
  await db.backup(dest);
  const durationMs = Date.now() - start;
  const sizeBytes = fs.statSync(dest).size;

  const pruned = pruneOldBackups(dir);

  recordBackupOutcome({ ok: true, file: dest, sizeBytes, durationMs, at: new Date().toISOString() });
  return { file: dest, sizeBytes, durationMs, pruned };
}

function pruneOldBackups(dir: string): number {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(BACKUP_FILE_PREFIX) || !name.endsWith('.db')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      pruned++;
    }
  }
  return pruned;
}

interface BackupStatus {
  ok: boolean;
  file?: string;
  sizeBytes?: number;
  durationMs?: number;
  at: string;
  error?: string;
}

/**
 * État de la dernière sauvegarde, persisté en base (table déjà existante
 * `pipeline_config`, même mécanisme clé/valeur que `cron_config`) — pas un
 * fichier séparé à surveiller en plus, pas de nouvelle table.
 * Exposé pour que l'absence de sauvegarde récente devienne un signal
 * visible plutôt qu'une hypothèse (RADAR/CLAUDE.md §6, "aucune
 * dégradation silencieuse").
 */
function recordBackupOutcome(status: BackupStatus): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.prepare(
    "INSERT OR REPLACE INTO pipeline_config (key, value) VALUES ('last_backup', ?)"
  ).run(JSON.stringify(status));
}

export function getLastBackupStatus(): BackupStatus | null {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM pipeline_config WHERE key = 'last_backup'").get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

/**
 * Enveloppe appelée par le cron dédié (voir cron.ts) — capture l'échec au
 * lieu de le laisser remonter, mais l'écrit quand même dans le statut
 * persisté pour qu'il reste visible.
 */
export async function runDatabaseBackupSafe(): Promise<void> {
  try {
    const result = await runDatabaseBackup();
    console.log(
      `[BACKUP] OK — ${path.basename(result.file)} (${(result.sizeBytes / 1024 / 1024).toFixed(1)} Mo, ${result.durationMs}ms, ${result.pruned} ancienne(s) copie(s) purgée(s))`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[BACKUP] Échec de la sauvegarde:', message);
    try {
      recordBackupOutcome({ ok: false, error: message, at: new Date().toISOString() });
    } catch {
      // La base elle-même est peut-être inaccessible — rien de plus à tenter ici.
    }
  }
}
