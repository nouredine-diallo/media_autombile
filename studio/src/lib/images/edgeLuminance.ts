import "server-only";
import sharp from "sharp";
import type { BulleGeometry } from "@/components/gabarits/Bulle";

interface DecodedImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

/**
 * Décode et redimensionne le fond une seule fois (même transformation
 * `object-cover` que le rendu réel), à réutiliser pour échantillonner
 * plusieurs bulles sans redécoder l'image à chaque fois — un gabarit à 2
 * bulles (3A/3B) ne fait ainsi qu'un seul décodage `sharp`, pas deux.
 */
export async function decodeForSampling(
  imageBuffer: Buffer,
  canvasWidth: number,
  canvasHeight: number,
): Promise<DecodedImage> {
  const { data, info } = await sharp(imageBuffer)
    .resize(canvasWidth, canvasHeight, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * Échantillonne la luminance moyenne du fond juste à l'extérieur de
 * l'emplacement d'une bulle (l'anneau où l'ombre doit se lire), pour
 * adapter l'ombre au contraste réel de l'image plutôt qu'à un réglage
 * fixe — correctif directeur du 2026-08-19 ("rendre l'ombre adaptative au
 * contraste du fond plutôt qu'à réglage fixe", confirmé sur les tests
 * `test/test2-wec-hypercars*.png` : un halo sombre fixe devient invisible
 * quand le fond est déjà sombre à cet endroit précis).
 *
 * Opère sur une image déjà décodée par `decodeForSampling` — synchrone et
 * pure, sur un anneau fin juste avant le bord du cercle, pas le centre de
 * la bulle elle-même.
 */
export function sampleEdgeLuminance(
  image: DecodedImage,
  bulle: BulleGeometry,
  /**
   * Hauteur du CANEVAS du gabarit, qui n'est plus celle de l'image décodée
   * depuis le 2026-08-20 : la photo de fond ne remplit que la zone haute du
   * montage (`GABARIT_PHOTO_HEIGHT`). `topPercent` d'une bulle se lit sur le
   * canevas, pas sur la photo — sans ce paramètre l'échantillonnage viserait
   * trop haut dans l'image et l'ombre serait calculée au mauvais endroit.
   * Par défaut : la hauteur de l'image, comportement d'avant.
   */
  canvasHeight: number = image.height,
): number {
  const { data, width, height, channels } = image;
  const cx = (bulle.leftPercent / 100) * width;
  const cy = (bulle.topPercent / 100) * canvasHeight;
  const r = ((bulle.sizePercent / 100) * width) / 2;
  const rInner = r * 1.02;
  const rOuter = r * 1.18;

  let sum = 0;
  let count = 0;
  const step = 2;
  const yStart = Math.max(0, Math.floor(cy - rOuter));
  const yEnd = Math.min(height, Math.ceil(cy + rOuter));
  const xStart = Math.max(0, Math.floor(cx - rOuter));
  const xEnd = Math.min(width, Math.ceil(cx + rOuter));

  for (let y = yStart; y < yEnd; y += step) {
    for (let x = xStart; x < xEnd; x += step) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < rInner || d > rOuter) continue;
      const idx = (y * width + x) * channels;
      const rC = data[idx];
      const gC = data[idx + 1];
      const bC = data[idx + 2];
      sum += 0.2126 * rC + 0.7152 * gC + 0.0722 * bC;
      count++;
    }
  }

  return count > 0 ? sum / count : 200;
}

/**
 * Mappe une luminance de fond (0-255) vers une valeur `box-shadow`.
 *
 * Logique : le blanc de l'anneau contraste déjà fortement contre un fond
 * sombre (pas besoin d'ombre marquée) ; c'est contre un fond clair que la
 * séparation est faible sans aide (cas mesuré contre la référence Porsche
 * le 2026-08-19, fond herbe/mur clair — halo à 0.45 validé visuellement
 * contre cette référence, donc plafond de cette échelle, pas une valeur
 * moyenne arbitraire).
 */
export function shadowForLuminance(luminance: number): string {
  const t = Math.max(0, Math.min(1, luminance / 255));
  const darkOpacity = 0.1 + 0.35 * t; // 0.10 (fond sombre) -> 0.45 (fond clair, validé Porsche)
  const depthOpacity = 0.15 + 0.15 * t;
  return `0 0 10px 3px rgba(0,0,0,${darkOpacity.toFixed(2)}),0 6px 18px rgba(0,0,0,${depthOpacity.toFixed(2)})`;
}
