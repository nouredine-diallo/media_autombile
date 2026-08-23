import { titleFont } from "./fonts";
import { TitleFooter } from "./TitleFooter";
import { lireCadre } from "./Bulle";
import { GABARIT_1A_HEIGHT, GABARIT_1A_WIDTH, GABARIT_PHOTO_HEIGHT } from "./Gabarit1A";

/**
 * Gabarit 1B — image + surtitre + titre.
 *
 * Variante de positionnement de la famille 1 (image seule), avec une ligne
 * courte au-dessus du titre — pattern réel observé sur inspi/ (post
 * Mercedes : "Une touche japonaise pour séduire les internautes" au-dessus
 * du titre en gras). Le reste (dégradé, logo, police) est identique à 1A
 * via TitleFooter partagé.
 */

/**
 * Hauteur de la zone photo pour CE montage. Elle varie d'une image à l'autre
 * depuis le 2026-08-22 (voir `hauteurZonePhoto`) : une photo courte au sujet
 * large raccourcit la zone plutôt que de basculer sur le fond flou. La page de
 * rendu la déduit du fichier de fond et la transmet ici.
 */
function lireHauteurPhoto(valeur: string | undefined): number {
  const n = Number.parseInt(valeur ?? "", 10);
  return Number.isFinite(n) && n > 0 && n <= GABARIT_1A_HEIGHT ? n : GABARIT_PHOTO_HEIGHT;
}

export default function Gabarit1B(props: Record<string, string>) {
  const { imageUrl, eyebrow, title , photoHeight, imageCadre } = props;
  const hauteurPhoto = lireHauteurPhoto(photoHeight);
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;
  return (
    <div
      data-gabarit="1b"
      style={{ width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT }}
      className={`${titleFont.className} relative overflow-hidden bg-black`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-x-0 top-0 w-full object-cover"
        style={{ height: hauteurPhoto, transform: transformFond }}
      />
      <TitleFooter title={title} eyebrow={eyebrow} hauteurPhoto={hauteurPhoto} />
    </div>
  );
}
