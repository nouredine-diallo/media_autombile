import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBrief, getCarouselSlides } from "@/lib/brief";
import { getItemImages } from "@/lib/rss";

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

  // Images : toutes les candidates connues pour les items de l'événement,
  // dédupliquées en conservant l'ordre (meilleure d'abord par item). Repli sur
  // `items.image_url` pour les items plus anciens sans ligne `item_images`
  // (migration additive, voir étape A).
  const items = db
    .prepare(
      `SELECT i.id, i.image_url, i.image_source
       FROM items i
       JOIN event_items ei ON ei.item_id = i.id
       WHERE ei.event_id = ? AND i.image_url IS NOT NULL`
    )
    .all(event.id) as Array<{ id: number; image_url: string; image_source: string | null }>;

  const seen = new Set<string>();
  const images: Array<{ url: string; source: string | null }> = [];
  for (const item of items) {
    const candidates = getItemImages(item.id);
    const list = candidates.length > 0
      ? candidates.map(c => ({ url: c.url, source: c.source }))
      : [{ url: item.image_url, source: item.image_source }];
    for (const img of list) {
      if (!img.url || seen.has(img.url)) continue;
      seen.add(img.url);
      images.push(img);
    }
  }

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
