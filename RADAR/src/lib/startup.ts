import { closeDb } from './db';

let initialized = false;
let shuttingDown = false;

/**
 * Finding "pipeline bloque le serveur web" (TODO.md §3.3, résolu le 16
 * sept. 2026) : cette fonction démarrait autrefois `startCron()` dans le
 * même process que le serveur web — c'est exactement la cause du blocage
 * de 30-50 min corrigé ici. Le pipeline tourne désormais dans son propre
 * process PM2 (`radar-pipeline`, voir src/pipeline-worker.ts). Cette
 * fonction ne fait plus qu'enregistrer un arrêt propre pour la connexion
 * SQLite du process web — renommée `initWebApp` (elle n'initialise plus de
 * cron, garder l'ancien nom aurait été trompeur).
 */
export function initWebApp() {
  if (initialized) return;

  // CRITICAL FIX: ne rien faire pendant la phase de build Next.js
  if (
    process.env.npm_lifecycle_event === 'build' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  ) {
    return;
  }

  initialized = true;
  registerGracefulShutdown();
}

/**
 * Finding E6 (audit 2026-09-07), simplifié le 16 sept. 2026 : plus besoin
 * d'attendre la fin d'un cycle d'ingestion ici — ce process ne lance plus
 * jamais `runPipeline()` (déplacé dans radar-pipeline, qui a son propre
 * arrêt propre borné, voir pipeline-worker.ts). Fermer la connexion SQLite
 * (better-sqlite3, synchrone) suffit ; aucune attente nécessaire.
 */
function registerGracefulShutdown(): void {
  const handle = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[STARTUP] ${signal} reçu — arrêt propre en cours...`);
    closeDb();
    console.log('[STARTUP] Arrêt propre terminé');
    process.exit(0);
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
}
