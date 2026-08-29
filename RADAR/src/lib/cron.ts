import cron, { type ScheduledTask } from 'node-cron';
import { getFeeds, fetchFeed, storeItems, updateFeedLastFetched } from './rss';
import { startPipelineRun, completePipelineRun, cleanupStaleRuns, getDb } from './db';
import { runCacheCleanup } from './cacheCleanup';

interface CronConfig {
  ingestInterval: string;  // cron expression, default: every 4 hours
  enabled: boolean;
}

const DEFAULT_CONFIG: CronConfig = {
  ingestInterval: '0 */4 * * *', // every 4 hours
  enabled: true,
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))]);
}

let currentTask: ScheduledTask | null = null;
let isRunning = false;

async function runPipeline(): Promise<void> {
  if (isRunning) {
    console.log('[CRON] Pipeline already running, skipping');
    return;
  }

  isRunning = true;
  const runId = startPipelineRun('full');
  console.log(`[CRON] Pipeline started at ${new Date().toISOString()}`);

  try {
    const feeds = getFeeds().filter(f => f.requires_scraping === 0);
    let totalStored = 0;

    for (const feed of feeds) {
      try {
        const items = await withTimeout(fetchFeed(feed), 12000);
        const { stored } = storeItems(feed.id, items);
        updateFeedLastFetched(feed.id);
        totalStored += stored;
      } catch (error) {
        console.error(`[CRON] Error ingesting ${feed.name}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`[CRON] Ingested ${totalStored} new items`);

    let eventsCreated = 0;
    let scoringError: string | undefined;
    try {
      const { embedUnprocessedItems, clusterItemsIntoEvents, calculateScores } = await import('./scoring');
      const embedded = await withTimeout(embedUnprocessedItems(), 60000);
      eventsCreated = await clusterItemsIntoEvents();
      calculateScores();
      console.log(`[CRON] Embedded: ${embedded}, Events: ${eventsCreated}`);
    } catch (error) {
      // Ne pas se contenter du console.error : un échec ici laissait
      // `events.score` bloqué à 0 pour tous les événements, sans qu'aucun
      // état visible ne le signale (RADAR/CLAUDE.md §6, "aucune dégradation
      // silencieuse") — remonté dans `pipeline_runs.error`, déjà lu par
      // PipelineStatus.tsx, plutôt que perdu dans les logs serveur.
      scoringError = error instanceof Error ? error.message : String(error);
      console.error('[CRON] Scoring skipped:', scoringError);
    }

    try {
      const cacheCleanupResult = await runCacheCleanup();
      console.log(`[CRON] Cache cleanup: ${cacheCleanupResult.pipelineRunsDeleted} runs, ${cacheCleanupResult.itemsArchived} items`);
    } catch (error) {
      console.error('[CRON] Cache cleanup error:', error);
    }

    try {
      const { runMorningAutoGeneration } = await import('./autoGenerate');
      await runMorningAutoGeneration(runId);
    } catch (error) {
      // Ne bloque jamais le reste du pipeline — la génération auto est un
      // bonus, pas une étape critique (chantier 3 du plan écosystème).
      console.error('[CRON] Auto-génération matinale échouée:', error);
    }

    completePipelineRun(runId, 'completed', {
      items_ingested: totalStored,
      events_created: eventsCreated,
      images_found: 0,
      error: scoringError,
    });

    console.log(`[CRON] Pipeline completed at ${new Date().toISOString()}`);
  } catch (error) {
    completePipelineRun(runId, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.error('[CRON] Pipeline failed:', error);
  } finally {
    isRunning = false;
  }
}

export function getCronConfig(): CronConfig {
  try {
    const db = getDb();
    // Try to read config from a simple key-value store
    const row = db.prepare("SELECT value FROM pipeline_config WHERE key = 'cron_config'").get() as { value: string } | undefined;
    if (row) {
      return JSON.parse(row.value);
    }
  } catch {
    // Table doesn't exist yet
  }
  return DEFAULT_CONFIG;
}

export function saveCronConfig(config: Partial<CronConfig>): void {
  const db = getDb();
  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  const current = getCronConfig();
  const merged = { ...current, ...config };
  db.prepare(
    "INSERT OR REPLACE INTO pipeline_config (key, value) VALUES ('cron_config', ?)"
  ).run(JSON.stringify(merged));
  // Restart cron with new config
  stopCron();
  startCron();
}

export function startCron(): void {
  // Un process précédent peut être mort en plein cycle (crash, redémarrage) —
  // sa ligne pipeline_runs reste alors bloquée à 'running' pour toujours,
  // jamais 'completed' ni 'failed'. Nettoyé au démarrage pour ne jamais
  // laisser un état invisible s'accumuler (RADAR/CLAUDE.md §6).
  const cleaned = cleanupStaleRuns();
  if (cleaned > 0) {
    console.log(`[CRON] ${cleaned} run(s) bloqué(s) marqué(s) échoué(s) au démarrage`);
  }

  const config = getCronConfig();
  if (!config.enabled) {
    console.log('[CRON] Disabled');
    return;
  }

  if (currentTask) {
    currentTask.stop();
  }

  currentTask = cron.schedule(config.ingestInterval, async () => {
    await runPipeline();
  });

  console.log(`[CRON] Scheduled with interval: ${config.ingestInterval}`);

  // node-cron n'exécute jamais immédiatement au démarrage — seulement au
  // prochain créneau (jusqu'à 4h d'attente, config.ingestInterval). Sur une
  // base tout juste réinitialisée (ou une toute première installation),
  // l'utilisateur ouvrait donc un dashboard vide sans savoir qu'il devait
  // cliquer "Lancer maintenant" (trouvé le 2026-08-29). Corrigé par un
  // déclenchement immédiat, mais seulement si la veille est réellement vide
  // — jamais sur un redémarrage PM2 normal avec des données déjà présentes,
  // pour ne pas re-ingérer 60 flux RSS à chaque redéploiement.
  const db = getDb();
  const eventCount = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
  if (eventCount === 0) {
    console.log('[CRON] Aucun événement en base — déclenchement immédiat du pipeline');
    runPipeline().catch((err) => console.error('[CRON] Échec du déclenchement immédiat:', err));
  }
}

export function stopCron(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    console.log('[CRON] Stopped');
  }
}

export function getCronStatus(): {
  running: boolean;
  enabled: boolean;
  interval: string;
  nextRun: string | null;
} {
  const config = getCronConfig();
  return {
    running: isRunning,
    enabled: config.enabled,
    interval: config.ingestInterval,
    nextRun: null, // node-cron doesn't expose next run time
  };
}

export { runPipeline };
