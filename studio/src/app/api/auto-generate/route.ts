import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { runAutoGenerate, notifyRadarAutoPreview } from "@/lib/autoGenerate";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/auto-generate — endpoint serveur-à-serveur (RADAR → STUDIO),
 * même protection que /api/images/import (secret partagé, pas de session
 * navigateur). Déclenché une seule fois : quand un article RADAR passe à
 * 'validated' (PATCH /api/generate côté RADAR).
 *
 * Génère un APERÇU du gabarit 1A (image + titre déjà validé par RADAR) et le
 * renvoie à RADAR par callback — n'exporte jamais vers Drive ici, ça reste le
 * rôle exclusif de /api/auto-generate/confirm, déclenché par le clic humain
 * "Confirmer" (studio/CLAUDE.md §2 : jamais de validation sans confirmation
 * humaine explicite).
 *
 * Répond immédiatement (202) et poursuit en tâche de fond — même idiome que
 * /api/export (le client STUDIO ne recevrait de toute façon jamais cette
 * réponse : RADAR l'appelle en fire-and-forget).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-import-secret");
  if (!secret || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const contentId = body?.contentId;
  const title = body?.title;
  const imageUrl = body?.imageUrl;

  if (typeof contentId !== "string" || !contentId) {
    return NextResponse.json({ error: "contentId requis" }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title requis" }, { status: 400 });
  }
  if (typeof imageUrl !== "string" || !imageUrl) {
    return NextResponse.json({ error: "imageUrl requis" }, { status: 400 });
  }

  runAutoGenerate({ contentId, title, imageUrl, origin: request.nextUrl.origin }).catch((err) => {
    console.error(`[auto-generate] Échec pour ${contentId}:`, err);
    notifyRadarAutoPreview(contentId, {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    });
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
