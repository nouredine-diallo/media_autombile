import { GABARIT_1A_HEIGHT, GABARIT_PHOTO_HEIGHT } from "./Gabarit1A";
import {
  tailleTitre,
  TITLE_FONT_SIZE,
  TITLE_LETTER_SPACING,
  TITLE_LINE_HEIGHT,
} from "./fonts";

export interface TitleFooterProps {
  title: string;
  /** Ligne courte optionnelle au-dessus du titre — pattern observé sur un post réel (inspi/, Mercedes). */
  eyebrow?: string;
  /**
   * Hauteur réelle de la zone photo, en px du canevas. Le noir plein doit
   * tomber exactement sur son bord bas, sinon une couture apparaît. Cette
   * hauteur varie d'une image à l'autre depuis le 2026-08-22 : une photo
   * courte au sujet large raccourcit la zone plutôt que de basculer sur le
   * fond flou en bandes (voir `hauteurZonePhoto`).
   */
  hauteurPhoto?: number;
}

/** Le bloc occupe de 54 % à 100 % du canevas, soit 46 points de hauteur. */
const BLOCK_TOP_PERCENT = 54;
const BLOCK_SPAN = 100 - BLOCK_TOP_PERCENT;

/** Convertit une hauteur en % du canevas vers un % de la hauteur du bloc. */
const toBlock = (canvasPercent: number) =>
  ((canvasPercent - BLOCK_TOP_PERCENT) / BLOCK_SPAN) * 100;

/**
 * Points de la courbe, en [hauteur % du canevas, opacité du noir], mesurés sur
 * les 7 posts de `inspi/` pour une zone photo de 74 %.
 */
/**
 * Corps et interlignage du bloc logo « Le Média / Automobile ».
 *
 * **Mesurés** sur `inspi/5776137084027474227.jpg` le 2026-08-21 (largeur
 * d'encre des deux lignes, rapportée à la largeur du cadre) :
 *   référence : "Le Média" 13,77 %, "Automobile" 18,36 %
 *   notre rendu à corps 26 : 9,72 % et 12,50 %
 * soit un facteur 1,42 à 1,47 — le logo était donc ~30 % trop petit.
 * 26 × 1,44 ≈ 37.
 *
 * Interlignage : les deux lignes n'ont ni accent bas ni jambage, leurs bas
 * d'encre sont donc les lignes de base — écart mesuré 30 px sur un cadre de
 * 1280, soit 31,6 px ramené à 1350, pour un corps de 37 : 0,85. Nettement
 * plus serré que le 1,18 qu'on appliquait.
 */
/**
 * Le logo est un **actif graphique**, plus du texte retapé.
 *
 * Il était composé en Roboto, la police du corps de texte : sa graisse et sa
 * chasse ne correspondaient pas à celles de la marque, visible au zoom contre
 * les références. Un logo ne se re-tape pas à chaque post — c'est un fichier
 * fixe. Le traiter ainsi supprime d'un coup trois risques : mauvaise fonte,
 * rendu variable d'une machine à l'autre, et la question de licence qui se
 * posait déjà pour Helvetica Neue.
 *
 * Dimensions **mesurées sur deux références indépendantes** — `inspi/3.png`
 * (post Haaland) et `inspi/5776137084027474227.jpg` (post Mercedes) : largeur
 * 18,36 % du cadre, centré à 50,0-50,3 %, bas à 96,5 % de la hauteur. Soit
 * 198 px de large et un haut à 1244 px sur un canevas de 1080×1350 — ce qui
 * recoupe au pixel près les valeurs relevées dans le fichier Photoshop du
 * directeur (199 px de large, Y = 1243).
 */
export const LOGO_SRC = "/marque/logo-le-media-automobile.png";
// Marge basse du bloc portée de 1,5 % à 3,5 % : à 1,5 %, le bas du logo
// tombait à 98,7 % de la hauteur au lieu des 96,5 % mesurés sur les deux
// références — et des 47 px (3,5 %) relevés dans le fichier Photoshop.
export const LOGO_WIDTH = 199;
/** Ratio du fichier fourni : 835 × 248. */
export const LOGO_HEIGHT = Math.round(199 / (835 / 248));

/**
 * Points de la courbe d'assombrissement, en [hauteur % du canevas, opacité].
 *
 * **Une seule courbe pour toutes les familles** (décision du 2026-08-21) : le
 * directeur demande que la famille 1 soit exactement les autres montages, en
 * retirant simplement les bulles. La photo occupe donc partout la même zone
 * haute (`GABARIT_PHOTO_HEIGHT`) et le bandeau le reste.
 *
 * Une variante « plein cadre » plus douce avait été calée sur la référence
 * Okuda ; elle est abandonnée, et avec elle le défaut qu'elle traînait : en
 * plein cadre, une photo large dont le sujet est en bas voyait **100 % du
 * sujet** tomber dans la zone assombrie (mesuré sur `test33.jpeg`), la voiture
 * ressortait grise. Composer la famille 1 comme les autres supprime le
 * problème à la racine au lieu de l'atténuer.
 *
 * Le noir plein tombe sur `GABARIT_PHOTO_HEIGHT` (74 %) : c'est ce qui masque
 * le bord bas de la photo. Les deux valeurs sont liées.
 */
const COURBE_REFERENCE: Array<[number, number]> = [[57, 0], [64, 0.42], [70, 0.78], [74, 1]];

/**
 * Recale la courbe sur la hauteur réelle de la zone photo : les points
 * conservent leurs proportions, le dernier tombe pile sur le bord bas de la
 * photo. Sans ce recalage, une zone photo raccourcie laisserait voir son bord.
 */
function courbePour(hauteurPhotoPx: number, canvasHeight: number): Array<[number, number]> {
  const cible = (hauteurPhotoPx / canvasHeight) * 100;
  const depart = COURBE_REFERENCE[0][0];
  const fin = COURBE_REFERENCE[COURBE_REFERENCE.length - 1][0];
  const k = (cible - depart) / (fin - depart);
  return COURBE_REFERENCE.map(([h, a]) => [depart + (h - depart) * k, a]);
}
const gradientCss = (hauteurPhotoPx: number) =>
  `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ` +
  courbePour(hauteurPhotoPx, GABARIT_1A_HEIGHT)
    .map(([h, a]) => `rgba(0,0,0,${a}) ${toBlock(h).toFixed(1)}%`)
    .join(", ") +
  `, #000000 100%)`;

/**
 * Bloc bas partagé par tous les gabarits : dégradé de sécurité + titre +
 * logo "Le Média Automobile". Extrait de Gabarit1A (Étape 1, proportions
 * mesurées sur les 5 références de inspi/) pour être réutilisé tel quel par
 * tous les gabarits suivants — une seule source de vérité pour ce bloc,
 * plutôt que de le dupliquer et risquer une dérive entre gabarits.
 *
 * `zIndex: 6` (2026-08-20) : ce bloc doit rester au-dessus de la 3e couche de
 * détourage des gabarits 2A/2B/3A/3B (`sujetUrl`, `zIndex: 5`) et des couches
 * de débordement de bulle (Chantier 3, `zIndex` 2 et 4). Sans ça, un
 * sujet qui descend jusqu'au bas du cadre repasse devant le dégradé ET devant
 * le titre — constaté sur le montage Mercedes dès que le fond est passé au
 * recadrage strict (le fond flou plaçait la voiture trop haut pour que le cas
 * se produise). Le titre est une zone de sécurité, il ne se fait jamais
 * recouvrir (CLAUDE.md §5).
 */
export function TitleFooter({ title, eyebrow, hauteurPhoto }: TitleFooterProps) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-[8.7%] pb-[3.5%]"
      style={{
        top: "54%",
        zIndex: 6,
        // Chantier 4 — courbe recalibrée le 2026-08-20 sur la référence
        // `inspi/5776137084027474227.jpg`, par profil de luminance sur une
        // bande latérale (x 0..90, herbe uniquement : ni voiture, ni bulle,
        // ni texte). Mesuré : luminance stable ~127 jusqu'à 58,6% de la
        // hauteur, puis décroissance régulière (96,9 à 62,5% ; 74,2 à 65,6% ;
        // 54,2 à 68,8%). Le réglage précédent commençait à assombrir dès 54%
        // et n'atteignait le noir qu'à 82,5% : trop tôt en haut, trop tard en
        // bas. Le bloc commence toujours à 54% mais reste transparent jusqu'à
        // 58,5% de la hauteur du canevas, puis atteint le noir plein à 70% —
        // exactement la hauteur de GABARIT_PHOTO_HEIGHT, pour que le bord bas
        // de la photo soit masqué (aucune couture visible).
        // Repères en % de la hauteur DU BLOC (qui va de 54% à 100% du
        // canevas, soit 46 points) : 58,5% du canevas = 9,8% du bloc ;
        // 70% du canevas = 34,8% du bloc.
        background: gradientCss(hauteurPhoto ?? GABARIT_PHOTO_HEIGHT),
      }}
    >
      {eyebrow && (
        <p
          className="mb-[1%] font-medium text-white"
          style={{ fontSize: 22, lineHeight: 1.3 }}
        >
          {eyebrow}
        </p>
      )}
      <p
        className="mb-[2%] font-bold text-white"
        style={{
          fontSize: tailleTitre(title),
          lineHeight: TITLE_LINE_HEIGHT,
          letterSpacing: TITLE_LETTER_SPACING,
          // Coupures équilibrées, pas justification. Mesuré sur `inspi/3.png`
          // (post Haaland) : les trois lignes du titre commencent toutes à
          // x=60 (±1 px) et leur bord droit est naturellement dentelé — 493,
          // 562 et 468 px, soit 13,8 % d'entre la plus longue et la plus
          // courte. Ce n'est donc pas un rectangle justifié : c'est un texte
          // aligné à gauche dont les coupures sont choisies pour que les
          // lignes aient des largeurs voisines.
          //
          // `text-wrap: balance` fait exactement ça, nativement, sans
          // dépendance. `text-align: justify` est à proscrire ici : il
          // étirerait les espaces inter-mots d'un gras condensé, ce qui abîme
          // la lisibilité — et ne correspond pas à la référence.
          textWrap: "balance",
          // Empêcher les coupures de mots avec trait d'union ou virgule en fin de ligne
          // Hyphens contrôlés pour le français : évite les coupures après un "-" ou ","
          hyphens: "auto",
          // Préserver les mots composés (ex: "V-8", "GTR") et les noms propres
          wordBreak: "normal",
          overflowWrap: "break-word",
        }}
      >
        {title}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
      <img
        src={LOGO_SRC}
        alt="Le Média Automobile"
        style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT, margin: "0 auto", display: "block" }}
      />
    </div>
  );
}
