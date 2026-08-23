import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/session";
import { cropToAspectSmart } from "@/lib/images/pipeline";
import { retirerBandes } from "@/lib/images/trimBandes";
import { UPLOADS_DIR } from "@/lib/images/store";
import {
  GABARIT_1A_HEIGHT,
  GABARIT_PHOTO_HEIGHT,
  GABARIT_BULLE_WIDTH,
  GABARIT_BULLE_HEIGHT,
  GABARIT_BULLE_OCCUPANCY,
  GABARIT_1A_WIDTH,
} from "@/components/gabarits/Gabarit1A";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  // AVIF accepté le 2026-08-20 : la route d'upload par lot l'acceptait déjà,
  // pas celle-ci — incohérence constatée en testant un vrai visuel
  // (`test12.avif`). `sharp`/libvips le décode nativement, aucune dépendance
  // supplémentaire.
  "image/avif": "avif",
};

/**
 * Upload + recadrage automatique (cahier des charges §2.1 : "Recadre
 * intelligemment" fait partie du dépôt d'image, pas d'une étape séparée).
 * L'amélioration HD reste distincte et à la demande (route /upscale).
 *
 * Deux variantes recadrées (2026-08-19, voir `cropToAspectSmart`) :
 * `croppedUrl` (recadrage strict, pour les bulles) et `backdropUrl`
 * (photo entière sur fond flou/assombri si besoin, pour le fond plein
 * cadre des gabarits — c'est cette variante qu'il faut passer en
 * `imageUrl`).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Champ 'image' manquant ou invalide" },
      { status: 400 },
    );
  }
  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: `Type de fichier non supporté : ${file.type || "inconnu"}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image trop volumineuse (max 20 Mo)" },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const dir = path.join(UPLOADS_DIR, id);
  await mkdir(dir, { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  const originalPath = path.join(dir, `original.${ext}`);
  await writeFile(originalPath, bytes);

  // Certaines sources portent un letterbox incrusté par un export précédent
  // (constaté sur `test31.jpg`, deux bandes blanches de 120 px). Il traversait
  // tout le traitement et ressortait dans le montage — on le retire d'abord,
  // sur une copie : l'original reste intact et téléchargeable.
  const sourcePath = path.join(dir, "source.jpg");
  const bandes = await retirerBandes(originalPath, sourcePath);

  const croppedPath = path.join(dir, "cropped.jpg");
  const backdropPath = path.join(dir, "backdrop.jpg");
  const bullePath = path.join(dir, "bulle.jpg");
  const outcome = await cropToAspectSmart(sourcePath, croppedPath, backdropPath, {
    width: GABARIT_1A_WIDTH,
    height: GABARIT_1A_HEIGHT,
  }, { width: GABARIT_1A_WIDTH, height: GABARIT_PHOTO_HEIGHT }, {
    path: bullePath,
    target: { width: GABARIT_BULLE_WIDTH, height: GABARIT_BULLE_HEIGHT },
    occupancy: GABARIT_BULLE_OCCUPANCY,
  });

  // Stratégie de recadrage renvoyée telle quelle : l'appelant doit toujours
  // pouvoir savoir si le sujet tient entier, si un fond flou a été nécessaire,
  // ou si le détourage a échoué — jamais un succès silencieux (CLAUDE.md §5).
  return NextResponse.json({
    id,
    originalUrl: `/api/images/${id}?variant=original`,
    croppedUrl: `/api/images/${id}?variant=cropped`,
    backdropUrl: `/api/images/${id}?variant=backdrop`,
    // Hauteur réelle de la zone photo pour cette image : l'aperçu doit
    // l'appliquer comme le rendu, sinon aperçu ≠ export (CLAUDE.md §1).
    photoHeight: outcome.backdrop.height,
    bulleUrl: `/api/images/${id}?variant=bulle`,
    crop: outcome,
    bandesRetirees: bandes,
  });
}
