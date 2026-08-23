import "server-only";
import path from "node:path";
import { access } from "node:fs/promises";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VARIANT_FILES: Record<string, string[]> = {
  original: ["original.jpg", "original.png", "original.webp", "original.avif"],
  /** Copie de travail : original débarrassé d'un éventuel letterbox incrusté. */
  source: ["source.jpg"],
  cropped: ["cropped.jpg"],
  backdrop: ["backdrop.jpg"],
  upscaled: ["upscaled.png"],
  subject: ["subject.png"],
  // Détourage de la variante `cropped` (image d'une bulle), distinct du
  // détourage du fond (`subject`) : les deux images n'ont ni le même
  // recadrage ni le même ratio depuis le 2026-08-20, une seule découpe ne
  // peut donc pas servir aux deux. Utilisé par l'effet de débordement de
  // bulle (Chantier 3).
  "subject-cropped": ["subject-cropped.png"],
  // Recadrage paysage dédié aux bulles (voir GABARIT_BULLE_WIDTH) et sa
  // découpe, qui alimente l'effet de débordement.
  bulle: ["bulle.jpg"],
  "subject-bulle": ["subject-bulle.png"],
};

/**
 * Résout le chemin disque d'une variante d'image, en validant strictement
 * l'id (UUID) et le nom de variante contre une liste fermée — n'accepte
 * jamais de segment de chemin arbitraire venant de la requête (pas de
 * traversée de répertoire possible).
 */
export async function resolveVariantPath(
  id: string,
  variant: string,
): Promise<string | null> {
  if (!UUID_RE.test(id)) return null;
  const candidates = VARIANT_FILES[variant];
  if (!candidates) return null;

  const dir = path.join(UPLOADS_DIR, id);
  for (const name of candidates) {
    const candidatePath = path.join(dir, name);
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      // essaie le candidat suivant (ex : original.jpg vs original.png)
    }
  }
  return null;
}
