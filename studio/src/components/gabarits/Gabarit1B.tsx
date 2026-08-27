import { titleFont } from "./fonts";
import { GABARIT_1A_WIDTH, GABARIT_1A_HEIGHT, GABARIT_PHOTO_HEIGHT } from "./Gabarit1A";
import {
  tailleParagraphe,
  PARAGRAPH_LINE_HEIGHT,
  PARAGRAPH_LETTER_SPACING,
  PARAGRAPH_ALIGN_THRESHOLD,
} from "./fonts";
import { parseInlineBold } from "./parseInline";
import { lireCadre } from "./Bulle";

const LOGO_SRC = "/marque/logo-le-media-automobile.png";
const LOGO_WIDTH = 199;
const LOGO_HEIGHT = Math.round(199 / (835 / 248));

/**
 * Gabarit 1B — image + paragraphe.
 *
 * Template autonome pour les slides 2+ du carrousel. Conçu pour la
 * lisibilité de textes longs (25-60 mots, 150-360 caractères).
 *
 * Différences structurelles avec 1A :
 * - Zone noire remontée (min-height 40%) au lieu d'un dégradé bas
 * - Police plus petite (48→38 px) et moins grasse (medium au lieu de bold)
 * - Alignement conditionnel : centré si court, gauche si long (>80 car.)
 * - Gras intraparagraphe : **texte** → <strong>texte</strong>
 * - Photo avec object-position: center 20% pour ne pas couper le sujet
 *
 * Le bloc texte est un Flexbox qui s'étire naturellement (height: fit-content)
 * avec un min-height de 40% du canevas. Pas de hauteur fixe imposée.
 */
export interface Gabarit1BProps {
  imageUrl: string;
  paragraph: string;
  photoHeight?: string;
  imageCadre?: string;
}

function lireHauteurPhoto(valeur: string | undefined): number {
  const n = Number.parseInt(valeur ?? "", 10);
  return Number.isFinite(n) && n > 0 && n <= GABARIT_1A_HEIGHT ? n : GABARIT_PHOTO_HEIGHT;
}

export default function Gabarit1B({ imageUrl, paragraph, photoHeight, imageCadre }: Gabarit1BProps) {
  const hauteurPhoto = lireHauteurPhoto(photoHeight);
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;

  const corps = tailleParagraphe(paragraph);
  const isLong = paragraph.trim().length >= PARAGRAPH_ALIGN_THRESHOLD;

  return (
    <div
      data-gabarit="1b"
      style={{ width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT }}
      className={`${titleFont.className} relative overflow-hidden bg-black`}
    >
      {/* Photo : object-cover avec positionnement center top pour ne pas couper le sujet */}
      {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-x-0 top-0 w-full object-cover"
        style={{
          height: hauteurPhoto,
          transform: transformFond,
          objectPosition: "center 20%",
        }}
      />

      {/* Zone texte : flex container, min-height 40%, s'étire avec le contenu */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-[8.7%] pb-[3.5%]"
        style={{
          minHeight: "40%",
          zIndex: 6,
          background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 25%, #000000 100%)",
        }}
      >
        <p
          className="mb-[2%] text-white"
          style={{
            fontSize: corps,
            fontWeight: 500,
            lineHeight: PARAGRAPH_LINE_HEIGHT,
            letterSpacing: PARAGRAPH_LETTER_SPACING,
            textAlign: isLong ? "left" : "center",
            textWrap: "balance",
            hyphens: "auto",
            wordBreak: "normal",
            overflowWrap: "break-word",
          }}
        >
          {parseInlineBold(paragraph)}
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
        <img
          src={LOGO_SRC}
          alt="Le Média Automobile"
          style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT, margin: "0 auto", display: "block" }}
        />
      </div>
    </div>
  );
}
