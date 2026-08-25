import cron, { type ScheduledTask } from 'node-cron';
import { getFeeds, fetchFeed, storeItems, updateFeedLastFetched } from './rss';
import { startPipelineRun, completePipelineRun, getDb } from './db';
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
    try {
      const { embedUnprocessedItems, clusterItemsIntoEvents, calculateScores } = await import('./scoring');
      const embedded = await withTimeout(embedUnprocessedItems(), 60000);
      eventsCreated = await clusterItemsIntoEvents();
      calculateScores();
      console.log(`[CRON] Embedded: ${embedded}, Events: ${eventsCreated}`);
    } catch (error) {
      console.error('[CRON] Scoring skipped:', error instanceof Error ? error.message : error);
    }

    try {
      const cacheCleanupResult = await runCacheCleanup();
      console.log(`[CRON] Cache cleanup: ${cacheCleanupResult.pipelineRunsDeleted} runs, ${cacheCleanupResult.itemsArchived} items`);
    } catch (error) {
      console.error('[CRON] Cache cleanup error:', error);
    }

    completePipelineRun(runId, 'completed', {
      items_ingested: totalStored,
      images_found: 0,
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
