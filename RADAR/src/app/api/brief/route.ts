import { NextResponse } from 'next/server';
import { generateBrief, getBrief } from '@/lib/brief';
import { withTimeout } from '@/lib/withTimeout';
import { AlreadyGeneratingError } from '@/lib/generationLock';

export async function POST(request: Request) {
  try {
    const { event_id } = await request.json();

    if (!event_id) {
      return NextResponse.json(
        { error: 'event_id is required' },
        { status: 400 }
      );
    }

    // Trouvé le 14 sept. 2026 : generateBrief() traduit chaque item de
    // l'event (title/summary) via un modèle local (translateLocal.ts), bloc
    // par bloc — une requête sur un event à plusieurs sources, ou tombant
    // juste après un cycle de pipeline (modèle encore sollicité), peut
    // rester bloquée bien au-delà de ce qu'un humain attend. `withTimeout`
    // ne libère pas le CPU déjà engagé dans un chunk de traduction en cours
    // (Node ne peut pas annuler un calcul synchrone en plein vol) mais
    // garantit que le NAVIGATEUR reçoit une erreur claire après 30s au lieu
    // d'un spinner infini. Le verrou anti-doublon (voir generateBrief() dans
    // brief.ts) vit désormais au niveau de la fonction, pas de cette route —
    // il protège aussi bien cet appel HTTP que l'appel interne fait par
    // generateArticle()/autoGenerate.ts (cron), qui ne passe jamais par ici.
    const brief = await withTimeout(
      generateBrief(event_id),
      30_000,
      'La génération du brief a dépassé 30s (modèle de traduction probablement occupé) — réessayez dans un instant'
    );

    if (!brief) {
      return NextResponse.json(
        { error: 'Event not found or no items available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      brief,
    });
  } catch (error) {
    if (error instanceof AlreadyGeneratingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error generating brief:', error);
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

    if (!eventId) {
      return NextResponse.json(
        { error: 'event_id query parameter is required' },
        { status: 400 }
      );
    }

    const brief = getBrief(parseInt(eventId));

    if (!brief) {
      return NextResponse.json(
        { error: 'Brief not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      brief,
    });
  } catch (error) {
    console.error('Error fetching brief:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
