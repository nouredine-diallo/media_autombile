import "server-only";
import { chromium } from "playwright";
import { encrypt } from "@/lib/session";
import { GABARITS, GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";

/**
 * Rendu Playwright partagé — extrait de /api/render/[gabaritId] (Étape 4)
 * pour être appelable aussi bien depuis une requête HTTP classique que
 * depuis la tâche de fond de l'Étape 6 (/api/export), sans dupliquer la
 * logique Chromium (CLAUDE.md §1 : zéro écart aperçu/export, un seul chemin
 * de rendu). Capture toujours /render/[gabaritId], la même page que
 * l'aperçu navigateur affiche via le même composant React.
 */
export async function renderGabaritToPng(
  gabaritId: string,
  fieldValues: Record<string, string>,
  origin: string,
): Promise<Buffer> {
  const def = GABARITS[gabaritId];
  if (!def) {
    throw new Error(`Gabarit inconnu : ${gabaritId}`);
  }

  const resolved: Record<string, string> = {};
  for (const field of def.fields) {
    const value = fieldValues[field.key];
    resolved[field.key] = value && value.length > 0 ? value : (def.defaults[field.key] ?? "");
  }

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
    const searchParams = new URLSearchParams(resolved);
    await page.goto(`${origin}/render/${gabaritId}?${searchParams.toString()}`, {
      waitUntil: "load",
    });

    const element = await page.waitForSelector(`[data-gabarit="${gabaritId}"]`);
    const png = await element.screenshot({ type: "png" });
    return Buffer.from(png);
  } finally {
    await browser.close();
  }
}
