import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * POST /api/events/[contentId]/auto-preview
 *
 * Callback fire-and-forget depuis STUDIO (`runAutoGenerate`) une fois le
 * visuel du gabarit 1A rendu — ou en cas d'échec (image introuvable, STUDIO
 * en mode dégradé, etc.). Même contrat de sécurité que
 * `/api/events/[contentId]/exported` (§9b RADAR/CLAUDE.md) : réseau interne
 * partagé, pas d'auth, toujours 200 même si l'article est introuvable.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const { contentId } = await params;
  const body = await request.json().catch(() => null);

  const ok = body?.ok === true;
  const previewDataUrl = body?.previewDataUrl as string | undefined;
  const error = body?.error as string | undefined;

  try {
    const db = getDb();
    const result = db
      .prepare(
        `UPDATE articles
         SET auto_preview_status = ?,
             auto_preview_data_url = ?,
             auto_preview_error = ?
         WHERE content_id = ?`,
      )
      .run(
        ok ? 'ready' : 'failed',
        ok ? (previewDataUrl ?? null) : null,
        ok ? null : (error ?? 'Erreur inconnue côté STUDIO'),
        contentId,
      );

    if (result.changes === 0) {
      console.log(`[auto-preview] Article ${contentId} non trouvé`);
    }
  } catch (err) {
    console.error(`[auto-preview] Erreur DB pour ${contentId}:`, err);
  }

  return NextResponse.json({ ok: true });
}
