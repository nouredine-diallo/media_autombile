import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getSession } from "@/lib/session";
import { resolveVariantPath } from "@/lib/images/store";
import { checkGabaritFit } from "@/lib/images/gabaritFit";

export const runtime = "nodejs";

/**
 * Contrôle qualité "ce fond va-t-il avec ce gabarit ?" — à appeler AVANT de
 * proposer un rendu à l'opérateur. Ne modifie rien : renvoie un diagnostic
 * chiffré et une suggestion, l'humain tranche (CLAUDE.md §2).
 *
 * GET /api/images/<id>/gabarit-fit?gabarit=3a
 *
 * Nécessite que la découpe du sujet du fond existe déjà
 * (`POST /api/images/<id>/segment`) — sinon 409, jamais une réponse
 * rassurante calculée sur rien.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const gabaritId = request.nextUrl.searchParams.get("gabarit") ?? "3a";

  // Toutes les familles composent la photo dans la même zone : une seule
  // découpe à mesurer, celle du fond.
  const subjectPath = await resolveVariantPath(id, "subject");
  if (!subjectPath) {
    return NextResponse.json(
      { error: `Découpe absente — lancer d'abord POST /api/images/${id}/segment.` },
      { status: 409 },
    );
  }

  const report = await checkGabaritFit(await readFile(subjectPath), gabaritId);
  return NextResponse.json(report);
}
