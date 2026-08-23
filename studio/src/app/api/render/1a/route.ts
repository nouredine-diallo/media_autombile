import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { encrypt, getSession } from "@/lib/session";
import {
  GABARIT_1A_WIDTH,
  GABARIT_1A_HEIGHT,
} from "@/components/gabarits/Gabarit1A";

export const runtime = "nodejs";

/**
 * Rendu final haute fidélité du gabarit 1A.
 *
 * Capture la page /render/1a (qui affiche exactement le même composant
 * <Gabarit1A> que l'aperçu navigateur) avec Playwright, à la résolution
 * canvas exacte, sans mise à l'échelle. C'est ce qui garantit l'égalité
 * pixel entre aperçu et export (CLAUDE.md §1).
 *
 * Cette route est exclue du proxy d'auth (le matcher de proxy.ts ignore
 * "/api"), donc elle vérifie elle-même la session de l'appelant.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || body.title.length === 0) {
    return NextResponse.json(
      { error: "Paramètre 'title' requis (chaîne non vide)." },
      { status: 400 },
    );
  }

  const title: string = body.title;
  const imageUrl: string =
    typeof body.imageUrl === "string" && body.imageUrl.length > 0
      ? body.imageUrl
      : "/test/placeholder-photo.jpg";

  const origin = request.nextUrl.origin;

  // Cookie de session dédié au navigateur headless : ne jamais transporter le
  // cookie de l'utilisateur courant vers ce contexte serveur-à-serveur.
  // Note : encrypt() signe toujours pour 7 jours (voir src/lib/session.ts) ;
  // ce n'est pas un vrai risque ici car le token ne donne accès qu'aux mêmes
  // routes que n'importe quel utilisateur de l'équipe.
  const internalToken = await encrypt({
    userId: "internal-render",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT },
      deviceScaleFactor: 1,
    });
    await context.addCookies([
      {
        name: "session",
        value: internalToken,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();
    const params = new URLSearchParams({ title, imageUrl });
    await page.goto(`${origin}/render/1a?${params.toString()}`, {
      waitUntil: "networkidle",
    });

    const element = await page.waitForSelector('[data-gabarit="1a"]');
    const png = await element.screenshot({ type: "png" });

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
