import { startCron, stopCron, getCronStatus } from './cron';
import { closeDb } from './db';

let initialized = false;
let shuttingDown = false;

export function initCron() {
  if (initialized) return;

  // CRITICAL FIX: DO NOT RUN CRON OR NATIVE MODULES DURING NEXT.JS SSG BUILD PHASE
  if (
    process.env.npm_lifecycle_event === 'build' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NODE_ENV !== 'production' // avoid starting cron in dev to prevent multiple instances
  ) {
    if (process.env.NODE_ENV === 'production') {
      console.log('[STARTUP] Build phase detected, skipping cron initialization');
      return;
    }
  }

  initialized = true;

  // Start cron scheduler
  startCron();

  console.log('[STARTUP] Cron scheduler initialized');

  registerGracefulShutdown();
}

/**
 * Finding E6 (audit 2026-09-07) : rien ne gérait SIGTERM — `pm2 restart`/
 * `pm2 reload` (ou un simple redéploiement, `deploy.sh`) tuait le process
 * en pleine écriture SQLite ou en plein cycle d'ingestion (`runPipeline`,
 * cron.ts) sans lui laisser la moindre chance de finir proprement. PM2
 * envoie SIGKILL par défaut 1600ms après SIGTERM (`kill_timeout`) si le
 * process ne s'est pas arrêté seul — `deploy.sh` relève ce délai pour
 * laisser cette attente bornée se dérouler (voir commentaire associé).
 *
 * Bornée à MAX_SHUTDOWN_WAIT_MS : mieux vaut couper un cycle d'ingestion en
 * cours (chaque écriture individuelle reste atomique, better-sqlite3 est
 * synchrone — pas de corruption partielle d'une ligne) que de laisser PM2
 * attendre indéfiniment un process qui ne finit jamais.
 */
const MAX_SHUTDOWN_WAIT_MS = 8000;
const SHUTDOWN_POLL_INTERVAL_MS = 250;

function registerGracefulShutdown(): void {
  const handle = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[STARTUP] ${signal} reçu — arrêt propre en cours...`);

    stopCron();

    const deadline = Date.now() + MAX_SHUTDOWN_WAIT_MS;
    const waitLoop = () => {
      if (!getCronStatus().running || Date.now() >= deadline) {
        if (getCronStatus().running) {
          console.log('[STARTUP] Cycle en cours non terminé après le délai — arrêt quand même');
        }
        closeDb();
        console.log('[STARTUP] Arrêt propre terminé');
        process.exit(0);
        return;
      }
      setTimeout(waitLoop, SHUTDOWN_POLL_INTERVAL_MS);
    };
    waitLoop();
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
}
