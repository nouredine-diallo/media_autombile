import { titleFont } from "./fonts";
import { TitleFooter } from "./TitleFooter";
import { lireCadre, Bulle, lireGeometrie, type BulleGeometry } from "./Bulle";
import { GABARIT_1A_HEIGHT, GABARIT_1A_WIDTH, GABARIT_PHOTO_HEIGHT } from "./Gabarit1A";

/**
 * Gabarit 2B — image de fond + 1 bulle, haut-gauche.
 *
 * specStudio.md §4.2 définit 2B = "Haut-gauche" ("alternance pour éviter la
 * monotonie" — c'est le miroir de 2A). Position corrigée le 2026-08-18 en
 * lisant ce document (voir Gabarit2A.tsx pour le détail de l'erreur
 * précédente : les deux étaient inversés).
 *
 * `sujetUrl`, `bulleShadow` : voir le commentaire de Gabarit2A.tsx (même
 * mécanisme, ajouté le 2026-08-19).
 */
/**
 * Re-mesuré au pixel le 2026-08-21 par ajustement de cercle (RANSAC +
 * moindres carrés de Kåsa) sur les pixels de l'anneau blanc de SA propre
 * référence — `scripts/dev-fit-bulles.mjs <fichier> 0.60`. La borne à 60 %
 * de hauteur exclut le bandeau de titre, dont les arêtes de texte faisaient
 * sortir des cercles fantômes.
 *
 * Référence : `inspi/Capture d'écran 2026-08-18 151315.png` (post Disney+ /
 * Formula E, famille 2, bulle en haut à gauche) — centre (205,7 ; 222,5)
 * rayon 154,5 sur 677×846, **895 points d'appui**. L'ancienne valeur
 * (31 / 26 / 47) venait de la détection de contour signalée comme bruitée.
 */
export const GABARIT_2B_BULLE: BulleGeometry = { leftPercent: 30.6, topPercent: 26.2, sizePercent: 45.9 };


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

export default function Gabarit2B(props: Record<string, string>) {
  const { imageUrl, bulleUrl, sujetUrl, bulleSujetUrl, bulleShadow, bulleGeom, bulleCadre, title, photoHeight, imageCadre } = props;
  const g = lireGeometrie(bulleGeom, GABARIT_2B_BULLE);
  const hauteurPhoto = lireHauteurPhoto(photoHeight);
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;
  return (
    <div
      data-gabarit="2b"
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
      <Bulle
        imageUrl={bulleUrl}
        sizePercent={g.sizePercent}
        leftPercent={g.leftPercent}
        topPercent={g.topPercent}
        zIndex={1}
        overflowZIndex={3}
        shadow={bulleShadow || undefined}
        sujetUrl={bulleSujetUrl || undefined}
        cadre={bulleCadre}
      />
      {sujetUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte
        <img
          src={sujetUrl}
          alt=""
          className="absolute inset-x-0 top-0 w-full object-cover"
          style={{ height: hauteurPhoto, zIndex: 5, transform: transformFond }}
        />
      )}
      <TitleFooter title={title} hauteurPhoto={hauteurPhoto} />
    </div>
  );
}
