import { NextResponse } from 'next/server';
import { embedUnprocessedItems, clusterItemsIntoEvents, calculateScores } from '@/lib/scoring';

export async function POST() {
  const startTime = Date.now();
  const results: {
    embedded: number;
    events: number;
    duration: number;
    error?: string;
  } = {
    embedded: 0,
    events: 0,
    duration: 0,
  };

  try {
    // Step 1: Generate embeddings for unprocessed items
    console.log('Step 1: Generating embeddings...');
    results.embedded = await embedUnprocessedItems();
    console.log(`Embedded ${results.embedded} items`);

    // Step 2: Cluster items into events
    console.log('Step 2: Clustering items into events...');
    results.events = await clusterItemsIntoEvents();
    console.log(`Created ${results.events} events`);

    // Step 3: Calculate composite scores
    console.log('Step 3: Calculating scores...');
    calculateScores();
    console.log('Scores calculated');

    results.duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    results.duration = Date.now() - startTime;
    results.error = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('Error processing items:', error);
    
    return NextResponse.json({
      success: false,
      ...results,
    }, { status: 500 });
  }
}
