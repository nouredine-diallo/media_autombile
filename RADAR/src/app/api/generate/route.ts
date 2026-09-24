import { NextResponse } from 'next/server';
import { generateAndVerifyArticle, createManualArticle, getArticles, getArticle, updateArticleStatus, DegradedModeError } from '@/lib/articles';
import { getBrief } from '@/lib/brief';
import { generateVerificationReport } from '@/lib/verification';
import { getDb } from '@/lib/db';
import { recordDecision, getDegradedModeStatus } from '@/lib/killswitch';
import { finalizeArticleValidation } from '@/lib/validation';
import { withTimeout } from '@/lib/withTimeout';
import { AlreadyGeneratingError } from '@/lib/generationLock';

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

    // Trouvé le 15 sept. 2026 : la génération d'article (routeur LLM,
    // chaîné en 2 passes) n'avait AUCUNE limite de temps côté serveur alors
    // que le timeout client (apiFetch) est plus court que ce qu'elle peut
    // légitimement prendre (RADAR/CLAUDE.md §11 : 30s à 2min) — un client
    // qui abandonne avant la fin ne l'arrête pas. Le verrou anti-doublon vit
    // au niveau de generateAndVerifyArticle() (articles.ts), pas ici : il
    // protège aussi bien cet appel HTTP que l'appel direct fait par
    // runMorningAutoGeneration (autoGenerate.ts, cron), qui ne passe jamais
    // par cette route.
    let result;
    try {
      result = await withTimeout(
        generateAndVerifyArticle(event_id),
        110_000,
        'La génération de l\'article a dépassé 110s (fournisseur LLM probablement lent/occupé) — réessayez dans un instant'
      );
    } catch (err) {
      if (err instanceof DegradedModeError) {
        return NextResponse.json(
          { error: err.message, degraded: true, status: getDegradedModeStatus() },
          { status: 423 }
        );
      }
      if (err instanceof AlreadyGeneratingError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
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
    
    if (status === 'validated') {
      // Toute la séquence (statut, décision, traçabilité, créneau, visuel
      // STUDIO) vit dans finalizeArticleValidation — réutilisée telle
      // quelle par l'auto-validation du matin (autoGenerate.ts), pour que
      // les deux voies produisent exactement le même résultat.
      //
      // Finding D5 (audit 2026-09-07) : deux clics "Confirmer" à quelques
      // centaines de ms d'écart pouvaient chacun réussir et déclencher leur
      // propre export Drive du même article. `applied` est `false` quand
      // l'article était déjà validé — les effets de bord (dont l'export)
      // ne sont alors pas rejoués, et on le dit explicitement au client
      // plutôt que de laisser croire à un second succès silencieux.
      const applied = finalizeArticleValidation(id, 'humain');
      if (!applied) {
        return NextResponse.json({ success: true, alreadyValidated: true });
      }
    } else if (status) {
      // Même correctif que finalizeArticleValidation (validation.ts,
      // audit robustesse du 24 sept. 2026) : les deux écritures dans une
      // seule transaction, pour ne jamais laisser un article "rejected" en
      // base sans la ligne article_decisions qui alimente le kill-switch et
      // la calibration.
      const db = getDb();
      db.transaction(() => {
        updateArticleStatus(id, status);
        if (status === 'rejected') {
          recordDecision(id, status, 'humain');
        }
      })();
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
