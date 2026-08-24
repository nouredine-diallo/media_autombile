import { getDb } from "./db";
import sharp from "sharp";

/**
 * Qualité minimale d'image à accepter automatiquement.
 * En dessous de ce seuil, l'image est flaggée pour revue humaine.
 */
const MIN_IMAGE_WIDTH = 800;
const MIN_IMAGE_HEIGHT = 1000;
const MIN_RESOLUTION_SCORE = 0.6;

/**
 * Score de qualité composite (0-1) basé sur :
 * - Résolution (poids 0.4)
 * - Contraste (poids 0.3)
 * - Netteté (poids 0.3)
 */
interface QualityMetrics {
  resolution: number;
  contrast: number;
  sharpness: number;
  composite: number;
  width: number;
  height: number;
  format: string;
}

/**
 * Analyse la qualité d'une image et retourne un score composite.
 */
export async function analyzeImageQuality(imagePath: string): Promise<QualityMetrics> {
  try {
    const metadata = await sharp(imagePath).metadata();
    const { width = 0, height = 0, format = "unknown" } = metadata;

    // Score de résolution (0-1)
    const resolution = Math.min(1, (width * height) / (1920 * 1080));

    // Analyse du contraste via histogramme
    const { data } = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let min = 255, max = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const contrast = (max - min) / 255;

    // Score de netteté (approximation via Laplacien)
    const laplacian = await sharp(imagePath)
      .greyscale()
      .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
      .raw()
      .toBuffer();

    let variance = 0;
    for (let i = 0; i < laplacian.length; i++) {
      variance += laplacian[i] * laplacian[i];
    }
    variance /= laplacian.length;
    const sharpness = Math.min(1, variance / 1000);

    // Score composite pondéré
    const composite = resolution * 0.4 + contrast * 0.3 + sharpness * 0.3;

    return {
      resolution,
      contrast,
      sharpness,
      composite,
      width,
      height,
      format,
    };
  } catch (error) {
    console.error("[autoFlag] Erreur analyse qualité:", error);
    return { resolution: 0, contrast: 0, sharpness: 0, composite: 0, width: 0, height: 0, format: "error" };
  }
}

/**
 * Détermine le verdict d'une image basé sur les métriques.
 * - "ok" : qualité suffisante, pas de flag
 * - "marginal" : qualité acceptable mais à surveiller
 * - "bad" : qualité insuffisante, flag pour revue
 */
export type ImageFlag = "ok" | "marginal" | "bad";

export interface FlagResult {
  flag: ImageFlag;
  metrics: QualityMetrics;
  reasons: string[];
}

/**
 * Applique les règles d'auto-flag sur une image.
 */
export function evaluateImageFlag(metrics: QualityMetrics): FlagResult {
  const reasons: string[] = [];
  let flag: ImageFlag = "ok";

  // Résolution trop basse
  if (metrics.width < MIN_IMAGE_WIDTH || metrics.height < MIN_IMAGE_HEIGHT) {
    reasons.push(`Résolution trop basse: ${metrics.width}x${metrics.height} (min ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT})`);
    flag = "bad";
  }

  // Score composite trop bas
  if (metrics.composite < MIN_RESOLUTION_SCORE) {
    reasons.push(`Score qualité composite: ${(metrics.composite * 100).toFixed(0)}% (min ${(MIN_RESOLUTION_SCORE * 100).toFixed(0)}%)`);
    flag = "bad";
  }

  // Contraste faible
  if (metrics.contrast < 0.3) {
    reasons.push(`Contraste faible: ${(metrics.contrast * 100).toFixed(0)}%`);
    if (flag === "ok") flag = "marginal";
  }

  // Netteté faible
  if (metrics.sharpness < 0.2) {
    reasons.push(`Netteté faible: ${(metrics.sharpness * 100).toFixed(0)}%`);
    if (flag === "ok") flag = "marginal";
  }

  // Format non standard
  if (metrics.format === "error" || metrics.format === "unknown") {
    reasons.push("Format d'image non reconnu ou illisible");
    flag = "bad";
  }

  return { flag, metrics, reasons };
}

/**
 * Applique l'auto-flag à un item et met à jour la base de données.
 * Retourne le verdict pour affichage dans le dashboard.
 */
export async function autoFlagItem(itemId: number, imagePath: string): Promise<FlagResult> {
  const db = getDb();
  const metrics = await analyzeImageQuality(imagePath);
  const result = evaluateImageFlag(metrics);

  // Stocke le verdict dans image_preflight (champ existant réutilisé)
  const preflightData = {
    verdict: result.flag,
    metrics: result.metrics,
    reasons: result.reasons,
    flaggedAt: new Date().toISOString(),
  };

  db.prepare("UPDATE items SET image_preflight = ? WHERE id = ?")
    .run(JSON.stringify(preflightData), itemId);

  return result;
}

/**
 * Batch auto-flag : traite tous les items sans verdict de preflight.
 * Retourne les statistiques.
 */
export async function batchAutoFlag(): Promise<{ total: number; flagged: number; ok: number; marginal: number; bad: number }> {
  const db = getDb();
  const items = db.prepare(`
    SELECT id, image_url 
    FROM items 
    WHERE image_url IS NOT NULL 
    AND image_preflight IS NULL
    AND image_rejected = 0
    ORDER BY fetched_at DESC
    LIMIT 50
  `).all() as { id: number; image_url: string }[];

  let flagged = 0, ok = 0, marginal = 0, bad = 0;

  for (const item of items) {
    try {
      // Télécharge l'image temporairement
      const response = await fetch(item.image_url);
      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      const tempPath = `/tmp/auto-flag-${item.id}.jpg`;
      await sharp(buffer).toFile(tempPath);

      const result = await autoFlagItem(item.id, tempPath);

      if (result.flag === "ok") ok++;
      else if (result.flag === "marginal") marginal++;
      else if (result.flag === "bad") bad++;

      flagged++;
    } catch (error) {
      console.error(`[autoFlag] Erreur item ${item.id}:`, error);
    }
  }

  return { total: items.length, flagged, ok, marginal, bad };
}
