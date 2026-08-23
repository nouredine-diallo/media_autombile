import "server-only";
import sharp from "sharp";
import type { BulleGeometry } from "@/components/gabarits/Bulle";

/**
 * Part maximale du disque d'une bulle que la découpe du sujet (3e couche)
 * peut recouvrir avant que l'effet ne soit désactivé.
 *
 * **Mesuré**, pas choisi (2026-08-20) : sur la composition calée sur la
 * référence (`test33.jpeg`, Mercedes), le sujet recouvre 20,4% de la bulle
 * gauche et 8,1% de la droite — l'effet de profondeur voulu, la voiture
 * effleure le bas des bulles. Sur `test1.jpg` (Renault 5, sujet presque
 * carré), les mêmes règles donnent 82,3% et 68,1% : la voiture avale les
 * bulles et le montage devient illisible. 45% sépare largement les deux cas.
 *
 * Au-delà du seuil on retombe sur l'empilement à 2 couches (bulles par-dessus
 * le fond, comportement d'origine) — jamais une dégradation silencieuse : la
 * décision est renvoyée à l'appelant.
 */
export const MAX_BULLE_COVERAGE = 0.45;

// Un seuil de contact minimal entre sujet et bulle a été posé puis **retiré**
// le 2026-08-21 : il refusait des montages 2A/2B parfaitement bons (1 % de
// contact) alors que le défaut qu'il visait — bulles flottant au-dessus d'un
// décor — venait de la taille du sujet, pas du contact. Remplacé par
// `MIN_SUBJECT_WIDTH` dans `gabaritFit.ts`.

export interface CoverageResult {
  /** Recouvrement mesuré, bulle par bulle, dans l'ordre reçu. */
  ratios: number[];
  /** false si au moins une bulle dépasse le seuil — la 3e couche doit être écartée. */
  keepSubjectLayer: boolean;
}

/**
 * Mesure quelle part du disque de chaque bulle serait recouverte par la
 * découpe du sujet, dans le repère réel du rendu.
 *
 * `photoHeight` est la hauteur de la zone photo (le PNG de découpe a cette
 * taille et est ancré en haut du canevas), `canvasHeight` celle du canevas
 * entier — `topPercent` d'une bulle se lit sur le canevas.
 */
export async function measureBulleCoverage(
  subjectPng: Buffer,
  bulles: BulleGeometry[],
  canvasWidth: number,
  canvasHeight: number,
  photoHeight: number,
): Promise<CoverageResult> {
  const { data, info } = await sharp(subjectPng)
    .resize(canvasWidth, photoHeight, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, channels: C } = info;

  const ratios = bulles.map((b) => {
    const cx = (b.leftPercent / 100) * W;
    const cy = (b.topPercent / 100) * canvasHeight;
    const r = ((b.sizePercent / 100) * W) / 2;

    let total = 0;
    let covered = 0;
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(photoHeight - 1, Math.ceil(cy + r));
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    // Pas de 2px : 4x moins de pixels lus pour une mesure identique à ~0,1%
    // près sur des disques de plus de 200px de rayon.
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        total++;
        if (data[(y * W + x) * C + 3] >= 128) covered++;
      }
    }
    return total ? covered / total : 0;
  });

  return { ratios, keepSubjectLayer: ratios.every((v) => v <= MAX_BULLE_COVERAGE) };
}


/**
 * Part du pourtour du cercle que le sujet d'une image de bulle franchit.
 *
 * Sert à décider si l'effet de débordement (Chantier 3) mérite d'être **activé
 * d'emblée** : un arc court se lit comme un débordement voulu (la voiture qui
 * sort de la bulle sur la référence), un arc long fait disparaître l'anneau et
 * donne une bulle qui bave.
 *
 * Repère : la bulle affiche l'image en `object-cover` dans un carré, cercle
 * inscrit. En coordonnées image (paysage 5:4), le cercle a pour rayon la
 * moitié de la HAUTEUR, centré.
 */
export function mesureArcDebordement(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
): { arc: number; remplissage: number } {
  const cx = width / 2;
  const cy = height / 2;
  const r = height / 2;
  let franchi = 0;
  for (let deg = 0; deg < 360; deg++) {
    const a = (deg * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(a) * r * 1.03);
    const y = Math.round(cy + Math.sin(a) * r * 1.03);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (data[(y * width + x) * channels + 3] >= 128) franchi++;
  }
  // Remplissage du disque : un sujet qui occupe presque toute la bulle ne
  // « dépasse » de rien — tout est sujet, et l'effet donne une bavure au lieu
  // d'un débordement lisible.
  let dedans = 0;
  let plein = 0;
  const r2 = r * r;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      dedans++;
      if (data[(y * width + x) * channels + 3] >= 128) plein++;
    }
  }
  return { arc: franchi / 360, remplissage: dedans ? plein / dedans : 0 };
}

/**
 * Au-delà de cette part de pourtour franchie, l'effet de débordement n'est plus
 * proposé d'emblée — il reste activable d'un clic sur l'aperçu.
 *
 * ⚠️ **Seuil à faible appui** (CLAUDE.md §4.3) : deux échantillons seulement,
 * mesurés le 2026-08-20 — `test32.webp` (arrière de la Mercedes, débordement
 * jugé réussi) à 19,2 % et `test31.webp` (tableau de bord, jugé raté) à 28,1 %.
 * 24 % passe entre les deux. À recalibrer dès que d'autres cas sont jugés ;
 * le coût d'une erreur est d'un clic, l'opérateur voit et corrige sur l'aperçu.
 */
export const ARC_DEBORDEMENT_MAX = 0.24;

/**
 * Remplissage maximal du disque au-delà duquel le débordement n'est plus
 * proposé : le sujet occupe alors toute la bulle, il n'y a rien qui dépasse.
 *
 * ⚠️ **Seuil à faible appui** (§4.3), quatre échantillons jugés à l'œil le
 * 2026-08-22 : `test32.webp` 40,3 % (débordement réussi) ; `test71.avif`
 * 62,6 % ; `test31.webp` 67,8 % (raté) ; `test61.jpg` 87,2 % (raté, halo de
 * voiture autour du cercle). 55 % passe entre le seul cas réussi et les
 * ratés. À recalibrer dès que d'autres cas sont jugés.
 */
export const REMPLISSAGE_DEBORDEMENT_MAX = 0.55;


/**
 * Part du diamètre du cercle que le sujet d'une bulle doit occuper pour que le
 * débordement se lise.
 *
 * Mesuré sur `inspi/5776137084027474227.jpg` : l'arrière de la Mercedes sort
 * d'environ 21 px d'un cercle de 244 px de rayon, soit ~4 % du diamètre au-delà
 * du bord. Un sujet exactement au diamètre (ce que produisait le recadrage
 * automatique) ne franchit rien : il affleure. 1,08 le fait dépasser des deux
 * côtés d'environ 4 % — côté gauche masqué par l'autre bulle dans les gabarits
 * 3A/3B, exactement comme sur la référence.
 */
export const CIBLE_SUJET_DANS_BULLE = 1.08;

/**
 * Cadrage conseillé du contenu d'une bulle : zoom et décalage qui posent le
 * sujet au centre du cercle et lui donnent la taille ci-dessus.
 *
 * Renvoyé par le détourage et appliqué **d'emblée** : le montage doit être bon
 * sans action manuelle. L'opérateur peut toujours reprendre la main sur
 * l'aperçu (molette, mode Cadrer, bouton de remise à zéro).
 */
export function cadreConseilleBulle(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
): { zoom: number; dx: number; dy: number } | undefined {
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * channels + 3] < 128) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return undefined;

  // Le cercle est inscrit dans le carré central : son diamètre vaut la hauteur.
  const diametre = height;
  const l = maxX - minX + 1;
  const h = maxY - minY + 1;
  const zoom = Math.min(1.6, Math.max(0.8, (CIBLE_SUJET_DANS_BULLE * diametre) / Math.max(l, h)));

  // Recentrage du sujet sur le centre du cercle, exprimé en % du diamètre —
  // même unité que le réglage manuel. Le zoom s'appliquant autour du centre,
  // le décalage doit être compté après mise à l'échelle.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = (((width / 2 - cx) * zoom) / diametre) * 100;
  const dy = (((height / 2 - cy) * zoom) / diametre) * 100;
  return {
    zoom: Number(zoom.toFixed(3)),
    dx: Number(Math.min(40, Math.max(-40, dx)).toFixed(2)),
    dy: Number(Math.min(40, Math.max(-40, dy)).toFixed(2)),
  };
}


/**
 * Position du sujet dans le fond composé : haut et centre de gravité
 * horizontal, en % du canevas. Sert à placer la bulle de la famille 2 —
 * la bulle va là où le sujet n'est pas, et son bas doit passer sous le haut
 * du sujet pour que le contact se fasse (voir `geometrieBulleUnique`).
 */
export function positionSujet(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  channels: number,
  canvasHeight: number,
): { haut: number; centreX: number } | undefined {
  let haut = -1;
  let sommeX = 0;
  let n = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * channels + 3] < 128) continue;
      if (haut < 0) haut = y;
      sommeX += x;
      n++;
    }
  }
  if (haut < 0 || n === 0) return undefined;
  return {
    haut: (haut / canvasHeight) * 100,
    centreX: (sommeX / n / width) * 100,
  };
}
