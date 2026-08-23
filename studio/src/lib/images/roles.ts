import "server-only";
import sharp from "sharp";

export type ImageRole = "fond" | "bulle1" | "bulle2";

export interface RoleSuggestion {
  role: ImageRole;
  /** Explication courte affichée à l'utilisateur — jamais une décision opaque (CLAUDE.md §5). */
  reason: string;
}

interface ImageMetrics {
  index: number;
  aspectRatio: number; // largeur / hauteur
  resolution: number; // largeur * hauteur
  entropy: number; // sharp stats().entropy — proxy de complexité visuelle
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * Attribution automatique du rôle (fond / bulle 1 / bulle 2) de 1 à 3 images,
 * "selon son format et son contenu" (cahier des charges §3, écran 2).
 *
 * Heuristique volontairement simple et explicable (CLAUDE.md §6 : pas de
 * complexité non nécessaire — pas de détection de sujet/visage, qui
 * nécessiterait une dépendance ML supplémentaire non validée) :
 * - format : ratio largeur/hauteur (une image large est un meilleur fond
 *   pour un cadre portrait 4:5 qu'une image carrée/portrait) et résolution
 *   (le fond remplit tout le cadre, il a besoin de plus de pixels utiles) ;
 * - contenu : entropie de l'image (sharp `stats().entropy`), une image
 *   photographique détaillée a une entropie plus haute qu'un logo/graphique
 *   plat, qui se prête mieux à une bulle secondaire.
 *
 * Le score le plus haut devient le fond ; les images restantes gardent
 * l'ordre de dépôt pour bulle1/bulle2 — décision déterministe et
 * immédiatement corrigible en un clic dans l'UI (cahier §3, écran 2 :
 * "jamais un obstacle").
 */
export async function suggestRoles(
  imagePaths: string[],
): Promise<RoleSuggestion[]> {
  if (imagePaths.length === 0) return [];
  if (imagePaths.length === 1) {
    return [{ role: "fond", reason: "Seule image du post" }];
  }

  const metrics: ImageMetrics[] = await Promise.all(
    imagePaths.map(async (p, index) => {
      const img = sharp(p);
      const [meta, stats] = await Promise.all([img.metadata(), img.stats()]);
      const width = meta.width ?? 1;
      const height = meta.height ?? 1;
      return {
        index,
        aspectRatio: width / height,
        resolution: width * height,
        entropy: stats.entropy,
      };
    }),
  );

  const aspectScores = normalize(metrics.map((m) => m.aspectRatio));
  const resolutionScores = normalize(metrics.map((m) => m.resolution));
  const entropyScores = normalize(metrics.map((m) => m.entropy));

  const combined = metrics.map((m, i) => ({
    index: m.index,
    score: aspectScores[i] * 0.4 + resolutionScores[i] * 0.35 + entropyScores[i] * 0.25,
    aspectScore: aspectScores[i],
    resolutionScore: resolutionScores[i],
    entropyScore: entropyScores[i],
  }));

  const fondEntry = combined.reduce((best, cur) => (cur.score > best.score ? cur : best));

  const dominantFactor =
    fondEntry.aspectScore >= fondEntry.resolutionScore &&
    fondEntry.aspectScore >= fondEntry.entropyScore
      ? "la plus large"
      : fondEntry.resolutionScore >= fondEntry.entropyScore
        ? "la plus haute résolution"
        : "la plus détaillée";

  const results: RoleSuggestion[] = imagePaths.map((_, i) => {
    if (i === fondEntry.index) {
      return { role: "fond", reason: `Fond — image ${dominantFactor} du lot` };
    }
    return { role: "bulle1", reason: "" }; // rôle bulle attribué ci-dessous
  });

  const bulleRoles: ImageRole[] = ["bulle1", "bulle2"];
  let bulleCursor = 0;
  for (let i = 0; i < results.length; i++) {
    if (i === fondEntry.index) continue;
    const role = bulleRoles[bulleCursor] ?? "bulle2";
    results[i] = {
      role,
      reason: `${role === "bulle1" ? "Bulle 1" : "Bulle 2"} — déposée en position ${i + 1}`,
    };
    bulleCursor++;
  }

  return results;
}
