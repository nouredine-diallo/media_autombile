import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBrief, getCarouselSlides } from "@/lib/brief";
import { getSortedImagesForEvent } from "@/lib/visualSearch";

/**
 * GET /api/events/[contentId]/carousel-package
 *
 * Nouveau chemin de handoff RADAR→STUDIO pour les carrousels multi-slides —
 * en plus du `?prefill=` existant (single-image), jamais à sa place (voir
 * docs/superpowers/plans/2026-08-26-ecosystem-editorial-v2.md §6, étape C).
 * STUDIO n'appelle cette route que si le lien reçu porte `carousel=1`.
 *
 * Ne renvoie pas de texte de CTA : le message par défaut appartient déjà à
 * STUDIO (`GabaritCTA.tsx`, `CTA_DEFAUT`) — le dupliquer ici créerait deux
 * sources de vérité pour le même texte éditorial.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const { contentId } = await params;
  const db = getDb();

  const article = db
    .prepare(`SELECT id, event_id, title, content_id FROM articles WHERE content_id = ?`)
    .get(contentId) as { id: number; event_id: number; title: string; content_id: string } | undefined;

  if (!article) {
    return NextResponse.json({ error: "Article introuvable pour ce content_id" }, { status: 404 });
  }

  const event = db
    .prepare(`SELECT id, score, title, title_fr FROM events WHERE id = ?`)
    .get(article.event_id) as { id: number; score: number; title: string; title_fr: string | null } | undefined;

  if (!event) {
    return NextResponse.json({ error: "Événement introuvable pour cet article" }, { status: 404 });
  }

  const brief = getBrief(event.id);
  const slides = await getCarouselSlides(event.id);

  // Images triées par pertinence au titre de l'article — voir
  // getSortedImagesForEvent() (visualSearch.ts) pour le raisonnement complet
  // (extrait ici le 2026-09-17, phase 4 du plan écosystème, pour être aussi
  // appelable par l'automatisation serveur-à-serveur sans dupliquer ce tri).
  const images = getSortedImagesForEvent(event.id, article.title);

  return NextResponse.json({
    contentId: article.content_id,
    title: article.title,
    images,
    devSlides: slides?.dev ?? [],
    pertinent: slides?.pertinent ?? false,
    score: event.score,
    briefHeadline: brief?.headline ?? null,
  });
}
