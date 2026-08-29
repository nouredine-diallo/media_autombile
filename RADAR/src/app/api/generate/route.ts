import { NextResponse } from 'next/server';
import { generateAndVerifyArticle, createManualArticle, getArticles, getArticle, updateArticleStatus, DegradedModeError } from '@/lib/articles';
import { getBrief } from '@/lib/brief';
import { generateVerificationReport } from '@/lib/verification';
import { getDb } from '@/lib/db';
import { recordDecision, getDegradedModeStatus } from '@/lib/killswitch';
import { generateArticleDeadlines } from '@/lib/calendar';
import { getBestImageForEvent } from '@/lib/visualSearch';
import { triggerAutoGenerate } from '@/lib/studioAutoGenerate';

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

    let result;
    try {
      result = await generateAndVerifyArticle(event_id);
    } catch (err) {
      if (err instanceof DegradedModeError) {
        return NextResponse.json(
          { error: err.message, degraded: true, status: getDegradedModeStatus() },
          { status: 423 }
        );
      }
      throw err;
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Event not found or brief generation failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      article: result.article,
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
      if (status === 'validated') {
        // Anticipe le besoin : dès la validation, une échéance de publication
        // apparaît au calendrier — plus besoin d'aller cliquer "Générer
        // deadlines" séparément. Idempotent (ne crée rien si déjà fait).
        generateArticleDeadlines();

        // Parcours "un seul geste de décision" (plan écosystème 2026-08-29) :
        // dès la validation humaine de l'article, préparer automatiquement le
        // visuel STUDIO (gabarit 1A, titre déjà validé par l'humain) pour que
        // /ready affiche article + visuel prêts à confirmer. Fire-and-forget
        // — ne doit jamais retarder la réponse de validation. Sauté sans bruit
        // si l'article n'a ni content_id ni visuel source (cas déjà géré par
        // le bouton manuel "Créer un post" existant sur /ready).
        const db = getDb();
        const article = db.prepare(
          `SELECT content_id, event_id, title FROM articles WHERE id = ?`
        ).get(id) as { content_id: string | null; event_id: number; title: string } | undefined;
        if (article?.content_id) {
          const imageUrl = getBestImageForEvent(article.event_id);
          if (imageUrl) {
            triggerAutoGenerate(id, article.content_id, article.title, imageUrl).catch((err) => {
              console.error('[generate] triggerAutoGenerate a levé une exception:', err);
            });
          }
        }
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
