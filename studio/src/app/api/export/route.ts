import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/session";
import { GABARITS } from "@/components/gabarits/registry";
import { createJob, updateJob } from "@/lib/jobs/store";
import { renderGabaritToPng } from "@/lib/render/renderGabarit";
import { uploadToDrive } from "@/lib/drive/upload";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/export — lance le rendu Playwright + upload Drive en tâche de fond.
 * Retourne immédiatement un jobId que le client poll via GET /api/export/[jobId].
 *
 * Critère de fin cahier §7 Étape 6 : < 5s de traitement serveur, < 1 min total.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { gabaritId, fieldValues } = body as {
    gabaritId?: string;
    fieldValues?: Record<string, string>;
  };

  if (!gabaritId || typeof gabaritId !== "string") {
    return NextResponse.json({ error: "gabaritId requis" }, { status: 400 });
  }

  const def = GABARITS[gabaritId];
  if (!def) {
    return NextResponse.json({ error: "Gabarit inconnu" }, { status: 404 });
  }

  if (!fieldValues || typeof fieldValues !== "object") {
    return NextResponse.json({ error: "fieldValues requis" }, { status: 400 });
  }

  // Résoudre les valeurs avec fallback vers les defaults
  const resolved: Record<string, string> = {};
  for (const field of def.fields) {
    const value = fieldValues[field.key];
    resolved[field.key] =
      typeof value === "string" && value.length > 0
        ? value
        : (def.defaults[field.key] ?? "");
  }

  const jobId = randomUUID();
  createJob(jobId, gabaritId, resolved);

  // Lancer le traitement en arrière-plan (ne pas attendre la réponse)
  processExportJob(jobId, gabaritId, resolved, request.nextUrl.origin).catch(
    (err) => {
      console.error(`[export] Job ${jobId} échoué:`, err);
      updateJob(jobId, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    },
  );

  return NextResponse.json({ jobId }, { status: 202 });
}

async function processExportJob(
  jobId: string,
  gabaritId: string,
  fieldValues: Record<string, string>,
  origin: string,
) {
  // 1. Rendu Playwright (~1-3s)
  updateJob(jobId, { status: "rendering" });
  const pngBuffer = await renderGabaritToPng(gabaritId, fieldValues, origin);
  updateJob(jobId, { status: "rendering" }, );

  // 2. Upload Google Drive (~1-2s)
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `post-${timestamp}-${jobId.slice(0, 8)}.png`;

  try {
    updateJob(jobId, { status: "uploading" });
    const { fileId, webViewLink } = await uploadToDrive(pngBuffer, filename, {
      title: fieldValues.title,
    });
    updateJob(jobId, {
      status: "done",
      pngBuffer,
      driveUrl: webViewLink,
      driveFileId: fileId,
    });
  } catch (driveErr) {
    // Drive peut ne pas être configuré — le PNG reste disponible en téléchargement direct
    console.warn(`[export] Drive upload échoué pour ${jobId}:`, driveErr);
    updateJob(jobId, {
      status: "done",
      pngBuffer,
      driveUrl: undefined,
      driveFileId: undefined,
    });
  }
}
