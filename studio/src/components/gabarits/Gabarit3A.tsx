import { titleFont } from "./fonts";
import { TitleFooter } from "./TitleFooter";
import { lireCadre, Bulle, lireGeometrie, type BulleGeometry } from "./Bulle";
import { GABARIT_1A_HEIGHT, GABARIT_1A_WIDTH, GABARIT_PHOTO_HEIGHT } from "./Gabarit1A";

/**
 * Gabarit 3A — image de fond + 2 bulles, variante symétrique.
 *
 * Position/taille mesurées par détection de contour sur inspi/ (posts
 * Mercedes/Ferrari) : bulle gauche centrée (31%, 30%) diamètre ≈47%, bulle
 * droite centrée (71%, 21%) diamètre ≈44%, la gauche par-dessus la droite
 * (recouvrement partiel, comme sur la référence). Mesure bruitée par endroits
 * (ciel très clair confondu avec l'anneau blanc sur la version Ferrari) —
 * valeurs arrondies, à confirmer sur fichier source si besoin de précision
 * pixel-parfaite (CLAUDE.md §4.3).
 *
 * `sujetUrl`, `bulle1Shadow`/`bulle2Shadow` : voir le commentaire de
 * Gabarit2A.tsx (même mécanisme, ajouté le 2026-08-19).
 */
/**
 * Re-mesuré au pixel le 2026-08-20 sur `inspi/5776137084027474227.jpg` par
 * ajustement de cercle (RANSAC + moindres carrés de Kåsa) sur les pixels de
 * l'anneau blanc — `scripts/dev-fit-bulles.cjs`, 1201 et 1018 points
 * d'appui. Remplace la première mesure par détection de contour, que
 * CLAUDE.md signalait déjà comme "bruitée, à confirmer sur fichier source" :
 * elle plaçait la bulle droite 9,8 points trop haut (21% au lieu de 30,8%),
 * ce qui l'éloignait de la voiture et empêchait tout recouvrement.
 *
 *   bulle gauche : centre (320,9 ; 416,6) rayon 235,9 sur 1024×1280
 *   bulle droite : centre (696,0 ; 394,2) rayon 243,9 sur 1024×1280
 */
export const GABARIT_3A_BULLE1: BulleGeometry = { leftPercent: 31.3, topPercent: 32.5, sizePercent: 46.1 };
export const GABARIT_3A_BULLE2: BulleGeometry = { leftPercent: 68.0, topPercent: 30.8, sizePercent: 47.6 };


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

export default function Gabarit3A(props: Record<string, string>) {
  const { imageUrl, bulle1Url, bulle2Url, sujetUrl, bulle1SujetUrl, bulle2SujetUrl, bulle1Shadow, bulle2Shadow, bulle1Geom, bulle2Geom, bulle1Cadre, bulle2Cadre, title, photoHeight, imageCadre } = props;
  // Géométrie mesurée sur la référence, surchargeable par la manipulation
  // directe sur l'aperçu — mêmes props côté rendu, donc export identique.
  const g1 = lireGeometrie(bulle1Geom, GABARIT_3A_BULLE1);
  const g2 = lireGeometrie(bulle2Geom, GABARIT_3A_BULLE2);
  const hauteurPhoto = lireHauteurPhoto(photoHeight);
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;
  return (
    <div
      data-gabarit="3a"
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
