import fs from 'fs';
import { getDb } from './db';

/**
 * VACUUM périodique de radar.db — finding D8 (audit 2026-09-07) : aucun
 * VACUUM n'était jamais exécuté. Les suppressions déjà en place
 * (cacheCleanup.ts : pipeline_runs >30j, events orphelins >7j,
 * calendar_events >90j) libèrent des pages internes que SQLite ne rend
 * jamais au système de fichiers sans VACUUM — le fichier ne fait que
 * grossir au fil des mois même si son contenu utile reste stable.
 *
 * Vérifié empiriquement avant d'écrire ce fichier (pas supposé) : VACUUM sur
 * une copie de radar.db réel (14,28 Mo, mode WAL) — 412ms, mode WAL
 * préservé après coup, données intactes. Coût negligeable à cette échelle
 * (≤10 utilisateurs), cohérent avec la contrainte "pas de sauvegarde/tâche
 * de fond lourde qui affecte perf/prod".
 *
 * Fréquence volontairement plus rare que la sauvegarde quotidienne (E1,
 * `backup.ts`) : le volume de pages libérées à ce rythme d'usage ne
 * justifie pas un VACUUM quotidien. Gating par timestamp persisté (même
 * mécanisme clé/valeur que `getLastBackupStatus`) plutôt qu'un cron séparé
 * — le cron de `cron.ts` (créneau 3h du matin déjà utilisé par la
 * sauvegarde) déclenche cette fonction tous les jours, mais elle ne fait
 * réellement un VACUUM qu'une fois tous les VACUUM_INTERVAL_DAYS jours.
 */
const VACUUM_INTERVAL_DAYS = 7;

interface VacuumStatus {
  ok: boolean;
  sizeBeforeBytes?: number;
  sizeAfterBytes?: number;
  durationMs?: number;
  at: string;
  error?: string;
}

function getDbFilePath(): string {
  const db = getDb();
  const row = db.prepare('PRAGMA database_list').all() as { name: string; file: string }[];
  const main = row.find(r => r.name === 'main');
  return main?.file || '';
}

function recordVacuumOutcome(status: VacuumStatus): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.prepare(
    "INSERT OR REPLACE INTO pipeline_config (key, value) VALUES ('last_vacuum', ?)"
  ).run(JSON.stringify(status));
}

export function getLastVacuumStatus(): VacuumStatus | null {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM pipeline_config WHERE key = 'last_vacuum'").get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

function isVacuumDue(): boolean {
  const last = getLastVacuumStatus();
  if (!last) return true;
  const lastAt = new Date(last.at).getTime();
  if (Number.isNaN(lastAt)) return true;
  const elapsedDays = (Date.now() - lastAt) / (24 * 60 * 60 * 1000);
  return elapsedDays >= VACUUM_INTERVAL_DAYS;
}

/**
 * Exécute VACUUM si assez de temps s'est écoulé depuis le dernier, sinon ne
 * fait rien (silencieux, pas un échec). Ne lève jamais — un échec de VACUUM
 * ne doit pas faire tomber le pipeline (même doctrine que `runDatabaseBackupSafe`),
 * mais reste visible via `getLastVacuumStatus()`.
 */
export async function runVacuumIfDueSafe(): Promise<void> {
  if (!isVacuumDue()) {
    return;
  }

  const dbPath = getDbFilePath();
  try {
    const db = getDb();
    const sizeBeforeBytes = dbPath && fs.existsSync(dbPath) ? fs.statSync(dbPath).size : undefined;
    const start = Date.now();
    db.exec('VACUUM');
    const durationMs = Date.now() - start;
    const sizeAfterBytes = dbPath && fs.existsSync(dbPath) ? fs.statSync(dbPath).size : undefined;

    recordVacuumOutcome({ ok: true, sizeBeforeBytes, sizeAfterBytes, durationMs, at: new Date().toISOString() });
    console.log(
      `[VACUUM] OK — ${durationMs}ms` +
      (sizeBeforeBytes !== undefined && sizeAfterBytes !== undefined
        ? ` (${(sizeBeforeBytes / 1024 / 1024).toFixed(1)} Mo → ${(sizeAfterBytes / 1024 / 1024).toFixed(1)} Mo)`
        : '')
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[VACUUM] Échec:', message);
    try {
      recordVacuumOutcome({ ok: false, error: message, at: new Date().toISOString() });
    } catch {
      // La base elle-même est peut-être inaccessible — rien de plus à tenter ici.
    }
  }
}
