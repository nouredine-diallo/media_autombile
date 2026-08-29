import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Suivi léger du parcours utilisateur (2026-08-29, demande explicite) — pas
 * un pistage pixel par pixel, disproportionné pour un outil interne de 5-10
 * personnes : juste assez pour voir ce qui est réellement utilisé et où les
 * gens s'arrêtent. Tout reste dans cette base, jamais envoyé à un tiers.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventType = body?.eventType;
  const page = body?.page;
  const label = body?.label ?? null;
  const sessionId = body?.sessionId;

  if (
    (eventType !== 'page_view' && eventType !== 'action') ||
    typeof page !== 'string' ||
    typeof sessionId !== 'string'
  ) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO analytics_events (event_type, page, label, user_name, session_id) VALUES (?, ?, ?, ?, ?)`
    ).run(eventType, page, label, session.userName ?? null, sessionId);
  } catch (error) {
    // Best-effort : un échec de tracking ne doit jamais gêner l'usage réel de l'outil.
    console.error('[analytics] Erreur d\'enregistrement:', error);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const db = getDb();

  const topPages = db.prepare(
    `SELECT page, COUNT(*) as count FROM analytics_events WHERE event_type = 'page_view' GROUP BY page ORDER BY count DESC LIMIT 15`
  ).all();

  const topActions = db.prepare(
    `SELECT label, COUNT(*) as count FROM analytics_events WHERE event_type = 'action' AND label IS NOT NULL GROUP BY label ORDER BY count DESC LIMIT 15`
  ).all();

  const byUser = db.prepare(
    `SELECT COALESCE(user_name, 'inconnu') as user_name, COUNT(*) as count FROM analytics_events GROUP BY user_name ORDER BY count DESC`
  ).all();

  // Activité par jour sur les 30 derniers jours — support de la heatmap calendrier.
  const dailyActivity = db.prepare(
    `SELECT date(created_at) as day, COUNT(*) as count
     FROM analytics_events
     WHERE created_at >= date('now', '-30 days')
     GROUP BY day
     ORDER BY day ASC`
  ).all();

  const totals = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM analytics_events WHERE event_type = 'page_view') as page_views,
       (SELECT COUNT(*) FROM analytics_events WHERE event_type = 'action') as actions,
       (SELECT COUNT(DISTINCT session_id) FROM analytics_events) as sessions`
  ).get();

  return NextResponse.json({
    success: true,
    totals,
    topPages,
    topActions,
    byUser,
    dailyActivity,
  });
}
