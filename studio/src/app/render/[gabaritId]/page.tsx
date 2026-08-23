import { notFound } from "next/navigation";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { GABARITS, GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";
import sharp from "sharp";
import { GABARIT_PHOTO_HEIGHT } from "@/components/gabarits/Gabarit1A";
import { MAX_BULLE_COVERAGE, measureBulleCoverage } from "@/lib/images/subjectCoverage";
import { lireGeometrie } from "@/components/gabarits/Bulle";
import { GABARIT_2A_BULLE } from "@/components/gabarits/Gabarit2A";
import { GABARIT_2B_BULLE } from "@/components/gabarits/Gabarit2B";
import { GABARIT_3A_BULLE1, GABARIT_3A_BULLE2 } from "@/components/gabarits/Gabarit3A";
import { GABARIT_3B_BULLE1, GABARIT_3B_BULLE2 } from "@/components/gabarits/Gabarit3B";
import type { BulleGeometry } from "@/components/gabarits/Bulle";
import { decodeForSampling, sampleEdgeLuminance, shadowForLuminance } from "@/lib/images/edgeLuminance";
import { resolveVariantPath } from "@/lib/images/store";

const UPLOADED_IMAGE_RE = /^\/api\/images\/([0-9a-f-]{36})(?:\?variant=([a-z]+))?$/i;

/**
 * Résout `imageUrl` en octets, en lecture disque directe plutôt qu'en
 * auto-fetch HTTP vers son propre serveur — un auto-fetch imbriqué dans un
 * Server Component qui sera lui-même rechargé par un second Chromium
 * (route d'export) crée 3 niveaux de requêtes sur le même process Next.js
 * en dev, mesuré comme cause réelle de timeout le 2026-08-19, pas
 * seulement théorique. Couvre les deux formes réellement utilisées
 * (image uploadée via /api/images/[id], fixture statique sous public/) ;
 * une URL absolue (http) reste possible en repli pour rester généralement
 * correct, mais n'est pas le chemin exercé aujourd'hui.
 */
async function readImageBytes(imageUrl: string): Promise<Buffer | null> {
  const uploadMatch = imageUrl.match(UPLOADED_IMAGE_RE);
  if (uploadMatch) {
    const [, id, variant] = uploadMatch;
    const filePath = await resolveVariantPath(id, variant ?? "cropped");
    if (!filePath) return null;
    return readFile(filePath);
  }

  if (imageUrl.startsWith("/")) {
    const publicPath = path.join(process.cwd(), "public", imageUrl);
    try {
      return await readFile(publicPath);
    } catch {
      return null;
    }
  }

  try {
    const res = await fetch(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

interface RenderGabaritPageProps {
  params: Promise<{ gabaritId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Bulles par gabarit, pour le calcul d'ombre adaptative (2026-08-19) — la
 * géométrie vient de chaque composant Gabarit*.tsx (source unique), pas
 * dupliquée ici : ce tableau ne fait que dire "quel champ d'ombre
 * correspond à quelle géométrie" pour ce gabarit.
 */
const BULLE_SHADOW_TARGETS: Record<string, Array<{ shadowField: string; geom: BulleGeometry }>> = {
  "2a": [{ shadowField: "bulleShadow", geom: GABARIT_2A_BULLE }],
  "2b": [{ shadowField: "bulleShadow", geom: GABARIT_2B_BULLE }],
  "3a": [
    { shadowField: "bulle1Shadow", geom: GABARIT_3A_BULLE1 },
    { shadowField: "bulle2Shadow", geom: GABARIT_3A_BULLE2 },
  ],
  "3b": [
    { shadowField: "bulle1Shadow", geom: GABARIT_3B_BULLE1 },
    { shadowField: "bulle2Shadow", geom: GABARIT_3B_BULLE2 },
  ],
};

/**
 * Calcule l'ombre adaptative de chaque bulle à partir de l'image de fond
 * réelle (correctif directeur 2026-08-19 : "l'ombre doit s'adapter au
 * contraste du fond, pas un réglage figé"). Fait ici, dans la page qui
 * sert à la fois l'aperçu navigateur et la capture Playwright — seul
 * moyen de garantir que les deux utilisent exactement la même valeur
 * (CLAUDE.md §1, zéro écart aperçu/export). Échec de calcul (image
 * inaccessible, etc.) → pas d'ombre adaptative, `Bulle.tsx` retombe sur sa
 * valeur fixe ; jamais une erreur qui casse le rendu.
 */
async function computeBulleShadows(
  gabaritId: string,
  imageUrl: string | undefined,
  props: Record<string, string>,
): Promise<Record<string, string>> {
  const targets = geometriesEffectives(gabaritId, props);
  if (!targets || !imageUrl) return {};

  try {
    const buffer = await readImageBytes(imageUrl);
    if (!buffer) return {};

    // La photo de fond n'occupe que la zone haute du canevas depuis le
    // 2026-08-20 — on l'échantillonne à SA taille, en indiquant la hauteur du
    // canevas pour que `topPercent` reste lu dans le bon repère.
    const decoded = await decodeForSampling(
      buffer,
      GABARIT_WIDTH,
      Number.parseInt(props.photoHeight ?? "", 10) || GABARIT_PHOTO_HEIGHT,
    );
    const result: Record<string, string> = {};
    for (const target of targets) {
      const luminance = sampleEdgeLuminance(decoded, target.geom, GABARIT_HEIGHT);
      result[target.shadowField] = shadowForLuminance(luminance);
    }
    return result;
  } catch {
    return {};
  }
}

/** Hauteur en px du fichier de fond, ramenée à la largeur du canevas. */
async function hauteurFond(imageUrl: string | undefined): Promise<number> {
  if (!imageUrl) return GABARIT_PHOTO_HEIGHT;
  try {
    const buffer = await readImageBytes(imageUrl);
    if (!buffer) return GABARIT_PHOTO_HEIGHT;
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return GABARIT_PHOTO_HEIGHT;
    return Math.round((height / width) * GABARIT_WIDTH);
  } catch {
    return GABARIT_PHOTO_HEIGHT;
  }
}

/**
 * Géométrie réellement appliquée pour ce rendu : celle mesurée sur la
 * référence, **surchargée** par ce que l'opérateur a déplacé sur l'aperçu.
 * L'ombre adaptative et le garde-fou de recouvrement doivent suivre la bulle,
 * sinon une bulle déplacée garderait l'ombre de son ancienne position.
 */
function geometriesEffectives(gabaritId: string, props: Record<string, string>) {
  const cibles = BULLE_SHADOW_TARGETS[gabaritId];
  if (!cibles) return undefined;
  return cibles.map((t) => {
    const cle = t.shadowField === "bulleShadow" ? "bulleGeom" : t.shadowField.replace("Shadow", "Geom");
    return { ...t, geom: lireGeometrie(props[cle], t.geom) };
  });
}

/**
 * Écarte la 3e couche si elle recouvrirait trop les bulles — voir
 * `MAX_BULLE_COVERAGE` pour le seuil et les mesures qui le fondent. Toute
 * erreur de lecture/mesure laisse la couche en place (comportement d'avant),
 * jamais un rendu bloqué.
 */
async function keepSubjectLayerOrDrop(
  gabaritId: string,
  sujetUrl: string | undefined,
  props: Record<string, string>,
): Promise<string> {
  const targets = geometriesEffectives(gabaritId, props);
  if (!sujetUrl || !targets) return sujetUrl ?? "";
  try {
    const buffer = await readImageBytes(sujetUrl);
    if (!buffer) return sujetUrl;
    const { ratios, keepSubjectLayer } = await measureBulleCoverage(
      buffer,
      targets.map((t) => t.geom),
      GABARIT_WIDTH,
      GABARIT_HEIGHT,
      Number.parseInt(props.photoHeight ?? "", 10) || GABARIT_PHOTO_HEIGHT,
    );
    if (!keepSubjectLayer) {
      console.warn(
        `[gabarit ${gabaritId}] 3e couche écartée : recouvrement des bulles ` +
        ratios.map((r) => `${(r * 100).toFixed(1)}%`).join(", ") +
        ` (seuil ${(MAX_BULLE_COVERAGE * 100).toFixed(0)}%)`,
      );
      return "";
    }
    return sujetUrl;
  } catch {
    return sujetUrl;
  }
}

/**
 * Page de capture générique — utilisée uniquement par
 * /api/render/[gabaritId] (Playwright). Miroir générique de
 * src/app/render/1a/page.tsx (Étape 1), pour les gabarits ajoutés en
 * Étape 4. N'affiche rien d'autre que le composant, pour que la capture
 * soit exacte.
 */
export default async function RenderGabaritPage({
  params,
  searchParams,
}: RenderGabaritPageProps) {
  const { gabaritId } = await params;
  const def = GABARITS[gabaritId];
  if (!def) notFound();

  const sp = await searchParams;
  const props: Record<string, string> = {};
  for (const field of def.fields) {
    const value = sp[field.key];
    props[field.key] =
      typeof value === "string" ? value : (def.defaults[field.key] ?? "");
  }

  // Hauteur réelle de la zone photo, déduite du fichier de fond : elle varie
  // d'une image à l'autre depuis le 2026-08-22 (voir `hauteurZonePhoto`).
  // Le composant et le bandeau de titre doivent tous deux l'utiliser, sinon le
  // dégradé ne tombe plus sur le bord de la photo et une couture apparaît.
  props.photoHeight = String(await hauteurFond(props.imageUrl));

  const shadows = await computeBulleShadows(gabaritId, props.imageUrl, props);
  Object.assign(props, shadows);

  // Garde-fou de composition (2026-08-20) : la 3e couche (découpe du sujet
  // par-dessus les bulles) ne doit produire qu'un effleurement, comme sur la
  // référence. Sur un sujet presque carré elle recouvre les bulles au point de
  // les rendre illisibles — on retombe alors sur l'empilement à 2 couches.
  // Calculé ici, dans la page qui sert à la fois l'aperçu et la capture
  // Playwright : c'est le seul endroit qui garantit un résultat identique des
  // deux côtés (CLAUDE.md §1).
  props.sujetUrl = await keepSubjectLayerOrDrop(gabaritId, props.sujetUrl, props);

  return <def.Component {...props} />;
}
