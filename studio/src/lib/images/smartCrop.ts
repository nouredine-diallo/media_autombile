/**
 * Recadrage qui respecte les limites du sujet — correctif directeur
 * "Chantier 1" (2026-08-19). Le recadrage 4:5 précédent (`cropToAspect`,
 * `fit: "cover"` centré) coupait à travers la voiture dès qu'elle
 * n'occupait pas exactement le centre géométrique de la photo source :
 * math vérifiée sur les photos de test réelles (1500×1000, 3:2) vers la
 * cible 1080×1350 (4:5) — un crop "cover" centré ne garde que les 800px
 * centraux sur 1500 de large, soit 350px (23%) rognés de chaque côté,
 * assez pour couper une roue ou une aile si la voiture n'est pas
 * parfaitement centrée.
 *
 * Stratégie : utiliser la boîte englobante du masque de détourage
 * (`computeSubjectBoundingBox`) pour positionner (pas seulement
 * dimensionner) la fenêtre de recadrage — la garder entière avec une
 * marge, plutôt que de deviner un centrage qui marche par coïncidence.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SmartCropResult extends Rect {
  /**
   * true si la boîte englobante **+ la marge de respiration** tient dans la
   * fenêtre — le cas idéal (sujet entier, avec de l'air autour).
   *
   * ⚠️ Ne pas confondre avec `fitsSubject` : `fitsFully: false` ne veut PAS
   * dire que le sujet est coupé, seulement que la marge souhaitée n'est pas
   * disponible. C'est cette confusion qui a fait déclencher le fond flou à
   * tort sur `test33.jpeg` (2026-08-20) : le sujet y tenait entièrement
   * (1001px de large pour une fenêtre de 1024px), il manquait juste la
   * marge de 6% — et le repli en fond flou affichait alors la photo entière
   * réduite, ramenant le sujet à ~49% du cadre au lieu de ~98%.
   */
  fitsFully: boolean;
  /**
   * true si la boîte englobante **seule** (sans marge) tient dans la fenêtre :
   * le recadrage strict ne coupe alors pas dans le sujet. C'est la vraie
   * limite dure (CLAUDE.md §1.1, Chantier 1) et le seul critère qui doit
   * décider d'un repli en fond flou.
   */
  fitsSubject: boolean;
}

/**
 * Marge autour de la boîte englobante, en fraction de sa plus grande
 * dimension. TODO valeur provisoire (CLAUDE.md §4.3) : posée à 6% par
 * défaut de respiration éditoriale raisonnable, pas mesurée contre une
 * charte graphique — à valider avec le graphiste si un standard existe.
 */
export const DEFAULT_MARGIN_RATIO = 0.06;

/**
 * Part de la largeur du cadre que le sujet doit occuper quand la source le
 * permet — **mesurée**, pas choisie : sur la référence réelle
 * `inspi/5776137084027474227.jpg`, la voiture occupe 76,7% de la largeur du
 * montage publié (mesure du directeur, recoupée par l'ajustement de cercle
 * des bulles du 2026-08-20). C'est un cadrage serré mais qui respire encore.
 *
 * Ce n'est pas une garantie : si la source n'a pas assez de hauteur pour une
 * fenêtre aussi large au ratio cible, on retombe sur la plus grande fenêtre
 * possible (donc une occupation plus forte, sujet plus près des bords). Le
 * sujet n'est jamais coupé pour atteindre cette cible.
 */
export const DEFAULT_SUBJECT_OCCUPANCY = 0.767;

// Contrainte de hauteur du sujet (40% du cadre) : essayée le 2026-08-20,
// **retirée le 2026-08-21** après mesure sur les 5 fonds de test. Elle ne
// changeait rien sur `test33.jpeg` (77%/39%) ni `test21.jpg` (77%/47%), et
// presque rien sur `test1.jpg` (74% au lieu de 77%) — mais sur un sujet plus
// haut que large elle dominait et forçait la fenêtre au maximum :
// `test12.avif` (boîte 261×336) tombait à **28,6% de largeur**, produisant un
// montage sans sujet principal lisible (constaté sur le rendu Renault).
//
// Leçon actée : le recadrage a pour seul travail de bien cadrer le sujet
// (cible de largeur mesurée sur la référence). Décider si ce cadrage est
// compatible avec le gabarit choisi est le travail du contrôle qualité
// (`gabaritFit.ts`), qui dispose de la géométrie réelle des bulles. Mélanger
// les deux donnait un recadrage qui ne satisfaisait ni l'un ni l'autre.

/**
 * Air laissé sous le sujet, en fraction de la hauteur de la fenêtre. Le sujet
 * est ancré vers le bas de la zone photo (voir `computeSubjectAwareCrop`) ;
 * 2% évite qu'il touche exactement le bord quand la source le permet. Si la
 * source n'a rien sous le sujet (cas de `test33.jpeg`, dont le masque touche
 * le bas du fichier), le cadrage est simplement borné à la source et le sujet
 * finit au ras du bord — comportement identique à avant ce changement.
 */
const BOTTOM_MARGIN_RATIO = 0.02;

/**
 * Agrandissement maximal toléré entre la fenêtre de recadrage et le cadre
 * final. Au-delà, l'image devient molle.
 *
 * Constaté le 2026-08-22 sur `test12.avif` (Renault 5 vue de loin, boîte de
 * 261 px dans une source de 1200) : viser 76,7 % d'occupation donnait une
 * fenêtre de 363 px agrandie **2,98×** vers 1080 — voiture floue. Mieux vaut
 * un sujet plus petit et net qu'un sujet cadré serré et mou : on plafonne
 * donc le zoom, quitte à ne pas atteindre l'occupation cible.
 */
const AGRANDISSEMENT_MAX = 1.6;

/**
 * Calcule la fenêtre de recadrage (en coordonnées pixel de l'image
 * source) au ratio cible `targetW/targetH`, qui contient entièrement
 * `bbox` (+ marge) quand c'est possible, sinon centrée sur `bbox` en
 * acceptant de couper le moins possible.
 */
export function computeSubjectAwareCrop(
  sourceWidth: number,
  sourceHeight: number,
  bbox: Rect,
  targetWidth: number,
  targetHeight: number,
  marginRatio: number = DEFAULT_MARGIN_RATIO,
  subjectOccupancy: number = DEFAULT_SUBJECT_OCCUPANCY,
): SmartCropResult {
  const targetAspect = targetWidth / targetHeight;

  // Plus grande fenêtre au ratio cible qui tient dans la source.
  let maxCropW = sourceHeight * targetAspect;
  if (maxCropW > sourceWidth) maxCropW = sourceWidth;

  // Fenêtre visée : celle qui donne au sujet l'occupation mesurée sur la
  // référence. Bornée par la plus grande fenêtre possible — on dézoome vers
  // la cible quand la source le permet, on ne zoome jamais au-delà de ce
  // qu'elle contient. Avant le 2026-08-20 la fenêtre maximale était utilisée
  // systématiquement, ce qui collait le sujet aux bords (97,8% sur
  // `test33.jpeg`) au lieu des ~77% de la référence.
  const desiredW = subjectOccupancy > 0 ? bbox.width / subjectOccupancy : maxCropW;
  // Plancher : ne jamais rétrécir la fenêtre au point de couper le sujet —
  // ni en largeur, ni en hauteur (une fenêtre plus étroite est aussi plus
  // courte au ratio cible, ce qui pourrait trancher un sujet haut).
  const minCropW = Math.max(bbox.width, bbox.height * targetAspect);
  // Plancher de définition : ne jamais réduire la fenêtre au point d'agrandir
  // l'image au-delà de `AGRANDISSEMENT_MAX`.
  const minCropNettete = targetWidth / AGRANDISSEMENT_MAX;
  const cropW = Math.min(maxCropW, Math.max(desiredW, minCropW, minCropNettete));
  const cropH = cropW / targetAspect;

  const margin = Math.max(bbox.width, bbox.height) * marginRatio;
  const neededW = bbox.width + 2 * margin;
  const neededH = bbox.height + 2 * margin;

  const bboxCx = bbox.left + bbox.width / 2;

  const fitsFully = neededW <= cropW && neededH <= cropH;
  // Tolérance de 4 % sur le débordement du sujet : le masque a des bords
  // flous et sa boîte englobante inclut souvent reflets et ombre portée.
  // Refuser le recadrage strict pour 2 % d'écart fait basculer sur le fond
  // flou en bandes, **bien plus laid** que de rogner quelques pixels d'un bord
  // de masque incertain. Constaté le 2026-08-22 sur `test7.webp` (Formula E) :
  // boîte de 1787 px pour une fenêtre de 1751, soit 2,1 % — le montage
  // partait en letterbox flou pour rien.
  const TOLERANCE_DEBORDEMENT = 1.04;
  const fitsSubject =
    bbox.width <= cropW * TOLERANCE_DEBORDEMENT && bbox.height <= cropH * TOLERANCE_DEBORDEMENT;

  let left = bboxCx - cropW / 2;
  // Ancrage vertical : le sujet est posé en BAS de la fenêtre, pas centré.
  // Mesuré sur la référence — la voiture y occupe le bas de la zone photo,
  // l'espace libre est au-dessus, c'est lui qui accueille les bulles. Un
  // centrage vertical place au contraire le sujet pile derrière les bulles :
  // constaté sur `test1.jpg` et `test2.jpg`, où la voiture disparaissait
  // entièrement derrière les deux cercles.
  let top = bbox.top + bbox.height + BOTTOM_MARGIN_RATIO * cropH - cropH;

  // L'ancrage bas ne doit JAMAIS pousser le sujet hors du cadre. Quand le
  // sujet occupe déjà toute la hauteur de la fenêtre, la marge de 2 % le
  // faisait dépasser par le haut : 7 px de toit coupés sur `test12.avif`
  // (mesuré le 2026-08-22). On borne donc l'ancrage par la boîte elle-même.
  if (bbox.height <= cropH) {
    top = Math.min(bbox.top, Math.max(bbox.top + bbox.height - cropH, top));
  }

  // Même garde horizontalement.
  if (bbox.width <= cropW) {
    left = Math.min(bbox.left, Math.max(bbox.left + bbox.width - cropW, left));
  }

  // Clamp aux limites de l'image — ne jamais demander un extract hors cadre.
  left = Math.max(0, Math.min(sourceWidth - cropW, left));
  top = Math.max(0, Math.min(sourceHeight - cropH, top));

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cropW),
    height: Math.round(cropH),
    fitsFully,
    fitsSubject,
  };
}

// Une variante "étirement léger plafonné" a été essayée le 2026-08-20 pour
// éviter le fond flou (voir historique CLAUDE.md §1.1) puis écartée par
// l'utilisateur (déformation jugée trop perceptible sur des cas comme
// test3.webp) — retour au fond flou/assombri comme seul repli, voir
// `cropWithBlurredBackdrop` dans `pipeline.ts`.
//
// Note sur l'occupation atteignable (corrigée le 2026-08-20, soir) : une
// version antérieure de ce commentaire affirmait que viser une occupation
// cible (~77%, mesurée sur la référence) était "impossible à garantir" parce
// que la fenêtre maximale d'une source 3:2 vers un cadre 4:5 plein donne 97,8%
// sur `test33.jpeg`. C'était vrai **uniquement** sous l'hypothèse que la photo
// remplit tout le canevas 1080×1350. Or la référence ne fait pas ça : sa photo
// occupe la partie haute du montage et le bandeau de titre occupe le reste.
// Avec un ratio cible plus large (zone photo = 70% de la hauteur du canevas,
// soit 1080×945), la fenêtre au ratio cible peut faire 1305px de large sur
// cette même source — l'occupation de 76,7% de la référence est alors
// exactement atteignable. La contrainte réelle n'était pas la source, c'était
// le ratio qu'on lui demandait.


/**
 * Hauteur de la zone photo à retenir **pour cette image précise**, en fraction
 * de la hauteur du canevas.
 *
 * Pourquoi ce n'est plus une constante (2026-08-22) : la zone photo fixée à
 * 74 % impose un ratio de 1,081. Une photo courte dont le sujet est large ne
 * peut alors pas contenir son sujet — `test6.jpg` (Supra, 1024×676, boîte de
 * 805 px) exigerait 745 px de hauteur source, il n'y en a que 676 — et le
 * pipeline basculait sur le fond flou en bandes. Sur cinq montages de contrôle
 * du 2026-08-22, deux tombaient dans ce repli.
 *
 * En laissant la zone photo se raccourcir juste ce qu'il faut, la même photo
 * tient sans flou ni déformation. Le prix est un bandeau de titre un peu plus
 * haut et une rampe de dégradé un peu plus courte — sans commune mesure avec
 * un letterbox flou.
 *
 * Bornes : jamais plus que la valeur de référence (74 %, celle calée sur les
 * posts publiés), jamais moins de 62 % — en deçà le bandeau mangerait plus du
 * tiers du montage.
 */
export const ZONE_PHOTO_REFERENCE = 0.74;
export const ZONE_PHOTO_MINIMALE = 0.62;

export function hauteurZonePhoto(
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  bbox: Rect,
  marginRatio: number = DEFAULT_MARGIN_RATIO,
): number {
  const besoinLargeur = Math.min(sourceWidth, bbox.width * (1 + 2 * marginRatio));
  // Ratio minimal (largeur/hauteur) pour que cette largeur tienne dans la
  // hauteur disponible de la source.
  const ratioMini = besoinLargeur / sourceHeight;
  const hauteurIdeale = canvasWidth / ratioMini / canvasHeight;
  const retenue = Math.min(ZONE_PHOTO_REFERENCE, Math.max(ZONE_PHOTO_MINIMALE, hauteurIdeale));
  return Math.round(canvasHeight * retenue);
}
