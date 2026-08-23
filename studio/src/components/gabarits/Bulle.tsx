import { GABARIT_1A_WIDTH, GABARIT_BULLE_HEIGHT, GABARIT_BULLE_WIDTH } from "./Gabarit1A";

/** Position/taille d'une bulle, réutilisée par edgeLuminance.ts pour savoir où échantillonner le fond. */
export interface BulleGeometry {
  leftPercent: number;
  topPercent: number;
  sizePercent: number;
}

export interface BulleProps {
  imageUrl: string;
  /** Diamètre, en % de la largeur du canvas. */
  sizePercent: number;
  /** Position du centre du cercle, en % de la largeur/hauteur du canvas. */
  leftPercent: number;
  topPercent: number;
  zIndex?: number;
  /**
   * `box-shadow` CSS précalculé, adaptatif au contraste du fond à cet
   * emplacement précis (voir `src/lib/images/edgeLuminance.ts`, correctif
   * directeur 2026-08-19). Calculé côté serveur dans
   * `src/app/render/[gabaritId]/page.tsx` (seul point d'entrée qui compte
   * pour la parité aperçu/export) à partir de l'image de fond réelle.
   * Repli sur `DEFAULT_SHADOW` si absent — ex. `GabaritPreviewClient.tsx`,
   * l'outil d'aperçu de développement, qui ne calcule pas cette valeur.
   */
  shadow?: string;
  /**
   * Chantier 3 — découpe alpha du sujet de CETTE image de bulle
   * (`?variant=subject-cropped`), dessinée par-dessus l'anneau et **sans
   * clipping circulaire** : là où le sujet dépasse naturellement du cercle,
   * il reste visible au lieu d'être tranché net par le masque rond.
   *
   * Effet mesuré sur `inspi/5776137084027474227.jpg` (2026-08-20) : l'arrière
   * de la Mercedes de la bulle droite dépasse d'environ 20px au-delà du bord
   * extérieur de l'anneau, qui est interrompu à cet endroit puis reprend
   * en dessous. Vérifié par profil radial + zoom pixel, pas à l'impression.
   *
   * Rien n'est forcé : si le sujet tient dans le cercle, cette couche est
   * strictement invisible (elle est alignée pixel pour pixel sur l'image du
   * dessous) et le rendu est identique à avant.
   */
  sujetUrl?: string;
  /**
   * Plan de la couche de débordement, indépendant de celui du cercle.
   *
   * Mesuré sur `inspi/5776137084027474227.jpg` (2026-08-21) : l'avant de la
   * voiture de la bulle **droite** (roue et aile) sort du cercle vers la gauche
   * et passe **par-dessus la bulle gauche**, alors que le disque de la bulle
   * droite, lui, est bien derrière. Les débordements sont donc tous au-dessus
   * de tous les cercles, et non collés chacun au plan de son propre cercle —
   * c'est ce qui donne la continuité de la voiture d'une bulle à l'autre.
   */
  overflowZIndex?: number;
  /**
   * Cadrage du contenu DANS la bulle : `"zoom,décalageX,décalageY"`, les
   * décalages en % du diamètre. Zoomer agrandit le sujet par rapport au
   * cercle : c'est le levier qui rend le débordement lisible quand le sujet
   * est trop petit, et qui permet de recadrer sans repasser par le serveur.
   *
   * Appliqué **à l'identique** à l'image du cercle et à la couche de
   * débordement : sans ça les deux se décalent et l'effet se voit comme un
   * fantôme.
   */
  cadre?: string;
}

/** Lit un cadrage `"zoom,dx,dy"`. Zoom borné : au-delà de 2,2× le recadrage de bulle (1350 px) manque de définition dans un cercle de ~500 px. */
export function lireCadre(valeur: string | undefined): { zoom: number; dx: number; dy: number } {
  const defaut = { zoom: 1, dx: 0, dy: 0 };
  if (!valeur) return defaut;
  const p = valeur.split(",").map((v) => Number.parseFloat(v));
  if (p.length !== 3 || p.some((v) => !Number.isFinite(v))) return defaut;
  return {
    zoom: Math.min(2.2, Math.max(0.6, p[0])),
    dx: Math.min(60, Math.max(-60, p[1])),
    dy: Math.min(60, Math.max(-60, p[2])),
  };
}

/**
 * Lit une géométrie de bulle transmise par l'aperçu sous la forme
 * `"gauche,haut,diamètre"` (en % du canevas). Chaîne vide ou malformée →
 * on garde la géométrie mesurée sur la référence. L'opérateur ne saisit
 * jamais ces valeurs : elles sont produites en déplaçant la bulle.
 */
export function lireGeometrie(
  valeur: string | undefined,
  defaut: BulleGeometry,
): BulleGeometry {
  if (!valeur) return defaut;
  const p = valeur.split(",").map((v) => Number.parseFloat(v));
  if (p.length !== 3 || p.some((v) => !Number.isFinite(v))) return defaut;
  const [leftPercent, topPercent, sizePercent] = p;
  if (sizePercent <= 0 || sizePercent > 100) return defaut;
  return { leftPercent, topPercent, sizePercent };
}

/** Épaisseur de l'anneau blanc, en px du canevas (≈1,2% de 1080). */
export const BULLE_RING_PX = 13;

/**
 * Rayon maximal de la couche de débordement, en multiple du rayon du cercle.
 * **Mesuré** sur `inspi/5776137084027474227.jpg` : l'arrière de la Mercedes
 * de la bulle droite dépasse d'environ 21px au-delà du bord extérieur de
 * l'anneau (rayon ~250px), soit 1,08×. 1,14 laisse une marge sans jamais
 * changer l'échelle de l'image — seule la fenêtre visible s'agrandit.
 *
 * La zone est un **disque**, pas un carré : un carré laisserait passer le
 * sujet jusque dans ses coins (à 45°, 1,41× le rayon), ce qui transforme un
 * léger débordement en large bavure — constaté sur le premier essai du
 * 2026-08-20 avec la photo de tableau de bord `test31.webp`.
 */
const OVERFLOW_BOX_SCALE = 1.14;

/**
 * Ombre par défaut — valeur fixe validée visuellement contre la référence
 * Porsche (fond clair) le 2026-08-19, conservée comme repli quand aucune
 * ombre adaptative n'est fournie. Voir `shadowForLuminance` pour le calcul
 * adaptatif réel utilisé par le rendu final.
 */
const DEFAULT_SHADOW = "0 0 10px 3px rgba(0,0,0,0.45),0 6px 18px rgba(0,0,0,0.3)";

/**
 * Inset circulaire ("bulle") : bordure blanche + ombre portée.
 *
 * Bordure recalibrée le 2026-08-19 contre 2 références (Mercedes/Porsche) :
 * épaisseur mesurée ~1.1-1.3% de la largeur du cadre sur les références,
 * contre ~0.74% (8px/1080) précédemment — portée à 13px (~1.2%).
 *
 * Ombre rendue adaptative au contraste du fond le 2026-08-19 (voir
 * `shadow` ci-dessus) — un halo sombre fixe devenait invisible sur les
 * fonds déjà sombres (test `test2-wec-hypercars*.png`, confirmé par le
 * directeur).
 */
export function Bulle({
  imageUrl,
  sizePercent,
  leftPercent,
  topPercent,
  zIndex,
  shadow,
  sujetUrl,
  cadre,
  overflowZIndex,
  canvasWidth = GABARIT_1A_WIDTH,
  imageAspectRatio = GABARIT_BULLE_WIDTH / GABARIT_BULLE_HEIGHT,
}: BulleProps & { canvasWidth?: number; imageAspectRatio?: number }) {
  // Reproduit exactement la géométrie de `object-cover` de l'image du
  // dessous, pour que la couche de débordement soit alignée au pixel :
  // l'image remplit la boîte de contenu (diamètre moins l'anneau) en
  // largeur, déborde en hauteur, et reste centrée sur le centre du cercle.
  const outerDiameter = (sizePercent / 100) * canvasWidth;
  const innerDiameter = outerDiameter - 2 * BULLE_RING_PX;
  // `object-cover` dans un carré : l'image est mise à l'échelle par sa plus
  // petite dimension. Une image paysage déborde donc en largeur, une image
  // portrait en hauteur — les deux cas doivent être calculés, sans quoi la
  // couche de débordement se décale de l'image du dessous.
  const renderedWidth = imageAspectRatio >= 1 ? innerDiameter * imageAspectRatio : innerDiameter;
  const renderedHeight = imageAspectRatio >= 1 ? innerDiameter : innerDiameter / imageAspectRatio;

  // Cadrage du contenu : même transformation pour l'image du cercle et pour la
  // couche de débordement, autour du même centre.
  const c = lireCadre(cadre);
  const transformCadre = `translate(${c.dx}%, ${c.dy}%) scale(${c.zoom})`;

  return (
    <>
      <div
        className="absolute overflow-hidden rounded-full border-[13px] border-white"
        style={{
          width: `${sizePercent}%`,
          aspectRatio: "1 / 1",
          left: `${leftPercent}%`,
          top: `${topPercent}%`,
          transform: "translate(-50%, -50%)",
          zIndex: zIndex ?? 0,
          boxShadow: shadow ?? DEFAULT_SHADOW,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          style={{ transform: transformCadre }}
        />
      </div>
      {sujetUrl && (
        <div
          className="absolute overflow-hidden rounded-full"
          style={{
            width: outerDiameter * OVERFLOW_BOX_SCALE,
            height: outerDiameter * OVERFLOW_BOX_SCALE,
            left: `${leftPercent}%`,
            top: `${topPercent}%`,
            transform: "translate(-50%, -50%)",
            zIndex: overflowZIndex ?? (zIndex ?? 0) + 1,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
          <img
            src={sujetUrl}
            alt=""
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: renderedWidth,
              height: renderedHeight,
              transform: `translate(-50%, -50%) ${transformCadre}`,
            }}
          />
        </div>
      )}
    </>
  );
}


/**
 * Géométrie de la bulle pour la famille « 1 image + 1 bulle ».
 *
 * **Mesurée sur les trois références disponibles** (2026-08-22,
 * `scripts/dev-fit-bulles.mjs`) — et elles ne disent pas « toujours au même
 * endroit » :
 *
 * ```
 *   référence            position horizontale   diamètre
 *   1.png  Supra                51,9 % (centrée)   49,6 %
 *   3.png  Haaland              50,0 % (centrée)   63,0 %
 *   2.png  Disney+ / Formula E  30,6 % (à gauche)  44,4 %
 * ```
 *
 * Disney+ n'est pas une exception arbitraire : sa Formula E occupe toute la
 * droite du cadre, et la bulle est allée à gauche. **La bulle se place là où le
 * sujet n'est pas.** D'où la règle retenue : miroir du centre de gravité
 * horizontal du sujet autour de l'axe, borné — ce qui redonne 50 % quand le
 * sujet est centré (Supra, Haaland) et décale quand il ne l'est pas (Disney+ :
 * sujet à ~65 % → bulle à 35 %, mesuré 30,6 %).
 *
 * La **hauteur** n'est pas fixe non plus : elle est calculée pour que le bas de
 * la bulle passe sous le haut du sujet, ce qui déclenche le contact et
 * l'empilement déjà construits. Recouvrement visé : 13 points de hauteur de
 * canevas, valeur médiane des trois références (10 à 17).
 *
 * Le **diamètre** est fixe à 54 % — médiane des trois mesures (44,4 / 49,6 /
 * 63,0). Un diamètre calculé par photo n'aurait aucun appui dans les
 * références : elles varient selon le contenu de la bulle, pas selon le fond.
 */
export const DIAMETRE_BULLE_UNIQUE = 54;
const RECOUVREMENT_VISE = 13;

export function geometrieBulleUnique(
  sujetHautPercent: number,
  sujetCentreXPercent: number,
  canvasWidth: number,
  canvasHeight: number,
  centree: boolean,
): BulleGeometry {
  const rayonPercentHauteur = ((DIAMETRE_BULLE_UNIQUE / 100) * canvasWidth) / 2 / canvasHeight * 100;
  const centreY = sujetHautPercent + RECOUVREMENT_VISE - rayonPercentHauteur;
  const leftPercent = centree
    ? 50
    : Math.min(72, Math.max(28, 100 - sujetCentreXPercent));
  return {
    leftPercent,
    // Bornes : au-dessus de 20 % la bulle décolle du haut du cadre, au-delà de
    // 36 % son bas entre dans le dégradé du bandeau de titre.
    topPercent: Math.min(36, Math.max(20, centreY)),
    sizePercent: DIAMETRE_BULLE_UNIQUE,
  };
}

/**
 * Diamètre de base pour la configuration à 2 bulles.
 * Légèrement réduit par rapport à la bulle unique (54%) pour compenser
 * l'encombrement horizontal et éviter qu'elles ne tombent trop bas.
 */
export const DIAMETRE_BASE_DOUBLE = 50;
const CHEVAUCHEMENT_CIBLE = 8; // En pourcentage de la largeur du canevas

export function geometrieBulleDouble(
  sujetHautPercent: number,
  sujetCentreXPercent: number,
  canvasWidth: number,
  canvasHeight: number,
  ratioGauche: number = 0.5,
): [BulleGeometry, BulleGeometry] {
  // Le ratioGauche (ex: 0.6 pour 60/40) répartit le diamètre total (qui est 2 * DIAMETRE_BASE_DOUBLE)
  const sizePercent1 = Math.round(DIAMETRE_BASE_DOUBLE * (ratioGauche * 2) * 10) / 10;
  const sizePercent2 = Math.round(DIAMETRE_BASE_DOUBLE * ((1 - ratioGauche) * 2) * 10) / 10;

  // Hauteur : on se base sur la plus grande bulle pour le calcul d'ancrage afin de garantir le contact
  const maxDiameter = Math.max(sizePercent1, sizePercent2);
  const rayonPercentHauteur = ((maxDiameter / 100) * canvasWidth) / 2 / canvasHeight * 100;
  const centreY = sujetHautPercent + RECOUVREMENT_VISE - rayonPercentHauteur;
  // On limite la hauteur pour ne pas descendre dans le titre (un peu plus strict que la bulle unique)
  const topPercent = Math.min(35, Math.max(20, centreY));

  // Écartement horizontal
  const distance = (sizePercent1 + sizePercent2) / 2 - CHEVAUCHEMENT_CIBLE;
  
  // Bornes pour garder les bulles dans le cadre (laissent déborder de ~5% max)
  const margeBord = -5; 
  const minCentreX = sizePercent1 / 2 + margeBord + distance / 2;
  const maxCentreX = 100 - sizePercent2 / 2 - margeBord - distance / 2;
  const clampedCentreX = Math.max(minCentreX, Math.min(maxCentreX, sujetCentreXPercent));

  return [
    {
      leftPercent: Math.round((clampedCentreX - distance / 2) * 10) / 10,
      topPercent: Math.round(topPercent * 10) / 10,
      sizePercent: sizePercent1,
    },
    {
      leftPercent: Math.round((clampedCentreX + distance / 2) * 10) / 10,
      topPercent: Math.round(topPercent * 10) / 10,
      sizePercent: sizePercent2,
    },
  ];
}
