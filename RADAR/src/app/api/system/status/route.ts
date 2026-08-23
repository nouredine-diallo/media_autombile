import { NextResponse } from 'next/server';
import { getDegradedModeStatus } from '@/lib/killswitch';

export async function GET() {
  try {
    const status = getDegradedModeStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    console.error('Error fetching system status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
