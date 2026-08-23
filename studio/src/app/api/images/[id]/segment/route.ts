import "server-only";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/session";
import { GABARIT_HEIGHT } from "@/components/gabarits/registry";
import { UPLOADS_DIR, resolveVariantPath } from "@/lib/images/store";
import {
  ARC_DEBORDEMENT_MAX,
  REMPLISSAGE_DEBORDEMENT_MAX,
  mesureArcDebordement,
  cadreConseilleBulle,
  positionSujet,
} from "@/lib/images/subjectCoverage";
import { adoucirBordsDecoupe, segmentSubject, SegmentationUnavailableError } from "@/lib/images/segment";

export const runtime = "nodejs";

/**
 * Détourage du sujet principal, sur `backdrop.jpg` — la variante utilisée
 * comme fond plein cadre des gabarits (`imageUrl`) depuis le 2026-08-19,
 * pas `cropped.jpg` (réservée aux bulles, voir `cropToAspectSmart`). La 3e
 * couche (`sujetUrl`) doit être calculée sur la même image que celle
 * affichée comme fond pour rester alignée pixel pour pixel avec elle
 * (CLAUDE.md §1.1, correctifs directeur point 4) — sinon la découpe du
 * sujet ne correspondrait plus à ce qui est réellement montré en dessous.
 * Calculé une fois, mis en cache sur disque (`subject.png`) — jamais
 * recalculé à chaque rendu (cohérent avec l'amélioration HD, même fichier
 * `store.ts`).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  // `?variant=cropped` détoure l'image de bulle (effet de débordement,
  // Chantier 3) ; par défaut on détoure le fond (3e couche du gabarit).
  const asked = new URL(request.url).searchParams.get("variant");
  const source =
    asked === "bulle"
      ? { variant: "bulle", outFile: "subject-bulle.png", resultVariant: "subject-bulle" }
      : asked === "cropped"
        ? { variant: "cropped", outFile: "subject-cropped.png", resultVariant: "subject-cropped" }
        : { variant: "backdrop", outFile: "subject.png", resultVariant: "subject" };

  const backdropPath = await resolveVariantPath(id, source.variant);
  if (!backdropPath) {
    return NextResponse.json(
      { error: "Image introuvable — importez-la d'abord" },
      { status: 404 },
    );
  }

  const outputPath = path.join(UPLOADS_DIR, id, source.outFile);
  let png: Buffer;
  try {
    png = await segmentSubject(backdropPath);
    // Découpe de bulle : elle est dessinée sans clipping circulaire, donc son
    // bord rectangulaire doit disparaître en fondu (voir `adoucirBordsDecoupe`).
    if (source.variant === "bulle") png = await adoucirBordsDecoupe(png);
    await writeFile(outputPath, png);
  } catch (err) {
    if (err instanceof SegmentationUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  // Pour une image de bulle, on mesure tout de suite si le débordement mérite
  // d'être proposé activé — l'opérateur ne doit pas avoir à le découvrir.
  let debordement:
    | { arc: number; remplissage: number; conseille: boolean; cadre?: string }
    | undefined;
  if (source.variant === "bulle") {
    try {
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { arc, remplissage } = mesureArcDebordement(data, info.width, info.height, info.channels);
      const c = cadreConseilleBulle(data, info.width, info.height, info.channels);
      debordement = {
        arc,
        remplissage,
        conseille:
          arc > 0.01 && arc <= ARC_DEBORDEMENT_MAX && remplissage <= REMPLISSAGE_DEBORDEMENT_MAX,
        cadre: c ? `${c.zoom},${c.dx},${c.dy}` : undefined,
      };
    } catch {
      // Mesure impossible : on ne conseille rien, l'effet reste activable.
    }
  }

  // Position du sujet dans le fond : sert à placer la bulle de la famille 2.
  let sujet: { haut: number; centreX: number } | undefined;
  if (source.variant === "backdrop") {
    try {
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      sujet = positionSujet(data, info.width, info.height, info.channels, GABARIT_HEIGHT);
    } catch {
      // Mesure impossible : la bulle gardera sa géométrie de référence.
    }
  }

  return NextResponse.json({
    sujetUrl: `/api/images/${id}?variant=${source.resultVariant}`,
    debordement,
    sujet,
  });
}
