import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { encrypt, getSession } from "@/lib/session";
import { GABARITS, GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";

export const runtime = "nodejs";

/**
 * Export générique — miroir de /api/render/1a (Étape 1) pour les gabarits
 * ajoutés en Étape 4. Même garantie : capture la page /render/[gabaritId],
 * qui affiche exactement le même composant que l'aperçu navigateur.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gabaritId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { gabaritId } = await params;
  const def = GABARITS[gabaritId];
  if (!def) {
    return NextResponse.json({ error: "Gabarit inconnu" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const fieldValues: Record<string, string> = {};
  for (const field of def.fields) {
    const value = body[field.key];
    fieldValues[field.key] =
      typeof value === "string" && value.length > 0
        ? value
        : (def.defaults[field.key] ?? "");
  }

  const origin = request.nextUrl.origin;

  // Cookie de session dédié au navigateur headless (voir /api/render/1a pour le détail).
  const internalToken = await encrypt({
    userId: "internal-render",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: GABARIT_WIDTH, height: GABARIT_HEIGHT },
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
    const searchParams = new URLSearchParams(fieldValues);
    await page.goto(`${origin}/render/${gabaritId}?${searchParams.toString()}`, {
      waitUntil: "networkidle",
    });

    const element = await page.waitForSelector(`[data-gabarit="${gabaritId}"]`);
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
