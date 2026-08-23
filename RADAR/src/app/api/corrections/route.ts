import { NextResponse } from 'next/server';
import { addCorrection, getCorrections, getCorrection, deleteCorrection, analyzePatterns, exportCorrectionsCSV } from '@/lib/corrections';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { article_id, generated_text, corrected_text, correction_type, pattern_observed, notes } = body;
    
    if (!article_id || !generated_text || !corrected_text) {
      return NextResponse.json(
        { error: 'article_id, generated_text, and corrected_text are required' },
        { status: 400 }
      );
    }
    
    const correction = addCorrection({
      article_id,
      generated_text,
      corrected_text,
      correction_type,
      pattern_observed,
      notes,
    });
    
    return NextResponse.json({
      success: true,
      correction,
    });
  } catch (error) {
    console.error('Error adding correction:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get('article_id');
    const id = searchParams.get('id');
    const action = searchParams.get('action');
    
    if (action === 'analyze') {
      const analysis = analyzePatterns();
      return NextResponse.json({ success: true, analysis });
    }
    
    if (action === 'export') {
      const csv = exportCorrectionsCSV();
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="corrections.csv"',
        },
      });
    }
    
    if (id) {
      const correction = getCorrection(parseInt(id));
      if (!correction) {
        return NextResponse.json({ error: 'Correction not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, correction });
    }
    
    const corrections = getCorrections(articleId ? parseInt(articleId) : undefined);
    return NextResponse.json({ success: true, corrections });
  } catch (error) {
    console.error('Error fetching corrections:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }
    
    deleteCorrection(parseInt(id));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting correction:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
