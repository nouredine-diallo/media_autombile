import { titleFont } from "./fonts";
import { TitleFooter } from "./TitleFooter";
import { lireCadre, Bulle, lireGeometrie, type BulleGeometry } from "./Bulle";
import { GABARIT_1A_HEIGHT, GABARIT_1A_WIDTH, GABARIT_PHOTO_HEIGHT } from "./Gabarit1A";

/**
 * Gabarit 3B — image de fond + 2 bulles, variante asymétrique.
 *
 * Position/taille mesurées par détection de contour sur inspi/ (post
 * Spider-Man) : grande bulle gauche centrée (30%, 27%) diamètre ≈50%,
 * petite bulle droite centrée (73%, 27%) diamètre ≈39%, la droite (petite)
 * par-dessus la gauche — comme sur la référence. Deuxième variante de la
 * famille 3, distincte de 3A (symétrique) par la taille et la disposition.
 *
 * `sujetUrl`, `bulle1Shadow`/`bulle2Shadow` : voir le commentaire de
 * Gabarit2A.tsx (même mécanisme, ajouté le 2026-08-19).
 */
/**
 * Re-mesuré au pixel le 2026-08-21 par ajustement de cercle (RANSAC +
 * moindres carrés de Kåsa) sur les pixels de l'anneau blanc de SA propre
 * référence — `scripts/dev-fit-bulles.mjs <fichier> 0.60`. La borne à 60 %
 * de hauteur exclut le bandeau de titre, dont les arêtes de texte faisaient
 * sortir des cercles fantômes.
 *
 * Référence : `inspi/Capture d'écran 2026-08-18 151259.png` (post Spider-Man,
 * famille 3 asymétrique) — bulle gauche centre (236,2 ; 265,2) rayon 176,8,
 * 662 points ; bulle droite centre (500,0 ; 242,9) rayon 129,9, 210 points.
 * L'asymétrie mesurée est nette : la droite fait 38,0 % contre 51,8 % à
 * gauche, et elle est 2,6 points plus haute.
 */
export const GABARIT_3B_BULLE1: BulleGeometry = { leftPercent: 34.6, topPercent: 31.3, sizePercent: 51.8 };
export const GABARIT_3B_BULLE2: BulleGeometry = { leftPercent: 73.2, topPercent: 28.7, sizePercent: 38.0 };


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

export default function Gabarit3B(props: Record<string, string>) {
  const { imageUrl, bulle1Url, bulle2Url, sujetUrl, bulle1SujetUrl, bulle2SujetUrl, bulle1Shadow, bulle2Shadow, bulle1Geom, bulle2Geom, bulle1Cadre, bulle2Cadre, title, photoHeight, imageCadre } = props;
  // Géométrie mesurée sur la référence, surchargeable par la manipulation
  // directe sur l'aperçu — mêmes props côté rendu, donc export identique.
  const g1 = lireGeometrie(bulle1Geom, GABARIT_3B_BULLE1);
  const g2 = lireGeometrie(bulle2Geom, GABARIT_3B_BULLE2);
  const hauteurPhoto = lireHauteurPhoto(photoHeight);
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;
  return (
    <div
      data-gabarit="3b"
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
        imageUrl={bulle1Url}
        sizePercent={g1.sizePercent}
        leftPercent={g1.leftPercent}
        topPercent={g1.topPercent}
        zIndex={1}
        overflowZIndex={3}
        shadow={bulle1Shadow || undefined}
        sujetUrl={bulle1SujetUrl || undefined}
        cadre={bulle1Cadre}
      />
      <Bulle
        imageUrl={bulle2Url}
        sizePercent={g2.sizePercent}
        leftPercent={g2.leftPercent}
        topPercent={g2.topPercent}
        zIndex={2}
        overflowZIndex={4}
        shadow={bulle2Shadow || undefined}
        sujetUrl={bulle2SujetUrl || undefined}
        cadre={bulle2Cadre}
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
