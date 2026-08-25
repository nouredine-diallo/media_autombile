import { NextResponse } from 'next/server';
import { getFeeds, fetchFeed, storeItems, updateFeedLastFetched } from '@/lib/rss';
import { startPipelineRun, completePipelineRun } from '@/lib/db';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))]);
}

export async function POST() {
  const runId = startPipelineRun('full');
  const feeds = getFeeds().filter(f => f.requires_scraping === 0);
  const results: { feed: string; stored: number; duplicates: number; error?: string }[] = [];
  let totalStored = 0;

  for (const feed of feeds) {
    try {
      const items = await withTimeout(fetchFeed(feed), 12000);
      const { stored, duplicates } = storeItems(feed.id, items);
      updateFeedLastFetched(feed.id);
      results.push({ feed: feed.name, stored, duplicates });
      totalStored += stored;
    } catch (error) {
      results.push({
        feed: feed.name,
        stored: 0,
        duplicates: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Step 2: Embedding + clustering + scoring (optional — skip if model unavailable)
  let eventsCreated = 0;
  try {
    const { embedUnprocessedItems, clusterItemsIntoEvents, calculateScores } = await import('@/lib/scoring');
    const embedded = await withTimeout(embedUnprocessedItems(), 60000);
    eventsCreated = await clusterItemsIntoEvents();
    calculateScores();
    console.log(`[INGEST] Embedded: ${embedded}, Events: ${eventsCreated}`);
  } catch (error) {
    console.error('[INGEST] Scoring/clustering skipped:', error instanceof Error ? error.message : error);
  }

  completePipelineRun(runId, 'completed', {
    items_ingested: totalStored,
    events_created: eventsCreated,
    images_found: 0,
  });

  return NextResponse.json({
    success: true,
    fetchedAt: new Date().toISOString(),
    results,
    imagesFound: 0,
    eventsCreated,
  });
}

export async function GET() {
  const feeds = getFeeds();
  return NextResponse.json({ feeds });
}
