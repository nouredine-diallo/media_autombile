import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { generateTitles } from "@/lib/titles/router";
import { lookupFactsFromRadar } from "@/lib/titles/factsLookup";

export const runtime = "nodejs";

/**
 * Génération de titre — mode 2 uniquement (thème/mots-clés), le seul
 * disponible tant que RADAR n'existe pas (cahier des charges, Étape 5 :
 * "sans RADAR, ce sera toujours le mode 2, jamais le mode 1").
 *
 * Enrichissement optionnel (chantier "P3", 15 sept. 2026) : avant de générer,
 * on demande à RADAR (timeout 600ms, voir factsLookup.ts) s'il a déjà de
 * vrais faits sur ce thème. Absent/injoignable/pas de match → tableau vide,
 * le prompt retombe sur sa consigne anti-invention — jamais une erreur.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const theme = body?.theme;
  if (typeof theme !== "string" || theme.trim().length === 0) {
    return NextResponse.json({ error: "Paramètre 'theme' requis" }, { status: 400 });
  }

  try {
    const facts = await lookupFactsFromRadar(theme);
    const result = await generateTitles(theme, facts);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 },
    );
  }
}
