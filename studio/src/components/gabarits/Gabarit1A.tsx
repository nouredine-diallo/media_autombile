import { titleFont } from "./fonts";
import { TitleFooter } from "./TitleFooter";
import { lireCadre } from "./Bulle";

export const GABARIT_1A_WIDTH = 1080;
export const GABARIT_1A_HEIGHT = 1350;

/**
 * Hauteur de la **zone photo** des gabarits à fond + bulles (2A/2B/3A/3B),
 * en pixels du canevas — 70% de la hauteur totale.
 *
 * Pourquoi la photo ne remplit pas tout le canevas (mesuré le 2026-08-20 sur
 * `inspi/5776137084027474227.jpg`) : sur la référence, la voiture commence à
 * ~37-40% de la hauteur du montage. Avec une photo en plein cadre 4:5, c'est
 * **géométriquement impossible** dès que le sujet touche le bas de sa source —
 * le haut du sujet ne peut alors pas remonter au-dessus de ~64% du cadre (cas
 * de `test33.jpeg`, vérifié par le calcul). En composant la photo pour cette
 * zone plus large (1080×945, ratio ~1.14) au lieu du 4:5 plein, le sujet
 * retrouve exactement l'occupation (76,7%) et la hauteur (~42%) de la
 * référence, et il recouvre à nouveau le bas des bulles.
 *
 * Le bord bas de la photo est masqué par le dégradé de `TitleFooter`, calé
 * pour être **totalement opaque à partir de cette hauteur** — aucune couture
 * visible. Les deux valeurs sont liées : changer l'une oblige à recaler
 * l'autre.
 */
export const GABARIT_PHOTO_HEIGHT = Math.round(GABARIT_1A_HEIGHT * 0.74);

/**
 * Recadrage dédié aux **images de bulle** — volontairement en paysage (5:4),
 * alors que le fond et la famille 1 sont en 4:5.
 *
 * Raison, mécanique et non esthétique (2026-08-21) : une bulle affiche son
 * image en `object-cover` dans un carré, et le cercle est inscrit dans ce
 * carré. Avec une image **portrait**, `object-cover` cale sur la largeur :
 * l'image finit donc exactement sur le bord du cercle et **il n'existe aucun
 * pixel au-delà** latéralement. L'effet de débordement (Chantier 3) était de
 * ce fait tranché net par un bord vertical, au lieu de continuer sur le fond
 * comme sur la référence.
 *
 * Avec une image **paysage**, `object-cover` cale sur la hauteur : l'image
 * rendue est plus large que le cercle et laisse une marge de (a−1)/2 fois le
 * diamètre de chaque côté. En 5:4 cela fait 12,5 % du diamètre, soit 25 % du
 * rayon — largement au-dessus des ~11 % de rayon de débordement mesurés sur
 * `inspi/5776137084027474227.jpg`.
 */
export const GABARIT_BULLE_WIDTH = 1350;
export const GABARIT_BULLE_HEIGHT = 1080;

/**
 * Occupation visée du sujet dans le recadrage de bulle. Réglée pour que le
 * sujet fasse exactement le diamètre du cercle : sa largeur rendue vaut
 * `occupation × (largeur/hauteur) × diamètre`, soit `occ × 1,25 × D` ; on veut
 * `D`, donc `occ = 0,80`. Le sujet remplit ainsi la bulle comme sur la
 * référence, et ce qui dépasse aux autres angles tombe dans la marge
 * disponible au lieu d'être tranché.
 */
export const GABARIT_BULLE_OCCUPANCY = 0.80;

export interface Gabarit1AProps {
  /** URL (relative ou absolue) de l'image de fond. */
  imageUrl: string;
  /** Titre affiché en gras, 1 à 3 lignes selon la longueur. */
  title: string;
  /** Hauteur de la zone photo, variable d'une image à l'autre (voir `hauteurZonePhoto`). */
  photoHeight?: string;
  /** Cadrage de la photo de fond : `"zoom,dx,dy"`. */
  imageCadre?: string;
}

/**
 * Gabarit 1A — image seule + titre.
 *
 * Ce composant est l'unique source de vérité visuelle : il est utilisé tel quel
 * dans l'aperçu navigateur (src/app/gabarits/1a) et dans la page de capture
 * Playwright (src/app/render/1a) — voir CLAUDE.md §1, contrainte "zéro écart
 * entre aperçu et rendu final".
 *
 * Police et proportions déduites par analyse des captures de référence
 * (inspi/, posts réels) plutôt qu'estimées à l'œil (CLAUDE.md §6.2) :
 * - Police : Roboto (voir fonts.ts pour l'historique de ré-identification
 *   du 2026-08-19, qui remplace le premier choix Poppins).
 * - Bloc titre/logo : voir TitleFooter.tsx (partagé par tous les gabarits
 *   depuis l'Étape 4, extrait tel quel de ce composant — vérifié
 *   pixel-identique après extraction, voir scripts/verify-gabarit-1a.mjs).
 */
function lireHauteurPhoto(valeur: string | undefined): number {
  const n = Number.parseInt(valeur ?? "", 10);
  return Number.isFinite(n) && n > 0 && n <= GABARIT_1A_HEIGHT ? n : GABARIT_PHOTO_HEIGHT;
}

export default function Gabarit1A({ imageUrl, title, photoHeight, imageCadre }: Gabarit1AProps) {
  const hauteurPhoto = lireHauteurPhoto(photoHeight);
  const cf = lireCadre(imageCadre);
  const transformFond = `translate(${cf.dx}%, ${cf.dy}%) scale(${cf.zoom})`;
  return (
    <div
      data-gabarit="1a"
      style={{ width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT }}
      className={`${titleFont.className} relative overflow-hidden bg-black`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- capture Playwright pixel-exacte, pas d'optimisation next/image ici */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-x-0 top-0 w-full object-cover"
        style={{ height: hauteurPhoto, transform: transformFond }}
      />
      <TitleFooter title={title} hauteurPhoto={hauteurPhoto} />
    </div>
  );
}
