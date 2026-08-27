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
    const res = await fetch(`${radarUrl}/api/events/${encodeURIComponent(contentId)}/carousel-package`, {
      signal: AbortSignal.timeout(15000),
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
