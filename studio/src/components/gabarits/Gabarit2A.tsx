import { titleFont } from "./fonts";
import { TitleFooter } from "./TitleFooter";
import { lireCadre, Bulle, lireGeometrie, type BulleGeometry } from "./Bulle";
import { GABARIT_1A_HEIGHT, GABARIT_1A_WIDTH, GABARIT_PHOTO_HEIGHT } from "./Gabarit1A";

/**
 * Gabarit 2A — image de fond + 1 bulle, haut-droite.
 *
 * Position corrigée le 2026-08-18 après lecture de specStudio.md (le
 * "document précédent §4" manquant, fourni par l'utilisateur) : §4.2 y
 * définit explicitement 2A = "Haut-droite, chevauchement léger du bord".
 * La version précédente de ce fichier plaçait la bulle à gauche (mesure
 * faite sur la seule référence visuelle disponible à l'époque, Disney+,
 * sans connaître le nom officiel de la variante) — inversé avec 2B.
 * Taille : ≈47% de la largeur (mesure inchangée, cohérente avec le
 * "chevauchement léger" décrit).
 *
 * `sujetUrl` (optionnel, 2026-08-19) : découpe alpha du sujet du fond
 * (voir `src/lib/images/segment.ts`), rendue par-dessus la bulle pour que
 * le sujet la recouvre là où il déborde dans sa zone — comportement mesuré
 * sur les références du directeur (correctif point 4). Absent (chaîne
 * vide) sur les images qui n'ont pas encore de détourage calculé : la
 * bulle reste alors entièrement visible, comportement précédent inchangé.
 *
 * `bulleShadow` (optionnel, 2026-08-19) : ombre adaptative précalculée
 * côté serveur (voir `src/lib/images/edgeLuminance.ts`) — repli sur
 * l'ombre fixe de `Bulle.tsx` si absent.
 */
/**
 * **Miroir horizontal de 2B**, faute de référence publiée montrant une bulle
 * unique en haut à droite : `inspi/` n'en contient pas (Disney+ est la seule
 * famille 2 disponible et sa bulle est à gauche). `leftPercent` = 100 − 30,6.
 * Hauteur et diamètre repris de la mesure réelle de 2B.
 *
 * Marqué explicitement comme dérivé, pas mesuré (CLAUDE.md §4.3) — à recaler
 * si un post à bulle unique à droite est fourni.
 */
export const GABARIT_2A_BULLE: BulleGeometry = { leftPercent: 69.4, topPercent: 26.2, sizePercent: 45.9 };


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

export default function Gabarit2A(props: Record<string, string>) {
  const { imageUrl, bulleUrl, sujetUrl, bulleSujetUrl, bulleShadow, bulleGeom, bulleCadre, title, photoHeight, imageCadre } = props;
  const g = lireGeometrie(bulleGeom, GABARIT_2A_BULLE);
  const hauteurPhoto = lireHauteurPhoto(photoHeight);
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;
  return (
    <div
      data-gabarit="2a"
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
