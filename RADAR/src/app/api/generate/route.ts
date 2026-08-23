import { NextResponse } from 'next/server';
import { generateArticle, createManualArticle, getArticles, getArticle, updateArticleStatus, DegradedModeError } from '@/lib/articles';
import { getBrief } from '@/lib/brief';
import { generateVerificationReport, verifyArticleAgainstBrief } from '@/lib/verification';
import { getDb } from '@/lib/db';
import { recordDecision, getDegradedModeStatus } from '@/lib/killswitch';

export async function POST(request: Request) {
  try {
    const { event_id, manual } = await request.json();

    if (!event_id) {
      return NextResponse.json(
        { error: 'event_id is required' },
        { status: 400 }
      );
    }

    // Mode Dégradé (Étape 3.3) : rédaction manuelle sans appel LLM
    if (manual) {
      const article = createManualArticle(event_id);
      if (!article) {
        return NextResponse.json({ error: 'Brief manquant : générez-le d\'abord' }, { status: 404 });
      }
      return NextResponse.json({ success: true, article });
    }

    let article;
    try {
      article = await generateArticle(event_id);
    } catch (err) {
      if (err instanceof DegradedModeError) {
        return NextResponse.json(
          { error: err.message, degraded: true, status: getDegradedModeStatus() },
          { status: 423 }
        );
      }
      throw err;
    }

    if (!article) {
      return NextResponse.json(
        { error: 'Event not found or brief generation failed' },
        { status: 404 }
      );
    }
    
    // Run verification after generation
    const brief = getBrief(event_id);
    if (brief) {
      const verification = verifyArticleAgainstBrief(brief, article.content, article.title);
      
      // Store verification results in database
      const db = getDb();
      db.prepare(`
        UPDATE articles 
        SET verification_score = ?, verification_issues = ?
        WHERE id = ?
      `).run(
        verification.confidenceScore,
        JSON.stringify(verification.issues),
        article.id
      );
    }
    
    return NextResponse.json({
      success: true,
      article,
    });
  } catch (error) {
    console.error('Error generating article:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    const articleId = searchParams.get('id');
    const verify = searchParams.get('verify');
    
    if (articleId) {
      const article = getArticle(parseInt(articleId));
      if (!article) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }
      
      // If verify flag is set, run verification
      if (verify === 'true') {
        const brief = getBrief(article.event_id);
        if (brief) {
          const db = getDb();
          const items = db.prepare(
            'SELECT i.* FROM items i JOIN event_items ei ON i.id = ei.item_id WHERE ei.event_id = ?'
          ).all(article.event_id) as { title: string; content: string | null }[];
          
          const verification = generateVerificationReport(
            brief,
            { title: article.title, content: article.content },
            items
          );
          
          return NextResponse.json({ 
            success: true, 
            article,
            verification 
          });
        }
      }
      
      return NextResponse.json({ success: true, article });
    }
    
    const articles = getArticles(eventId ? parseInt(eventId) : undefined);
    return NextResponse.json({ success: true, articles });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, content } = body;
    
    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }
    
    if (status) {
      updateArticleStatus(id, status);
      if (status === 'validated' || status === 'rejected') {
        recordDecision(id, status);
      }
    }
    
    if (content) {
      const db = getDb();
      const wordCount = content.split(/\s+/).length;
      db.prepare(`
        UPDATE articles SET content = ?, word_count = ?, generated_at = datetime('now') WHERE id = ?
      `).run(content, wordCount, id);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating article:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
