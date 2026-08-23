import { NextResponse } from 'next/server';
import { parseInstagramCSV, storeStats, getStatsSummary, getAllStats } from '@/lib/stats';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'File must be a CSV' },
        { status: 400 }
      );
    }

    const csvContent = await file.text();
    const posts = parseInstagramCSV(csvContent);
    
    if (posts.length === 0) {
      return NextResponse.json(
        { error: 'No valid posts found in CSV' },
        { status: 400 }
      );
    }

    const stored = storeStats(posts, file.name);
    const summary = getStatsSummary();
    
    return NextResponse.json({
      success: true,
      imported: stored,
      summary,
    });
  } catch (error) {
    console.error('Error importing stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const summary = getStatsSummary();
    const posts = getAllStats();
    
    return NextResponse.json({
      success: true,
      summary,
      posts,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
