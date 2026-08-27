import { titleFont } from "./fonts";
import { tailleTitre, TITLE_LETTER_SPACING } from "./fonts";
import { GABARIT_1A_WIDTH, GABARIT_1A_HEIGHT } from "./Gabarit1A";
import { LOGO_SRC, LOGO_WIDTH, LOGO_HEIGHT } from "./TitleFooter";
import { lireCadre } from "./Bulle";

/**
 * Texte standardisé mesuré à l'identique sur les 8 posts réels de
 * `inspi/TEXTPOST.txt` (2026-08-27) — jamais un mot ne change d'un post à
 * l'autre. Reste éditable ici (CLAUDE.md §2 : l'outil prépare, il ne décide
 * jamais) mais préchargé, pas laissé vide.
 */
export const CTA_DEFAUT =
  "Tu veux suivre toute l'actu automobile ? Alors abonne-toi dès maintenant à Le Média Automobile !";

export interface GabaritCTAProps {
  /** URL de la photo d'ambiance (plein cadre, pas de recadrage haut comme 1A/1B). */
  imageUrl: string;
  /** Message d'appel à l'action, éditable — voir `CTA_DEFAUT`. */
  message?: string;
  /** Cadrage de la photo : `"zoom,dx,dy"`. */
  imageCadre?: string;
}

/**
 * Gabarit CTA — toujours la dernière slide d'un carrousel (Outro).
 *
 * Structurellement différent de 1A/1B/1C : pas de bandeau noir, pas de
 * dégradé — la photo occupe 100% du cadre et le texte flotte dessus. Mesuré
 * sur `inspi/Capture d'écran 2026-08-27 010759.png` (bande blanche détectée
 * par seuillage de luminance, pas à l'œil) :
 * - 3 lignes de texte centrées entre 11,6% et 22,9% de la hauteur.
 * - Logo entre 92,3% et 96,1% — **identique** à la position du logo dans
 *   `TitleFooter` (92% à 96,5%) : mêmes constantes réutilisées telles
 *   quelles, aucune retouche nécessaire.
 * - Alignement : centré (le centre des 3 lignes tombe à 49,3-49,4% de la
 *   largeur sur les trois lignes, jamais aligné à gauche comme 1B).
 * - Pas de motif de renforcement de contraste détecté (pas de liseré sombre
 *   dur autour des lettres) — l'ombre portée ci-dessous est une marge de
 *   sécurité ajoutée pour les fonds plus clairs que la référence mesurée,
 *   pas une valeur mesurée elle-même : à revoir si un post réel montre le
 *   contraire.
 */
export default function GabaritCTA({ imageUrl, message, imageCadre }: GabaritCTAProps) {
  const texte = message?.trim() || CTA_DEFAUT;
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;
  const corps = tailleTitre(texte);

  return (
    <div
      data-gabarit="cta"
      style={{ width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT }}
      className={`${titleFont.className} relative overflow-hidden bg-black`}
    >
      {/* Photo plein cadre — pas de zone photo réduite, pas de dégradé de sécurité */}
      {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: transformFond }}
      />

      {/* Message : centré, ancré en haut (11,6% mesuré) */}
      <p
        className="absolute inset-x-[8.7%] text-center font-bold text-white"
        style={{
          top: "11.5%",
          fontSize: corps,
          lineHeight: 1.25,
          letterSpacing: TITLE_LETTER_SPACING,
          textShadow: "0 2px 10px rgba(0,0,0,0.55)",
          textWrap: "balance",
        }}
      >
        {texte}
      </p>

      {/* Logo — mêmes constantes que TitleFooter, même position mesurée (92-96%) */}
      {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
      <img
        src={LOGO_SRC}
        alt="Le Média Automobile"
        style={{
          position: "absolute",
          bottom: "3.9%",
          left: "50%",
          transform: "translateX(-50%)",
          width: LOGO_WIDTH,
          height: LOGO_HEIGHT,
        }}
      />
    </div>
  );
}
