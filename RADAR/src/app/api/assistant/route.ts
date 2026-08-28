import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { answerQuery, getRadarStarters, getRadarFiche, RADAR_KNOWLEDGE_RESOLVED } from '@/lib/assistant/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASSISTANT_ENABLED = process.env.ASSISTANT_ENABLED !== 'false';

async function assertEnabled() {
  if (!ASSISTANT_ENABLED) {
    return { error: NextResponse.json({ error: 'Assistant désactivé' }, { status: 503 }) };
  }
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const res = await assertEnabled();
  if (res.error) return res.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    // Lookup déterministe (clic sur une chip starter/liée) — jamais une
    // nouvelle recherche floue pour un choix déjà identifié par son id.
    const fiche = getRadarFiche(id);
    if (!fiche) {
      return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      reply: {
        match: fiche,
        matchRelated: (fiche.related ?? [])
          .map((rid) => getRadarFiche(rid))
          .filter((f): f is NonNullable<typeof f> => Boolean(f))
          .map((f) => ({ id: f.id, title: f.title })),
        suggestions: [],
        directory: RADAR_KNOWLEDGE_RESOLVED.map((f) => f.title),
        confidence: 1,
      },
    });
  }

  return NextResponse.json({ success: true, starters: getRadarStarters() });
}

export async function POST(request: Request) {
  try {
    const res = await assertEnabled();
    if (res.error) return res.error;

    const { q } = await request.json();
    if (typeof q !== 'string' || q.trim().length === 0) {
      return NextResponse.json(
        { error: 'Question vide' },
        { status: 400 }
      );
    }

    const reply = answerQuery(q.trim(), RADAR_KNOWLEDGE_RESOLVED);
    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error('Assistant error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}