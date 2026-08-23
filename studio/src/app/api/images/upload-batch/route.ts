import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/session";
import { cropToAspectSmart } from "@/lib/images/pipeline";
import { retirerBandes } from "@/lib/images/trimBandes";
import { UPLOADS_DIR } from "@/lib/images/store";
import { suggestRoles } from "@/lib/images/roles";
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
const MAX_IMAGES = 3;
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Étape 3 : dépôt de 1 à 3 images en une fois, avec attribution automatique
 * du rôle (fond / bulle1 / bulle2) — cahier des charges §3, écran 2.
 *
 * L'attribution de rôle est calculée sur les images ORIGINALES (pas un
 * recadrage), pour ne pas fausser le signal de contenu (entropie). Le
 * recadrage 4:5 est en revanche produit pour **toutes** les images, pas
 * seulement celle suggérée comme fond : l'utilisateur doit pouvoir corriger
 * l'attribution en un clic (cahier §3, écran 2) sans jamais retomber sur un
 * aperçu manquant — décision favorisant la personnalisation, le coût de
 * calcul supplémentaire est négligeable (images déjà petites après upload).
 * La bulle circulaire proprement dite (Étape 4, gabarits à bulles) recevra
 * son propre traitement plus tard ; ce recadrage 4:5 sert uniquement de
 * variante "fond" prête à l'emploi, quelle que soit l'image choisie.
 *
 * Deux URLs recadrées par image depuis le 2026-08-19 (voir
 * `cropToAspectSmart`) : `croppedUrl` (recadrage strict, pour les bulles)
 * et `backdropUrl` (photo entière, fond flou/assombri si besoin — à
 * utiliser pour `imageUrl` quand l'image sert de fond plein cadre).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const files = form?.getAll("images") ?? [];
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Aucune image reçue (champ 'images')" },
      { status: 400 },
    );
  }
  if (files.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_IMAGES} images par post` },
      { status: 400 },
    );
  }
  for (const f of files) {
    if (!(f instanceof File)) {
      return NextResponse.json({ error: "Fichier invalide" }, { status: 400 });
    }
    if (!ALLOWED_MIME[f.type]) {
      return NextResponse.json(
        { error: `Type de fichier non supporté : ${f.type || "inconnu"}` },
        { status: 400 },
      );
    }
    if (f.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Image trop volumineuse (max 20 Mo) : ${f.name}` },
        { status: 400 },
      );
    }
  }

  const items = await Promise.all(
    (files as File[]).map(async (file) => {
      const id = randomUUID();
      const dir = path.join(UPLOADS_DIR, id);
      await mkdir(dir, { recursive: true });
      const ext = ALLOWED_MIME[file.type];
      const originalPath = path.join(dir, `original.${ext}`);
      await writeFile(originalPath, Buffer.from(await file.arrayBuffer()));
      return { id, dir, originalPath };
    }),
  );

  const suggestions = await suggestRoles(items.map((it) => it.originalPath));

  const results = await Promise.all(
    items.map(async (item, i) => {
      const suggestion = suggestions[i];
      // Voir la route unitaire : on retire d'abord un éventuel letterbox
      // incrusté dans la source, sur une copie.
      const sourcePath = path.join(item.dir, "source.jpg");
      await retirerBandes(item.originalPath, sourcePath);

      const croppedPath = path.join(item.dir, "cropped.jpg");
      const backdropPath = path.join(item.dir, "backdrop.jpg");
      const bullePath = path.join(item.dir, "bulle.jpg");
      const outcome = await cropToAspectSmart(sourcePath, croppedPath, backdropPath, {
        width: GABARIT_1A_WIDTH,
        height: GABARIT_1A_HEIGHT,
      }, { width: GABARIT_1A_WIDTH, height: GABARIT_PHOTO_HEIGHT }, {
        path: bullePath,
        target: { width: GABARIT_BULLE_WIDTH, height: GABARIT_BULLE_HEIGHT },
        occupancy: GABARIT_BULLE_OCCUPANCY,
      });
      return {
        id: item.id,
        originalUrl: `/api/images/${item.id}?variant=original`,
        croppedUrl: `/api/images/${item.id}?variant=cropped`,
        backdropUrl: `/api/images/${item.id}?variant=backdrop`,
        // Hauteur réelle de la zone photo pour cette image : l'aperçu doit
        // l'appliquer comme le rendu, sinon aperçu ≠ export (CLAUDE.md §1).
        photoHeight: outcome.backdrop.height,
        bulleUrl: `/api/images/${item.id}?variant=bulle`,
        role: suggestion.role,
        reason: suggestion.reason,
      };
    }),
  );

  return NextResponse.json({ images: results });
}
