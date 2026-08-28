import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/carousel-package/[contentId]
 *
 * Relais serveur-à-serveur vers RADAR (`GET /api/events/[contentId]/carousel-package`)
 * — même convention que `RADAR_URL` déjà utilisé pour le callback d'export
 * (`export/route.ts`) : jamais d'appel direct du navigateur vers RADAR (pas de
 * CORS à gérer, pas de `RADAR_URL` exposé côté client).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { contentId } = await params;
  const radarUrl = process.env.RADAR_URL;
  if (!radarUrl) {
    return NextResponse.json({ error: "RADAR_URL non configuré côté STUDIO" }, { status: 500 });
  }

  try {
    // Timeout temporairement élargi (2026-08-28) pour le test du parcours
    // complet avec Ollama local (generateCarouselParagraphs peut prendre
    // plusieurs minutes sur cette machine sans GPU) — 15s convenait pour
    // Groq (généralement <2s) mais a produit un vrai 502 en test réel.
    // À revenir à une valeur courte (15-30s) avant tout déploiement prod
    // avec un fournisseur cloud rapide.
    const res = await fetch(`${radarUrl}/api/events/${encodeURIComponent(contentId)}/carousel-package`, {
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      return NextResponse.json({ error: data?.error ?? "Erreur RADAR" }, { status: res.status || 502 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "RADAR injoignable" },
      { status: 502 },
    );
  }
}
