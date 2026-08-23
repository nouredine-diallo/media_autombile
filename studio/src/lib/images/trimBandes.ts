import "server-only";
import sharp from "sharp";

/**
 * Retire les bandes unies incrustées dans une photo source (letterbox blanc ou
 * noir laissé par un export précédent).
 *
 * Pourquoi : `test31.jpg` porte deux bandes blanches en haut et en bas. Le
 * pipeline n'a aucun moyen de savoir que ce n'est pas du contenu — elles
 * traversaient donc tout le traitement et ressortaient dans le montage final,
 * exactement le genre de micro-défaut qui trahit un post automatique.
 *
 * **Discriminant volontairement strict**, pour ne jamais rogner un fond de
 * studio uni (qui, lui, est du contenu) : une bande n'est retirée que si
 *   1. ses lignes sont quasi uniformes (écart-type faible),
 *   2. elle est franchement claire ou franchement sombre,
 *   3. elle se termine par une **rupture nette** de luminance — la signature
 *      d'un bord incrusté, qu'un dégradé de studio n'a pas,
 *   4. elle ne dépasse pas 20 % du côté concerné.
 */

const ECART_TYPE_MAX = 10;      // ligne « unie »
const RUPTURE_MIN = 28;         // saut de luminance marquant le bord
const PART_MAX = 0.2;           // jamais plus d'un cinquième d'un côté

interface Plan { data: Buffer; width: number; height: number; channels: number }

function statsLigne(p: Plan, y: number) {
  let s = 0, s2 = 0;
  for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * p.channels;
    const l = (p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3;
    s += l; s2 += l * l;
  }
  const m = s / p.width;
  return { moyenne: m, ecartType: Math.sqrt(Math.max(0, s2 / p.width - m * m)) };
}

function statsColonne(p: Plan, x: number) {
  let s = 0, s2 = 0;
  for (let y = 0; y < p.height; y++) {
    const i = (y * p.width + x) * p.channels;
    const l = (p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3;
    s += l; s2 += l * l;
  }
  const m = s / p.height;
  return { moyenne: m, ecartType: Math.sqrt(Math.max(0, s2 / p.height - m * m)) };
}

/** Épaisseur de bande depuis un bord, 0 si aucune bande franche. */
function epaisseur(
  n: number,
  stats: (i: number) => { moyenne: number; ecartType: number },
  depuisLaFin: boolean,
): number {
  const idx = (k: number) => (depuisLaFin ? n - 1 - k : k);
  const premier = stats(idx(0));
  const claire = premier.moyenne > 225;
  const sombre = premier.moyenne < 30;
  if (!claire && !sombre) return 0;
  if (premier.ecartType > ECART_TYPE_MAX) return 0;

  const max = Math.floor(n * PART_MAX);
  let k = 0;
  while (k < max) {
    const s = stats(idx(k));
    const unie = s.ecartType <= ECART_TYPE_MAX && (claire ? s.moyenne > 215 : s.moyenne < 40);
    if (!unie) break;
    k++;
  }
  if (k === 0 || k >= max) return 0;
  // Rupture nette au bord intérieur : sinon c'est un dégradé, donc du contenu.
  const suivante = stats(idx(k));
  if (Math.abs(suivante.moyenne - premier.moyenne) < RUPTURE_MIN) return 0;
  return k;
}

export interface BandesRetirees { haut: number; bas: number; gauche: number; droite: number }

/**
 * Écrit dans `sortie` la photo débarrassée de ses bandes, ou la recopie telle
 * quelle s'il n'y en a pas. Retourne ce qui a été retiré, pour trace.
 */
export async function retirerBandes(
  entree: string,
  sortie: string,
): Promise<BandesRetirees> {
  const { data, info } = await sharp(entree).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const p: Plan = { data, width: info.width, height: info.height, channels: info.channels };

  const haut = epaisseur(p.height, (y) => statsLigne(p, y), false);
  const bas = epaisseur(p.height, (y) => statsLigne(p, y), true);
  const gauche = epaisseur(p.width, (x) => statsColonne(p, x), false);
  const droite = epaisseur(p.width, (x) => statsColonne(p, x), true);

  const largeur = p.width - gauche - droite;
  const hauteur = p.height - haut - bas;
  if ((haut || bas || gauche || droite) && largeur > p.width * 0.5 && hauteur > p.height * 0.5) {
    await sharp(entree)
      .extract({ left: gauche, top: haut, width: largeur, height: hauteur })
      .toFile(sortie);
    return { haut, bas, gauche, droite };
  }
  await sharp(entree).toFile(sortie);
  return { haut: 0, bas: 0, gauche: 0, droite: 0 };
}
