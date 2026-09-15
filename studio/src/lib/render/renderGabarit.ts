import "server-only";
import { chromium } from "playwright";
import { encrypt } from "@/lib/session";
import { GABARITS, GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";

/**
 * Trouvé le 15 sept. 2026, en testant un export réel en prod (RADAR→STUDIO
 * et STUDIO seul) : depuis l'activation HTTPS (14 sept.), `request.nextUrl.origin`
 * vaut `https://...` (nginx transmet `X-Forwarded-Proto: https`), mais le
 * process Next interne ne sert QUE du HTTP en clair sur son port loopback —
 * seul nginx termine le TLS. Le navigateur headless qui capture le rendu
 * (même process serveur) tentait donc de se joindre lui-même en HTTPS sur
 * son propre port interne → `net::ERR_SSL_PROTOCOL_ERROR`, et **tous les
 * exports échouaient en prod** (job status `error`, vérifié par appel API
 * réel, pas supposé). Cet appel est un aller-retour serveur→serveur, jamais
 * un lien cliqué par un navigateur externe — même principe déjà appliqué à
 * `STUDIO_IMPORT_URL` (RADAR/CLAUDE.md §9b) : toujours viser l'adresse
 * interne en clair, jamais l'origine publique de la requête qui déclenche
 * le rendu. Utilisée par les 4 points d'entrée qui lancent ce même
 * Chromium interne (`api/export`, `api/render/1a`, `api/render/[gabaritId]`,
 * et cette fonction) pour ne pas dupliquer 4 fois la même correction.
 */
export function getInternalRenderOrigin(): string {
  return `http://127.0.0.1:${process.env.PORT || 3002}`;
}

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
  // `photoHeight` (hauteur adaptative de la zone photo, 62-74%, calculée à
  // l'upload — voir smartCrop.ts) n'est pas un champ éditable, donc jamais
  // déclaré dans `def.fields` : sans ce passage explicite, il était toujours
  // perdu ici et l'export retombait sur le défaut (74%), quelle que soit la
  // vraie valeur montrée dans l'aperçu — trouvé le 2026-09-14 en vérifiant
  // que le recadrage manuel du fond exporte bien la même image que l'aperçu.
  if (fieldValues.photoHeight) resolved.photoHeight = fieldValues.photoHeight;

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
