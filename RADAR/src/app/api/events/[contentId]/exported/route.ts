import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * POST /api/events/[contentId]/exported
 *
 * Callback fire-and-forget depuis STUDIO après upload Drive réussi.
 * Marque l'article comme exporté (exported_at + drive_url).
 * Pas d'auth requise — STUDIO et RADAR partagent le même réseau interne.
 * Si l'article n'est pas trouvé, retourne 200 quand même (non-fatal).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const { contentId } = await params;
  const body = await request.json().catch(() => null);

  const driveUrl = body?.driveUrl as string | undefined;
  const carouselTexts = body?.carouselTexts as string[] | undefined;

  try {
    const db = getDb();
    const result = db
      .prepare(
        `UPDATE articles
         SET exported_at = datetime('now'),
             drive_url = ?,
             carousel_slides = ?
         WHERE content_id = ? AND exported_at IS NULL`,
      )
      .run(driveUrl ?? null, carouselTexts ? JSON.stringify(carouselTexts) : null, contentId);

    if (result.changes === 0) {
      // Article non trouvé ou déjà exporté — non-fatal
      console.log(`[callback] Article ${contentId} non trouvé ou déjà exporté`);
    }
  } catch (err) {
    console.error(`[callback] Erreur DB pour ${contentId}:`, err);
  }

  return NextResponse.json({ ok: true });
}
