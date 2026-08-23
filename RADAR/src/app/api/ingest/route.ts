import { NextResponse } from 'next/server';
import { getFeeds, fetchFeed, storeItems, updateFeedLastFetched } from '@/lib/rss';
import { findImagesForItems } from '@/lib/visualSearch';
import { startPipelineRun, completePipelineRun } from '@/lib/db';

export async function POST() {
  const runId = startPipelineRun('full');
  const feeds = getFeeds().filter(f => f.requires_scraping === 0);
  const results: { feed: string; stored: number; duplicates: number; error?: string }[] = [];
  let totalStored = 0;

  for (const feed of feeds) {
    try {
      const items = await fetchFeed(feed);
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

  // Step 2: Auto-trigger visual search for new items
  let imagesFound = 0;
  try {
    const imageResult = await findImagesForItems();
    imagesFound = imageResult.found;
  } catch (error) {
    console.error('Visual search failed after ingest:', error);
  }

  // Step 3: Embedding + clustering + scoring (NEW — was missing)
  let eventsCreated = 0;
  try {
    const { embedUnprocessedItems, clusterItemsIntoEvents, calculateScores } = await import('@/lib/scoring');
    const embedded = await embedUnprocessedItems();
    eventsCreated = await clusterItemsIntoEvents();
    calculateScores();
    console.log(`[INGEST] Embedded: ${embedded}, Events: ${eventsCreated}`);
  } catch (error) {
    console.error('[INGEST] Scoring/clustering error:', error);
  }

  completePipelineRun(runId, 'completed', {
    items_ingested: totalStored,
    events_created: eventsCreated,
    images_found: imagesFound,
  });

  return NextResponse.json({
    success: true,
    fetchedAt: new Date().toISOString(),
    results,
    imagesFound,
    eventsCreated,
  });
}

export async function GET() {
  const feeds = getFeeds();
  return NextResponse.json({ feeds });
}
