import cron, { type ScheduledTask } from 'node-cron';
import { getFeeds, fetchFeed, storeItems, updateFeedLastFetched } from './rss';
import { findImagesForItems, cleanupVisualCache, preflightItemsWithoutVerdict } from './visualSearch';
import { startPipelineRun, completePipelineRun, getDb } from './db';
import { batchAutoFlag } from './autoFlag';
import { runCacheCleanup } from './cacheCleanup';

interface CronConfig {
  ingestInterval: string;  // cron expression, default: every 4 hours
  enabled: boolean;
}

const DEFAULT_CONFIG: CronConfig = {
  ingestInterval: '0 */4 * * *', // every 4 hours
  enabled: true,
};

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
    // Step 1: Ingest RSS feeds
    const feeds = getFeeds().filter(f => f.requires_scraping === 0);
    let totalStored = 0;

    for (const feed of feeds) {
      try {
        const items = await fetchFeed(feed);
        const { stored } = storeItems(feed.id, items);
        updateFeedLastFetched(feed.id);
        totalStored += stored;
      } catch (error) {
        console.error(`[CRON] Error ingesting ${feed.name}:`, error);
      }
    }

    console.log(`[CRON] Ingested ${totalStored} new items`);

    // Step 2: Visual search for items without images
    let imagesFound = 0;
    try {
      const imageResult = await findImagesForItems();
      imagesFound = imageResult.found;
      console.log(`[CRON] Found ${imagesFound} images`);
    } catch (error) {
      console.error('[CRON] Visual search error:', error);
    }

    // Step 3: Run embedding + clustering + scoring
    try {
      const { embedUnprocessedItems, clusterItemsIntoEvents, calculateScores } = await import('./scoring');
      const embedded = await embedUnprocessedItems();
      const events = await clusterItemsIntoEvents();
      calculateScores();
      console.log(`[CRON] Embedded: ${embedded}, Events: ${events}`);
    } catch (error) {
      console.error('[CRON] Scoring error:', error);
    }

    // Step 4: Clean up old visual-cache files (>72h)
    let cacheCleaned = 0;
    try {
      const cacheResult = cleanupVisualCache();
      cacheCleaned = cacheResult.removed;
      if (cacheCleaned > 0) {
        console.log(`[CRON] Visual cache cleanup: ${cacheCleaned} old files removed, ${cacheResult.kept} kept`);
      }
    } catch (error) {
      console.error('[CRON] Cache cleanup error:', error);
    }

    // Step 5: Preflight — check gabarit compatibility for images without verdict
    let preflied = 0;
    try {
      const preflightResult = await preflightItemsWithoutVerdict();
      preflied = preflightResult.checked;
      if (preflied > 0) {
        console.log(`[CRON] Preflight: ${preflied} images checked — ${preflightResult.ok} ok, ${preflightResult.marginal} marginal, ${preflightResult.bad} bad`);
      }
    } catch (error) {
      console.error('[CRON] Preflight error:', error);
    }

    // Step 6: Auto-flag low quality images
    let autoFlagged = 0;
    try {
      const flagResult = await batchAutoFlag();
      autoFlagged = flagResult.flagged;
      if (autoFlagged > 0) {
        console.log(`[CRON] Auto-flag: ${autoFlagged} images analysed — ${flagResult.ok} ok, ${flagResult.marginal} marginal, ${flagResult.bad} bad`);
      }
    } catch (error) {
      console.error('[CRON] Auto-flag error:', error);
    }

    // Step 7: Cache cleanup and archival
    let cacheCleanupResult = null;
    try {
      cacheCleanupResult = await runCacheCleanup();
      console.log(`[CRON] Cache cleanup: ${cacheCleanupResult.pipelineRunsDeleted} runs, ${cacheCleanupResult.itemsArchived} items, ${cacheCleanupResult.eventsDeleted} events, ${cacheCleanupResult.calendarEventsDeleted} calendar events`);
    } catch (error) {
      console.error('[CRON] Cache cleanup error:', error);
    }

    completePipelineRun(runId, 'completed', {
      items_ingested: totalStored,
      images_found: imagesFound,
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
