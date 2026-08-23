import { NextResponse } from 'next/server';
import { findImagesForItems } from '@/lib/visualSearch';

export async function POST() {
  const startTime = Date.now();

  try {
    const result = await findImagesForItems();
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ...result,
      duration,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    }, { status: 500 });
  }
}
