import "server-only";
import { GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";
import { GABARIT_PHOTO_HEIGHT } from "@/components/gabarits/Gabarit1A";
import { GABARIT_2A_BULLE } from "@/components/gabarits/Gabarit2A";
import { GABARIT_2B_BULLE } from "@/components/gabarits/Gabarit2B";
import { GABARIT_3A_BULLE1, GABARIT_3A_BULLE2 } from "@/components/gabarits/Gabarit3A";
import { GABARIT_3B_BULLE1, GABARIT_3B_BULLE2 } from "@/components/gabarits/Gabarit3B";
import type { BulleGeometry } from "@/components/gabarits/Bulle";
import { MAX_BULLE_COVERAGE, measureBulleCoverage } from "./subjectCoverage";
import sharp from "sharp";

/**
 * Largeur minimale du sujet dans le cadre, pour qu'il se lise comme le sujet
 * principal et pas comme un détail du décor.
 *
 * Remplace un critère « au moins une bulle doit être touchée » posé le
 * 2026-08-21 puis **écarté le même jour** : il refusait des montages 2A/2B
 * parfaitement bons (bulle en haut, voiture juste en dessous, 1 % de contact)
 * alors que le vrai défaut qu'il visait — le rendu Renault où les bulles
 * flottaient au-dessus d'une route — venait du sujet réduit à 28,6 % de la
 * largeur. Le contact n'était qu'un symptôme ; la taille du sujet est la cause.
 *
 * Mesuré : montages jugés bons 76,7 % (Mercedes) et 77 % (WEC) ; montage
 * cassé 28,6 %. 45 % sépare largement les deux.
 */
export const MIN_SUBJECT_WIDTH = 0.45;



/**
 * Contrôle qualité du couple (photo de fond, gabarit) — répond à la question
 * "cette photo a-t-elle assez d'espace libre au-dessus du sujet pour les
 * bulles de ce gabarit ?" **avant** de produire un montage illisible.
 *
 * Pourquoi c'est nécessaire (mesuré le 2026-08-20) : le gabarit 3A suppose un
 * fond dégageant du ciel au-dessus du sujet, comme la référence. Avec un fond
 * où le sujet remplit le cadre (`test1.jpg`, Renault 5 en gros plan), le sujet
 * recouvre 76,8 % et 68,6 % des deux bulles — le montage devient illisible.
 * Le même jeu de photos donne un bon résultat en prenant comme fond celle où
 * le sujet est le plus petit (`test12.avif`).
 *
 * Conforme au principe du projet : on **propose**, on ne décide pas à la place
 * de l'opérateur (CLAUDE.md §2). Cette fonction ne change aucun rendu, elle
 * renvoie un diagnostic et une suggestion.
 */

const BULLES: Record<string, BulleGeometry[]> = {
  "1a": [],
  "1b": [],
  "2a": [GABARIT_2A_BULLE],
  "2b": [GABARIT_2B_BULLE],
  "3a": [GABARIT_3A_BULLE1, GABARIT_3A_BULLE2],
  "3b": [GABARIT_3B_BULLE1, GABARIT_3B_BULLE2],
};

/**
 * Ordre d'essai des replis, du plus riche au plus sobre. La suggestion n'est
 * **jamais** codée en dur : chaque candidat est réellement mesuré sur ce fond
 * avant d'être proposé.
 *
 * Pourquoi (2026-08-21) : une première version renvoyait "essayez 2A" par
 * simple table de correspondance. Mesuré sur `test12.avif`, 2A échouait aussi
 * (58,7 % de recouvrement) et 2B encore plus (73,5 %) — la suggestion envoyait
 * l'opérateur dans un mur. Une suggestion qui n'a pas été vérifiée n'est pas
 * une suggestion.
 */
const REPLIS: Record<string, string[]> = {
  "3a": ["2a", "2b", "1a"],
  "3b": ["2b", "2a", "1a"],
  "2a": ["2b", "1a"],
  "2b": ["2a", "1a"],
};

/** Largeur du sujet dans le cadre, sur le fond fourni. */
async function mesureSujet(subjectPng: Buffer, photoHeight: number) {
  const { data, info } = await sharp(subjectPng)
    .resize(GABARIT_WIDTH, photoHeight, { fit: "cover" })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, channels: C } = info;
  let minX = W, maxX = -1;
  for (let y = 0; y < photoHeight; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] < 128) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  return { largeur: maxX < minX ? 0 : (maxX - minX + 1) / W };
}

export interface GabaritFitReport {
  gabaritId: string;
  /** Recouvrement de chaque bulle par le sujet du fond, dans l'ordre du gabarit. */
  ratios: number[];
  /** true si toutes les bulles restent lisibles avec ce fond. */
  ok: boolean;
  /** Gabarit suggéré si `ok` est false — jamais appliqué automatiquement. */
  suggestion?: string;
  /** Message prêt à afficher à l'opérateur. */
  message: string;
}

/** Mesure brute d'un gabarit sur ce fond, sans jugement. */
async function ratiosFor(subjectPng: Buffer, gabaritId: string): Promise<number[] | null> {
  const bulles = BULLES[gabaritId];
  if (!bulles) return null;
  if (bulles.length === 0) return [];
  const meta = await sharp(subjectPng).metadata();
  const hauteurReelle =
    meta.width && meta.height
      ? Math.round((meta.height / meta.width) * GABARIT_WIDTH)
      : GABARIT_PHOTO_HEIGHT;
  const { ratios } = await measureBulleCoverage(
    subjectPng,
    bulles,
    GABARIT_WIDTH,
    GABARIT_HEIGHT,
    hauteurReelle,
  );
  return ratios;
}

const verdict = (ratios: number[]) => {
  if (ratios.length === 0) return true; // gabarit sans bulle
  return Math.max(...ratios) <= MAX_BULLE_COVERAGE;
};

/** Premier repli qui tient réellement sur ce fond, mesuré et non supposé. */
async function premierRepliValide(subjectPng: Buffer, gabaritId: string): Promise<string | undefined> {
  for (const candidat of REPLIS[gabaritId] ?? []) {
    const r = await ratiosFor(subjectPng, candidat);
    if (r && verdict(r)) return candidat;
  }
  return undefined;
}

export async function checkGabaritFit(
  subjectPng: Buffer,
  gabaritId: string,
): Promise<GabaritFitReport> {
  const bulles = BULLES[gabaritId];
  // La famille 1 affiche la photo en PLEIN CADRE ; les familles à bulles la
  // composent dans la zone haute. On mesure donc chacune dans son propre
  // repère, sinon le verdict porte sur une image que le gabarit n'affiche pas.
  // Toutes les familles composent la photo dans la même zone haute depuis le
  // 2026-08-21 — la famille 1 est les autres montages sans les bulles.
  // La hauteur de zone photo varie d'une image à l'autre : on la lit sur la
  // découpe elle-même, qui a exactement les dimensions du fond affiché.
  const meta = await sharp(subjectPng).metadata();
  const hauteurReelle =
    meta.width && meta.height
      ? Math.round((meta.height / meta.width) * GABARIT_WIDTH)
      : GABARIT_PHOTO_HEIGHT;
  const sujet = await mesureSujet(subjectPng, hauteurReelle);

  // Ce critère existe parce que des bulles posées au-dessus d'un sujet
  // minuscule flottent sans troisième plan. En image seule, un sujet petit
  // dans un large décor est un cadrage légitime — on ne le refuse pas.
  if (bulles && bulles.length > 0 && sujet.largeur > 0 && sujet.largeur < MIN_SUBJECT_WIDTH) {
    return {
      gabaritId,
      ratios: [],
      ok: false,
      message:
        `Le sujet n'occupe que ${(sujet.largeur * 100).toFixed(0)} % de la largeur (minimum ${(MIN_SUBJECT_WIDTH * 100).toFixed(0)} %) : ` +
        `il se lira comme un détail du décor, pas comme le sujet du post. ` +
        `Suggestion : prendre une photo où le sujet est plus grand dans le cadre.`,
    };
  }

  if (!bulles || bulles.length === 0) {
    // Famille 1 : même composition que les autres, sans bulle — il n'y a donc
    // plus rien de spécifique à contrôler au-delà de la taille du sujet.
    // Un contrôle « le sujet tombe-t-il dans le dégradé ? » existait quand la
    // famille 1 était en plein cadre ; il est devenu sans objet.
    return { gabaritId, ratios: [], ok: true, message: "Gabarit sans bulle : sujet correctement placé." };
  }

  const ratios = (await ratiosFor(subjectPng, gabaritId)) ?? [];
  const worst = Math.max(...ratios);
  const pct = ratios.map((r) => `${(r * 100).toFixed(0)} %`).join(" et ");

  const ok = worst <= MAX_BULLE_COVERAGE;
  if (ok) {
    return {
      gabaritId,
      ratios,
      ok: true,
      message: `Fond compatible avec le gabarit ${gabaritId.toUpperCase()} : le sujet effleure les bulles (${pct}).`,
    };
  }

  const suggestion = await premierRepliValide(subjectPng, gabaritId);
  return {
    gabaritId,
    ratios,
    ok: false,
    suggestion,
    message:
      `Ce fond laisse peu d'espace libre au-dessus du sujet : il recouvrirait ${pct} des bulles ` +
      `du gabarit ${gabaritId.toUpperCase()} (limite ${(MAX_BULLE_COVERAGE * 100).toFixed(0)} %). ` +
      (suggestion
        ? `Seul gabarit vérifié compatible avec ce fond : ${suggestion.toUpperCase()}.`
        : `Aucun gabarit à bulles ne convient à ce fond — utiliser un gabarit image seule (1A/1B), ou prendre une photo où le sujet occupe moins de place.`),
  };
}
