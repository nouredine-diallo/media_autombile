import "server-only";
import sharp from "sharp";

export class SegmentationUnavailableError extends Error {}

const MODEL_PATH = process.env.U2NET_MODEL_PATH ?? "models/u2net.onnx";
const INPUT_SIZE = 320;
const SEGMENT_TIMEOUT_MS = 30_000;

// mean/std ImageNet + normalisation "diviser par le max de l'image, pas par
// 255" : reproduction exacte de rembg (rembg/sessions/base.py::normalize,
// rembg/sessions/u2net.py::predict — vérifié sur le code source le
// 2026-08-19, pas deviné), pour produire le même masque que le u2net.onnx
// officiel plutôt qu'une approximation.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let ort: any = null;
let sessionPromise: Promise<any> | null = null;

async function loadSession(): Promise<any> {
  if (!ort) {
    ort = await import("onnxruntime-node");
  }
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH).catch((err: any) => {
      sessionPromise = null;
      throw new SegmentationUnavailableError(
        `Modèle de détourage introuvable ou invalide (${MODEL_PATH}) : ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
  return sessionPromise;
}

export interface SubjectMask {
  /** Masque 0-255, un octet par pixel, dimensions width×height (résolution de l'image d'entrée). */
  mask: Uint8Array;
  width: number;
  height: number;
}

/**
 * Calcule le masque de saillance (u2net) à la résolution de l'image
 * d'entrée — cœur partagé par `segmentSubject` (découpe alpha, 3e couche
 * des gabarits à bulles) et `computeSubjectBoundingBox` (recadrage qui
 * respecte les limites du sujet, correctif directeur "Chantier 1",
 * 2026-08-19), pour ne calculer l'inférence ONNX qu'une fois par usage.
 *
 * Modèle : u2net.onnx — voir le commentaire de licence détaillé sur
 * `segmentSubject` ci-dessous (choix motivé par la licence, pas la
 * qualité, vérifié le 2026-08-19).
 */
async function computeMask(inputPath: string): Promise<SubjectMask> {
  const session = await loadSession();

  const metadata = await sharp(inputPath).metadata();
  const origW = metadata.width ?? 0;
  const origH = metadata.height ?? 0;

  const { data: resizedRgb } = await sharp(inputPath)
    .resize(INPUT_SIZE, INPUT_SIZE, { kernel: "lanczos3", fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let maxVal = 1e-6;
  for (let i = 0; i < resizedRgb.length; i++) {
    if (resizedRgb[i] > maxVal) maxVal = resizedRgb[i];
  }

  const HW = INPUT_SIZE * INPUT_SIZE;
  const chw = new Float32Array(3 * HW);
  for (let p = 0; p < HW; p++) {
    const r = resizedRgb[p * 3] / maxVal;
    const g = resizedRgb[p * 3 + 1] / maxVal;
    const b = resizedRgb[p * 3 + 2] / maxVal;
    chw[p] = (r - MEAN[0]) / STD[0];
    chw[HW + p] = (g - MEAN[1]) / STD[1];
    chw[2 * HW + p] = (b - MEAN[2]) / STD[2];
  }

  const inputTensor = new ort.Tensor("float32", chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);

  const runPromise = session.run({ [session.inputNames[0]]: inputTensor });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new SegmentationUnavailableError(
            `Détourage : délai dépassé (${SEGMENT_TIMEOUT_MS / 1000}s).`,
          ),
        ),
      SEGMENT_TIMEOUT_MS,
    );
  });
  const results = await Promise.race([runPromise, timeoutPromise]);
  const d0 = results[session.outputNames[0]];

  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < d0.data.length; i++) {
    const v = d0.data[i] as number;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const range = mx - mn || 1e-6;
  const mask320 = new Uint8Array(HW);
  for (let i = 0; i < HW; i++) {
    const v = d0.data[i] as number;
    mask320[i] = Math.max(0, Math.min(255, Math.round(((v - mn) / range) * 255)));
  }

  const maskResized = await sharp(Buffer.from(mask320), {
    raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 },
  })
    .resize(origW, origH, { kernel: "lanczos3" })
    .toColourspace("b-w")
    .raw()
    .toBuffer();

  return { mask: new Uint8Array(maskResized), width: origW, height: origH };
}

/**
 * Détourage du sujet principal — découpe alpha générique (pas de recadrage
 * de forme), utilisée comme 3e couche des gabarits à bulles (familles 2/3)
 * pour que le sujet du fond passe par-dessus une bulle qu'il chevauche
 * (CLAUDE.md §1.1, correctifs directeur point 4).
 *
 * Modèle : u2net.onnx (Apache-2.0, xuebinqin/U-2-Net, distribué par
 * danielgatis/rembg release v0.0.0 — intégrité vérifiée par MD5 le
 * 2026-08-19, `60024c5c889badc19c04ad937298a77b`, identique à celui
 * confirmé par le mainteneur de rembg). Choix motivé par la licence, pas
 * la qualité : `isnet-general-use.onnx` (candidat initial, meilleure
 * précision de contour) est entraîné sur le jeu de données DIS5K, dont les
 * conditions d'usage interdisent explicitement l'usage commercial
 * (vérifié le 2026-08-19, DIS5K-Dataset-Terms-of-Use.pdf, §2 "commercial
 * use of this dataset is prohibited") — même le mainteneur de rembg
 * refuse de garantir que la licence Apache-2.0 du code s'étend aux poids
 * dans ce cas et recommande un avis juridique pour un usage commercial
 * (github.com/danielgatis/rembg/issues/837). u2net.onnx est entraîné sur
 * DUTS-TR, dont la page officielle indique seulement "tous droits
 * réservés" côté annotations, sans clause d'interdiction commerciale
 * explicite — risque résiduel non nul mais nettement moindre, cohérent
 * avec CLAUDE.md §3.3 (ne pas trancher seul un risque juridique réel :
 * ici on choisit l'option la moins exposée plutôt que d'improviser un
 * feu vert). Si la précision de bord d'isnet s'avère nécessaire, obtenir
 * un avis juridique avant de changer de modèle plutôt que de re-décider
 * seul.
 *
 * Repli si trop lent en production (VM ARM 2 cœurs sans GPU, non mesuré) :
 * u2netp.onnx, même licence/lignée, ~4,5 Mo contre ~176 Mo, moins précis.
 */
export async function segmentSubject(inputPath: string): Promise<Buffer> {
  const { data: origRgba } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { mask, width, height } = await computeMask(inputPath);

  const refined = refineMaskByColour(mask, origRgba, width, height);
  const dilated = dilateMask(refined, width, height);

  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = origRgba[p * 4];
    rgba[p * 4 + 1] = origRgba[p * 4 + 1];
    rgba[p * 4 + 2] = origRgba[p * 4 + 2];
    rgba[p * 4 + 3] = dilated[p];
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Rayon de dilatation finale, en fraction de la largeur. Ramené de 0,003 à
 * 0,001 (≈ 1 px) le 2026-08-22 : à 3 px, la découpe débordait du sujet et
 * dessinait un **liseré de décor par-dessus la bulle** — le « halo de sûreté »
 * signalé par le directeur, discret sur une voiture blanche devant du ciel,
 * très visible sur une Supra dorée devant un fond de studio gris. La
 * récupération de carrosserie est faite par `refineMaskByColour`, pas par la
 * dilatation ; celle-ci ne sert plus qu'à couvrir l'anticrénelage.
 */
const DILATION_RATIO = 0.001;

/** Portée maximale de la croissance guidée, en fraction de la largeur (≈ 55 px sur 1080). */
const REFINE_REACH_RATIO = 0.051;
/** Écart toléré d'un pixel au voisin déjà retenu, par canal (0-255). */
const REFINE_STEP_TOLERANCE = 20;
/**
 * Écart toléré par rapport à la couleur du pixel de départ, par canal.
 *
 * Sans cette seconde borne, la croissance **dérive** : de proche en proche,
 * chaque pas restant sous 20, elle passait de la carrosserie blanche
 * (231,240,239) à l'eau grise en une trentaine de pas, et cette zone de fond
 * venait ensuite se dessiner par-dessus la bulle. Constaté sur `test33.jpeg`
 * le 2026-08-21. Comparer aussi à la couleur d'origine ferme ce chemin.
 */
const REFINE_SEED_TOLERANCE = 30;
/**
 * Récupère la carrosserie que le modèle laisse hors masque, par croissance de
 * région guidée par la couleur depuis le bord du masque.
 *
 * **Pourquoi c'est nécessaire** (mesuré le 2026-08-21) : `u2net.onnx` a une
 * entrée figée en 320×320 (vérifié : une inférence en 640 est rejetée par le
 * modèle). Sur une photo 1920 de large, un pixel de masque couvre donc 6 px
 * d'image, et la frontière rendue tombe loin **à l'intérieur** du sujet sur
 * les arêtes très claires. Relevé au pixel sur `test33.jpeg`, ligne y=630 :
 * 50 px de carrosserie blanche (RGB ≈ 230,240,238) totalement hors masque,
 * jusqu'à l'herbe (RGB ≈ 99,115,26). Une simple dilatation ne peut pas
 * rattraper ça sans créer un halo de décor de 50 px autour du sujet.
 *
 * **Principe** : on part des pixels sûrs (masque ≥ 200) et on annexe de proche
 * en proche les voisins dont la couleur est proche de celle du pixel déjà
 * retenu — la carrosserie continue, l'herbe non (écart de 130 sur le vert).
 * La portée est bornée (~55 px) pour que, si la couleur du décor ressemble à
 * celle du sujet, le débordement reste local au lieu d'avaler l'image.
 *
 * Volontairement sans dépendance ni seconde inférence : la cible de
 * déploiement est une VM ARM à 2 cœurs sans GPU (CLAUDE.md §1.1).
 */
function refineMaskByColour(
  mask: Uint8Array,
  rgba: Buffer,
  width: number,
  height: number,
): Uint8Array {
  const out = Uint8Array.from(mask);
  const reach = Math.max(4, Math.round(width * REFINE_REACH_RATIO));
  const n = width * height;

  // Palette du DÉCOR, échantillonnée loin du masque (au-delà de la portée de
  // croissance) : un pixel n'est annexé que s'il ressemble davantage à son
  // sujet d'origine qu'à ce décor.
  //
  // Sans ce garde-fou, la croissance fuit dès que le fond ressemble au sujet :
  // sur une photo de studio, les reflets blancs d'une voiture (240,240,240) et
  // le fond gris clair (235,235,235) ne diffèrent que de 5 — la croissance
  // traversait, annexait le décor, et ce décor venait ensuite se dessiner en
  // halo par-dessus la bulle. Constaté sur `test6.jpg` (Supra dorée en studio)
  // le 2026-08-22 ; invisible sur `test33.jpeg` (voiture devant ciel et herbe),
  // d'où un défaut qui n'était apparu sur aucun des cas testés jusque-là.
  const decor: number[][] = [];
  {
    const pas = Math.max(8, Math.round(width / 90));
    for (let y = 0; y < height; y += pas) {
      for (let x = 0; x < width; x += pas) {
        const p = y * width + x;
        if (mask[p] >= 10) continue;
        // Loin de tout pixel de sujet : on teste un voisinage carré.
        let proche = false;
        for (let dy = -reach; dy <= reach && !proche; dy += reach) {
          for (let dx = -reach; dx <= reach && !proche; dx += reach) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (mask[ny * width + nx] >= 128) proche = true;
          }
        }
        if (!proche) decor.push([rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]]);
      }
    }
  }
  const ressembleAuDecor = (q: number, distSujet: number) => {
    if (decor.length === 0) return false;
    const r = rgba[q * 4], g = rgba[q * 4 + 1], b = rgba[q * 4 + 2];
    let meilleur = Infinity;
    for (const d of decor) {
      const e = Math.abs(r - d[0]) + Math.abs(g - d[1]) + Math.abs(b - d[2]);
      if (e < meilleur) meilleur = e;
    }
    return meilleur <= distSujet;
  };

  // Couleur du pixel de masque d'où part chaque annexion, propagée de proche
  // en proche — c'est elle qui empêche la dérive.
  const seedR = new Uint8Array(n);
  const seedG = new Uint8Array(n);
  const seedB = new Uint8Array(n);

  let frontier: number[] = [];
  for (let p = 0; p < n; p++) {
    if (mask[p] < 250) continue;
    seedR[p] = rgba[p * 4];
    seedG[p] = rgba[p * 4 + 1];
    seedB[p] = rgba[p * 4 + 2];
    frontier.push(p);
  }

  const proche = (a: number, b: number, tol: number) =>
    Math.abs(rgba[a * 4] - rgba[b * 4]) <= tol &&
    Math.abs(rgba[a * 4 + 1] - rgba[b * 4 + 1]) <= tol &&
    Math.abs(rgba[a * 4 + 2] - rgba[b * 4 + 2]) <= tol;

  const procheDeLOrigine = (p: number, q: number) =>
    Math.abs(rgba[q * 4] - seedR[p]) <= REFINE_SEED_TOLERANCE &&
    Math.abs(rgba[q * 4 + 1] - seedG[p]) <= REFINE_SEED_TOLERANCE &&
    Math.abs(rgba[q * 4 + 2] - seedB[p]) <= REFINE_SEED_TOLERANCE;

  for (let step = 0; step < reach && frontier.length; step++) {
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % width;
      const y = (p / width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        // Ne pas retester ce qui est déjà pris. Un premier essai ajoutait ici
        // un garde « ne pas annexer un pixel que le modèle note haut » : il
        // bloquait la croissance dès le premier voisin (alpha 221 juste après
        // la frontière), et le correctif ne récupérait presque rien. La
        // frontière de u2net est un dégradé, pas une marche.
        if (out[q] >= 250) continue;
        if (!proche(p, q, REFINE_STEP_TOLERANCE)) continue;
        if (!procheDeLOrigine(p, q)) continue;
        const distSujet =
          Math.abs(rgba[q * 4] - seedR[p]) +
          Math.abs(rgba[q * 4 + 1] - seedG[p]) +
          Math.abs(rgba[q * 4 + 2] - seedB[p]);
        if (ressembleAuDecor(q, distSujet)) continue;
        out[q] = 255;
        seedR[q] = seedR[p];
        seedG[q] = seedG[p];
        seedB[q] = seedB[p];
        next.push(q);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * Élargit légèrement le masque du sujet.
 *
 * Pourquoi (mesuré le 2026-08-21) : la frontière rendue par u2net tombe
 * quelques pixels **à l'intérieur** du sujet. Superposé au fond, cet écart ne
 * se voit pas — le pixel manquant est identique à celui du dessous. Mais dès
 * qu'une bulle passe sous le sujet, ces quelques pixels laissent apparaître la
 * bulle **au travers du bord de la voiture** : liseré grignoté sur le rebord
 * arrière, aile avant qui semble déformée. C'est le défaut relevé par le
 * directeur sur le montage Mercedes.
 *
 * La dilatation fait déborder la découpe de quelques pixels sur le décor
 * immédiatement autour du sujet. Ces pixels-là proviennent de la même photo,
 * donc là où il n'y a pas de bulle en dessous ils sont rigoureusement
 * identiques au fond : invisibles. Là où il y a une bulle, ils forment un
 * liseré de décor de 3-4 px — bien moins visible qu'une carrosserie entamée.
 *
 * Implémentation : dilatation par maximum sur un disque, séparée en deux
 * passes (horizontale puis verticale) pour rester en O(n·r) et non O(n·r²).
 * La dilatation d'un disque n'est pas exactement séparable, mais l'écart avec
 * un carré de même rayon est inférieur au pixel à ce rayon-là.
 */
function dilateMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const r = Math.max(1, Math.round(width * DILATION_RATIO));
  const pass1 = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      for (let k = x0; k <= x1; k++) { const v = mask[row + k]; if (v > m) m = v; }
      pass1[row + x] = m;
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height - 1, y + r);
      for (let k = y0; k <= y1; k++) { const v = pass1[k * width + x]; if (v > m) m = v; }
      out[y * width + x] = m;
    }
  }
  return out;
}

export interface SubjectBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Boîte englobante du sujet principal, en coordonnées pixel de l'image
 * d'entrée — utilisée pour le recadrage qui respecte les limites du sujet
 * (correctif directeur "Chantier 1", 2026-08-19 : le recadrage 4:5 centré
 * pouvait couper à travers la voiture si elle n'occupait pas exactement le
 * centre de la photo source). `threshold` : seuil de masque (0-255) pour
 * considérer un pixel comme faisant partie du sujet — 40 par défaut,
 * volontairement bas pour ne pas rogner les bords doux (rétroviseurs,
 * antennes) que le modèle segmente avec une confiance progressive plutôt
 * que binaire.
 *
 * Retourne `null` si aucun pixel du masque ne dépasse le seuil (image sans
 * sujet net détecté) — l'appelant doit alors retomber sur un recadrage
 * centré classique, jamais bloquer l'upload pour cette raison.
 */
export async function computeSubjectBoundingBox(
  inputPath: string,
  threshold = 40,
): Promise<SubjectBoundingBox | null> {
  const { mask, width, height } = await computeMask(inputPath);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[rowOffset + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}


/**
 * Efface progressivement l'alpha près des bords de l'image.
 *
 * Nécessaire pour la découpe d'une **image de bulle** : sa couche de
 * débordement est dessinée sans clipping circulaire, donc si le masque touche
 * le bord du fichier, on voit apparaître l'arête droite du rectangle en plein
 * milieu du montage. Constaté le 2026-08-22 sur `test32.webp`, dont le masque
 * inclut la route sous la voiture jusqu'au bord : un pavé gris à angle droit
 * s'affichait sous la bulle.
 *
 * Ne s'applique **qu'aux bulles**. Sur la découpe du fond, le masque touche
 * légitimement les bords et la même image se trouve juste en dessous : estomper
 * y ferait au contraire apparaître les bulles à travers le sujet.
 */
export async function adoucirBordsDecoupe(png: Buffer, fractionBord = 0.03): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const marge = Math.max(2, Math.round(Math.min(W, H) * fractionBord));
  for (let y = 0; y < H; y++) {
    const dY = Math.min(y, H - 1 - y);
    for (let x = 0; x < W; x++) {
      const d = Math.min(dY, Math.min(x, W - 1 - x));
      if (d >= marge) continue;
      const i = (y * W + x) * C + 3;
      // Rampe lissée : une rampe linéaire laisse encore deviner une arête.
      const t = d / marge;
      data[i] = Math.round(data[i] * (t * t * (3 - 2 * t)));
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
}
