import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "@/lib/images/store";
import { cropToAspectSmart } from "@/lib/images/pipeline";
import { retirerBandes } from "@/lib/images/trimBandes";
import { GABARIT_1A_WIDTH, GABARIT_1A_HEIGHT, GABARIT_PHOTO_HEIGHT } from "@/components/gabarits/Gabarit1A";
import { renderGabaritToPng } from "@/lib/render/renderGabarit";
import { assembleSlides, MAX_CAROUSEL_IMAGES, type AssembleSlidesImage } from "@/lib/carousel/assemble";
import type { CarouselSlideSpec } from "@/lib/jobs/store";

const CONTENT_ID_RE = /^[A-Za-z0-9_-]+$/;
const PREVIEWS_DIR = path.join(UPLOADS_DIR, "..", "previews");
const DOWNLOAD_TIMEOUT_MS = 15_000;
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export interface AutoGenerateParams {
  contentId: string;
  title: string;
  imageUrl: string;
  origin: string;
}

/** Variante carrousel de `AutoGenerateParams` — phase 4 du plan écosystème (2026-09-17). */
export interface AutoGenerateCarouselParams {
  contentId: string;
  title: string;
  images: Array<{ url: string; source: string | null }>;
  devSlides: string[];
  origin: string;
}

/**
 * Sidecar persisté sur disque pour reconfirmer un export identique plus
 * tard (`/api/auto-generate/confirm`). `slidesSpec` (carrousel) et
 * `gabaritId`/`fieldValues` (single) sont mutuellement exclusifs — même
 * dualité que `ExportJob` (`lib/jobs/store.ts`), pas une coïncidence : le
 * confirm rejoue exactement ce que l'aperçu a préparé, quel que soit le mode.
 */
export interface AutoGenerateSidecar {
  gabaritId?: string;
  fieldValues?: Record<string, string>;
  slidesSpec?: CarouselSlideSpec[];
  /** Légende à déposer avec l'export carrousel (mode carrousel uniquement). */
  caption?: string;
  createdAt: string;
}

function sidecarPath(contentId: string): string {
  return path.join(PREVIEWS_DIR, `${contentId}.json`);
}

/**
 * Télécharge une image candidate et produit ses variantes recadrées
 * (fond plein cadre + recadrage strict, gabarits famille 1) — étape 1+2 de
 * `runAutoGenerate`, extraite le 2026-09-17 (phase 4 du plan écosystème)
 * pour être réutilisée aussi par `runAutoGenerateCarousel` sans dupliquer
 * le téléchargement/recadrage à chaque image du lot.
 */
async function downloadAndCropImage(imageUrl: string, origin: string): Promise<AssembleSlidesImage & { fallbackToCenter: boolean }> {
  const parsedUrl = new URL(imageUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("imageUrl invalide");
  }

  const id = randomUUID();
  const dir = path.join(UPLOADS_DIR, id);
  await mkdir(dir, { recursive: true });

  // --- 1. Téléchargement (même pipeline que /api/images/import, serveur-à-serveur) ---
  const res = await fetch(parsedUrl.href, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Téléchargement image échoué (${res.status})`);
  }
  const contentType = res.headers.get("content-type");
  if (!contentType?.startsWith("image/")) {
    throw new Error(`Type d'image non supporté : ${contentType ?? "inconnu"}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5000) {
    throw new Error("Image trop petite (< 5 Ko)");
  }
  const ext = ALLOWED_MIME[contentType.split(";")[0]] ?? "jpg";
  const originalPath = path.join(dir, `original.${ext}`);
  await writeFile(originalPath, buffer);

  // --- 2. Retirer les bandes éventuelles + recadrage smart (fond plein cadre, gabarit 1A) ---
  const sourcePath = path.join(dir, "source.jpg");
  await retirerBandes(originalPath, sourcePath);

  const croppedPath = path.join(dir, "cropped.jpg");
  const backdropPath = path.join(dir, "backdrop.jpg");
  // Finding D4 (audit 2026-09-07) : la valeur de retour était jetée ici —
  // contrairement au chemin d'upload manuel (upload/route.ts), qui capture
  // et transmet déjà `outcome`. `backdrop` est la variante utilisée comme
  // `imageUrl` plus bas (fond plein cadre du gabarit 1A) : c'est son
  // `fallbackToCenter` qui compte pour ce chemin précis.
  const cropOutcome = await cropToAspectSmart(
    sourcePath,
    croppedPath,
    backdropPath,
    { width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT },
    { width: GABARIT_1A_WIDTH, height: GABARIT_PHOTO_HEIGHT },
  );

  return {
    backdropUrl: `${origin}/api/images/${id}?variant=backdrop`,
    croppedUrl: `${origin}/api/images/${id}?variant=cropped`,
    fallbackToCenter: cropOutcome.backdrop.fallbackToCenter,
  };
}

/**
 * Génération automatique du visuel "1 image + titre" (gabarit 1A) depuis un
 * article RADAR déjà validé — parcours "un seul geste de décision" (plan
 * écosystème 2026-08-29). Ne réutilise volontairement PAS le routeur LLM de
 * titres (`titles/router.ts`) : RADAR fournit déjà un titre rédigé et
 * validé par un humain, en régénérer un ici serait une invention (l'article
 * approuvé n'est plus l'autorité du contenu) et ajouterait une dépendance
 * fragile (quota Groq) au chemin automatique.
 *
 * N'exporte rien vers Drive et ne prévient personne d'autre que RADAR (via
 * le callback `/api/events/[contentId]/auto-preview`) — c'est un APERÇU,
 * jamais une publication. La confirmation humaine explicite (studio/CLAUDE.md
 * §2) reste `/api/auto-generate/confirm`, déclenché uniquement par le clic
 * "Confirmer" côté RADAR.
 */
export async function runAutoGenerate(params: AutoGenerateParams): Promise<void> {
  const { contentId, title, imageUrl, origin } = params;
  if (!CONTENT_ID_RE.test(contentId)) {
    throw new Error("contentId invalide");
  }

  const { backdropUrl, fallbackToCenter } = await downloadAndCropImage(imageUrl, origin);
  const fieldValues: Record<string, string> = { imageUrl: backdropUrl, title };

  // --- 3. Rendu Playwright (même fonction que l'export réel — zéro écart, CLAUDE.md §1) ---
  const pngBuffer = await renderGabaritToPng("1a", fieldValues, origin);

  // --- 4. Persistance de la spec (pas le PNG) pour que "Confirmer" puisse
  // relancer un export identique plus tard, sans dépendre du job en mémoire
  // 5 minutes de /api/export (§jobs/store.ts) — un article peut rester non
  // confirmé bien plus longtemps qu'un onglet ouvert.
  await mkdir(PREVIEWS_DIR, { recursive: true });
  const sidecar: AutoGenerateSidecar = {
    gabaritId: "1a",
    fieldValues,
    createdAt: new Date().toISOString(),
  };
  await writeFile(sidecarPath(contentId), JSON.stringify(sidecar), "utf-8");

  // --- 5. Callback vers RADAR avec l'aperçu en data URL (pas de route de
  // service supplémentaire à authentifier entre les deux apps — le cookie de
  // session RADAR n'est pas envoyé sur une requête <img> cross-site en
  // sameSite=lax, donc un lien direct vers STUDIO ne fonctionnerait pas
  // depuis la page /ready de RADAR).
  const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  await notifyRadarAutoPreview(contentId, {
    ok: true,
    previewDataUrl: dataUrl,
    gabaritId: "1a",
    fallbackCrop: fallbackToCenter,
  });
}

/**
 * Variante carrousel de `runAutoGenerate()` — phase 4 du plan écosystème
 * (2026-09-17). Télécharge chaque image candidate (`downloadAndCropImage`,
 * partagée avec le chemin single), assemble les slides avec la même
 * fonction que l'écran manuel (`assembleSlides`, `lib/carousel/assemble.ts`
 * — extraite en phase 3 précisément pour ce cas d'usage), rend chaque slide
 * (même `renderGabaritToPng`, CLAUDE.md §1), puis persiste et notifie RADAR.
 *
 * Comme `runAutoGenerate` : jamais d'export Drive ici (c'est un APERÇU),
 * jamais de régénération LLM du texte (RADAR fournit déjà titre et slides
 * de développement, déjà validés/générés en amont).
 */
export async function runAutoGenerateCarousel(params: AutoGenerateCarouselParams): Promise<void> {
  const { contentId, title, images, devSlides, origin } = params;
  if (!CONTENT_ID_RE.test(contentId)) {
    throw new Error("contentId invalide");
  }
  if (images.length === 0) {
    throw new Error("Aucune image candidate pour ce carrousel");
  }

  // --- 1+2. Téléchargement + recadrage de chaque image candidate, dans
  // l'ordre déjà trié par pertinence par RADAR (getSortedImagesForEvent) —
  // une image dont le téléchargement échoue (URL morte, hébergeur bloqué)
  // est sautée plutôt que d'abandonner tout le carrousel pour une seule
  // source défaillante parmi plusieurs candidates.
  const uploaded: AssembleSlidesImage[] = [];
  let anyFallbackToCenter = false;
  for (const image of images.slice(0, MAX_CAROUSEL_IMAGES)) {
    try {
      const cropped = await downloadAndCropImage(image.url, origin);
      uploaded.push(cropped);
      anyFallbackToCenter = anyFallbackToCenter || cropped.fallbackToCenter;
    } catch (err) {
      console.warn(`[auto-generate] Image candidate ignorée pour ${contentId} (${image.url}):`, err instanceof Error ? err.message : err);
    }
  }
  if (uploaded.length === 0) {
    throw new Error("Aucune image candidate n'a pu être téléchargée pour ce carrousel");
  }

  // --- 3. Même assemblage que l'écran manuel (titres/carrousel/page.tsx) ---
  const slides = assembleSlides({ title, devSlides }, uploaded);

  // --- 4. Rendu Playwright de chaque slide (même fonction que l'export réel) ---
  const pngBuffers: Buffer[] = [];
  for (const slide of slides) {
    pngBuffers.push(await renderGabaritToPng(slide.gabaritId, slide.fieldValues, origin));
  }

  // --- 5. Persistance de la spec carrousel, même principe que le mode single ---
  await mkdir(PREVIEWS_DIR, { recursive: true });
  const slidesSpec: CarouselSlideSpec[] = slides.map((s) => ({ gabaritId: s.gabaritId, fieldValues: s.fieldValues }));
  const sidecar: AutoGenerateSidecar = {
    slidesSpec,
    caption: title,
    createdAt: new Date().toISOString(),
  };
  await writeFile(sidecarPath(contentId), JSON.stringify(sidecar), "utf-8");

  // --- 6. Callback vers RADAR avec toutes les slides en data URL ---
  const previewDataUrls = pngBuffers.map((buf) => `data:image/png;base64,${buf.toString("base64")}`);
  await notifyRadarAutoPreview(contentId, {
    ok: true,
    mode: "carousel",
    previewDataUrls,
    fallbackCrop: anyFallbackToCenter,
  });
}

/** Charge la spec persistée pour reconfirmer un export identique (utilisé par /api/auto-generate/confirm). */
export async function loadAutoGenerateSidecar(contentId: string): Promise<AutoGenerateSidecar | null> {
  if (!CONTENT_ID_RE.test(contentId)) return null;
  try {
    const raw = await readFile(sidecarPath(contentId), "utf-8");
    return JSON.parse(raw) as AutoGenerateSidecar;
  } catch {
    return null;
  }
}

/** Nettoie la spec une fois confirmée/exportée — évite d'accumuler des fichiers orphelins. */
export async function clearAutoGenerateSidecar(contentId: string): Promise<void> {
  if (!CONTENT_ID_RE.test(contentId)) return;
  await rm(sidecarPath(contentId), { force: true }).catch(() => {});
}

// Finding C3 (audit 2026-09-07) : ce callback est bien serveur-à-serveur
// (jamais exposé au réseau de l'utilisateur), mais un seul échec — RADAR en
// plein redémarrage PM2, cas déjà documenté ailleurs dans ce fichier — le
// rendait définitif : `exported_at`/l'aperçu restaient bloqués sans jamais
// se rattraper. 3 tentatives, backoff court : RADAR redémarre en quelques
// secondes typiquement, pas besoin d'attendre plus longtemps pour ce cas.
const NOTIFY_RETRY_DELAYS_MS = [1000, 3000];

export async function notifyRadarAutoPreview(
  contentId: string,
  payload: {
    ok: boolean;
    previewDataUrl?: string;
    /** Slides du carrousel (mode 'carousel' uniquement) — phase 4 du plan écosystème. */
    previewDataUrls?: string[];
    mode?: "single" | "carousel";
    gabaritId?: string;
    error?: string;
    fallbackCrop?: boolean;
  },
): Promise<void> {
  const radarUrl = process.env.RADAR_URL;
  if (!radarUrl) return;

  for (let attempt = 0; attempt <= NOTIFY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      // `fetch` ne rejette JAMAIS sur un statut HTTP d'erreur (401, 500…),
      // seulement sur un échec réseau — trouvé en testant réellement le
      // round-trip en prod (2026-08-29) : un 401 (middleware RADAR bloquant
      // cette route avant qu'elle soit ajoutée à l'allowlist) passait
      // silencieusement le `.catch()` faute de vérifier `res.ok`, exactement
      // la dégradation silencieuse interdite par les deux CLAUDE.md.
      const res = await fetch(`${radarUrl}/api/events/${contentId}/auto-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return;
      console.warn(`[auto-generate] Callback RADAR refusé pour ${contentId} (${res.status})`);
    } catch (err) {
      console.warn(`[auto-generate] Callback RADAR échoué pour ${contentId}:`, err);
    }

    const delay = NOTIFY_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.error(`[auto-generate] Callback RADAR abandonné pour ${contentId} après ${NOTIFY_RETRY_DELAYS_MS.length + 1} tentatives`);
}
