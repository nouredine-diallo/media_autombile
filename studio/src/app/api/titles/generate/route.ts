import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { generateTitles } from "@/lib/titles/router";

export const runtime = "nodejs";

/**
 * Génération de titre — mode 2 uniquement (thème/mots-clés), le seul
 * disponible tant que RADAR n'existe pas (cahier des charges, Étape 5 :
 * "sans RADAR, ce sera toujours le mode 2, jamais le mode 1").
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
    const result = await generateTitles(theme);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 },
    );
  }
}
