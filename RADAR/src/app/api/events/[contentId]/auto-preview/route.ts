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
  // Finding D4 (audit 2026-09-07) : sans ce champ, un recadrage dégradé
  // (détourage indisponible) était invisible côté RADAR — voir db.ts pour
  // le détail de la migration.
  const fallbackCrop = body?.fallbackCrop === true;
  // Phase 4 du plan écosystème (2026-09-17) : carrousel automatisé —
  // `previewDataUrls` (pluriel) porte les slides quand `mode === 'carousel'`,
  // `previewDataUrl` (singulier) reste inchangé pour le mode 'single'.
  // STUDIO est la seule source de vérité sur le mode réellement produit,
  // pas RADAR (qui n'a fait qu'une demande) : un repli sur 'single' décidé
  // côté STUDIO doit se refléter ici tel qu'il a réellement eu lieu.
  const mode = body?.mode === 'carousel' ? 'carousel' : 'single';
  const previewDataUrls = Array.isArray(body?.previewDataUrls) ? (body.previewDataUrls as string[]) : undefined;

  try {
    const db = getDb();
    const result = db
      .prepare(
        `UPDATE articles
         SET auto_preview_status = ?,
             auto_preview_data_url = ?,
             auto_preview_data_urls = ?,
             auto_preview_error = ?,
             auto_preview_fallback_crop = ?,
             auto_preview_mode = ?
         WHERE content_id = ?`,
      )
      .run(
        ok ? 'ready' : 'failed',
        ok && mode === 'single' ? (previewDataUrl ?? null) : null,
        ok && mode === 'carousel' && previewDataUrls ? JSON.stringify(previewDataUrls) : null,
        ok ? null : (error ?? 'Erreur inconnue côté STUDIO'),
        ok && fallbackCrop ? 1 : 0,
        mode,
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
