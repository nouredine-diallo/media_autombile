import { Roboto } from "next/font/google";

/**
 * Police partagée par tous les gabarits.
 *
 * Remplace Poppins (2026-08-18) — le directeur a fourni 2 nouvelles
 * références (inspi/, posts Mercedes "Essayez de trouver…" et Porsche
 * "Porsche dévoile la Flachbau RS…") sur lesquelles Poppins ne correspond
 * visiblement pas : tracé plus curviligne/géométrique que les références,
 * qui sont plus condensées et anguleuses (jambage du "R" droit, pas courbe).
 * Ré-identifiée le 2026-08-19 par la même méthode (comparaison visuelle
 * rendue, voir scripts/dev-shot-fonts.mjs) contre 5 nouveaux candidats
 * (Archivo Black, Barlow Semi Condensed, Inter, Roboto, Work Sans) sur le
 * texte réel des 2 nouvelles références : Roboto 900 est le match le plus
 * net (jambage du "R" droit, spur du "G" avec sa barre horizontale
 * caractéristique, "9" identique). Licence Apache 2.0 (Google Fonts, sans
 * ambiguïté). Confiance : forte mais non confirmée sur fichier source,
 * même réserve que pour Poppins (CLAUDE.md §6.2) — à valider avec le
 * graphiste si une charte existe.
 */
export const titleFont = Roboto({
  subsets: ["latin"],
  weight: ["500", "700"],
});

/**
 * Réglages typographiques du titre — repris du **fichier Photoshop de travail
 * du directeur** (2026-08-20), désormais la source qui fait foi devant toute
 * déduction visuelle sur des posts publiés :
 *   police Helvetica Neue, graisse Bold, corps 75 pt, interlignage 75 pt
 *   (100%), crénage -30 (soit -0,03 em).
 *
 * Helvetica Neue est commerciale (Monotype/Linotype) : la posséder sur le Mac
 * du directeur pour Photoshop ne donne aucun droit de l'intégrer dans un outil
 * web. Option retenue avec l'utilisateur : **police libre visuellement très
 * proche**.
 *
 * Choix arbitré par la mesure, pas à l'œil (`src/app/dev-font-compare`,
 * capture `test/font-compare.png`) : rapport largeur/hauteur-de-capitale de
 * "Mercedes AMG" comparé à la référence `inspi/5776137084027474227.jpg`
 * (8,773 mesuré sur la référence) —
 *   Roboto 700 .............. -0,9 %   <- retenu
 *   Nimbus Sans Bold ........ +1,6 %   (clone Helvetica, mais AGPL-3, voir ci-dessous)
 *   Arimo 700 (Arial) ....... +5,0 %
 *   Archivo 700 ............. +6,7 %
 *   Inter 700 ............... +12,1 %  <- le plus éloigné
 *
 * **Inter, pourtant cité comme candidat naturel, est le pire des cinq** — la
 * mesure contredit l'intuition, d'où l'intérêt de l'avoir faite.
 *
 * `Nimbus Sans` (clone Helvetica d'URW, présent sur les machines Linux) a été
 * écarté après lecture de sa licence réelle
 * (`/usr/share/doc/fonts-urw-base35/copyright`) : **AGPL-3 avec exception de
 * police**, et cette exception ne couvre que l'inclusion dans un fichier
 * PostScript ou PDF — pas la diffusion par un outil web. Même nature de piège
 * que `@imgly/background-removal` déjà refusé pour AGPL (§3.3).
 *
 * Graisse : le gabarit utilisait Roboto **900**, nettement plus gras que le
 * "Bold" du PSD. Ramené à 700.
 */
export const TITLE_FONT_SIZE = 75;

/**
 * Corps du titre adapté à sa longueur, pour qu'il ne déborde jamais sur la
 * photo.
 *
 * Mesuré le 2026-08-22 : à 75 px, un titre de 74 caractères tient en 3 lignes
 * et sa première ligne commence à 75,3 % de la hauteur — juste sous la zone
 * photo (74 %). Un titre de 95 caractères (celui du post Haaland de `inspi/`)
 * passe à 4 lignes et remonte à **69,8 %**, donc **sur la photo**.
 *
 * ⚠️ Contradiction à trancher avec la direction (§8) : le fichier Photoshop
 * indique 75 pt, mais les deux posts publiés mesurés donnent un corps
 * équivalent à ~65 px sur un canevas de 1080 — c'est ce qui leur permet de
 * tenir le titre Haaland en 3 lignes. Tant que ce n'est pas tranché, on garde
 * 75 px comme valeur nominale et on **réduit seulement quand c'est nécessaire**
 * : le corps ne baisse que ce qu'il faut pour que le bloc reste sous la
 * zone photo.
 */
export function tailleTitre(titre: string): number {
  const n = titre.trim().length;
  if (n === 0) return TITLE_FONT_SIZE;
  // Calibré sur des rendus réels : à 75 px, une ligne tient ~25 caractères,
  // donc `caractères par ligne × corps ≈ 1875`. Et un bloc de titre reste
  // sous la zone photo tant que sa hauteur ne dépasse pas ~225 px
  // (vérifié : 3 lignes × 75 px et 4 lignes × 56 px tiennent toutes deux).
  const CONSTANTE_CHASSE = 1875;
  const HAUTEUR_MAX = 225;
  for (let corps = TITLE_FONT_SIZE; corps >= 48; corps -= 1) {
    const parLigne = CONSTANTE_CHASSE / corps;
    const lignes = Math.ceil(n / parLigne);
    if (lignes * corps <= HAUTEUR_MAX) return corps;
  }
  return 48;
}
export const TITLE_LINE_HEIGHT = 1.0;
export const TITLE_LETTER_SPACING = "-0.03em";

/**
 * Réglages typographiques du paragraphe (gabarit 1B).
 *
 * Le paragraphe est un bloc de lecture : police plus petite, graisse medium
 * (500) au lieu de bold (700), interlignage plus aéré (1.4) pour la
 * lisibilité. Pas de crénage condensé — le texte doit être confortable
 * à lire, pas percutant comme un titre.
 *
 * Le corps s'adapte à la longueur du texte pour que le bloc reste dans la
 * zone noire (min-height 40% du canevas = 544 px, logo ~120 px en bas,
 * soit ~424 px disponibles pour le texte).
 */
export const PARAGRAPH_FONT_SIZE_MAX = 48;
export const PARAGRAPH_FONT_SIZE_MIN = 38;
export const PARAGRAPH_LINE_HEIGHT = 1.4;
export const PARAGRAPH_LETTER_SPACING = "0em";

/**
 * Corps du paragraphe adapté à sa longueur.
 *
 * À 48 px, une ligne tient ~33 caractères (Roboto 500, plus étroit que 700).
 * Constante de chasse : 48 × 33 ≈ 1584. Le bloc texte ne doit pas dépasser
 * ~424 px (zone noire 40% − logo − padding).
 */
export function tailleParagraphe(texte: string): number {
  const n = texte.replace(/\*\*/g, "").trim().length;
  if (n === 0) return PARAGRAPH_FONT_SIZE_MAX;
  const CONSTANTE_CHASSE = 1584;
  const HAUTEUR_MAX = 424;
  for (let corps = PARAGRAPH_FONT_SIZE_MAX; corps >= PARAGRAPH_FONT_SIZE_MIN; corps -= 1) {
    const parLigne = CONSTANTE_CHASSE / corps;
    const lignes = Math.ceil(n / parLigne);
    const hauteur = lignes * corps * PARAGRAPH_LINE_HEIGHT;
    if (hauteur <= HAUTEUR_MAX) return corps;
  }
  return PARAGRAPH_FONT_SIZE_MIN;
}

/**
 * Seuil de bascule d'alignement pour le paragraphe 1B.
 *
 * En dessous de ce nombre de caractères, le texte est centré (effet titre).
 * Au-dessus, il passe à gauche (effet paragraphe/légende).
 * Mesuré sur les posts réels : un paragraphe court (Forza) reste centré,
 * un paragraphe dense (Parking, Maserati) doit être à gauche pour être
 * lisible — une ligne centrée de 8+ est illisible.
 */
export const PARAGRAPH_ALIGN_THRESHOLD = 80;
