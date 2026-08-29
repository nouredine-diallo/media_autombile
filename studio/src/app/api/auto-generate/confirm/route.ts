import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createJob, updateJob } from "@/lib/jobs/store";
import { processExportJob } from "@/lib/export/runExport";
import { loadAutoGenerateSidecar, clearAutoGenerateSidecar } from "@/lib/autoGenerate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/auto-generate/confirm — le clic humain "Confirmer" côté RADAR
 * (studio/CLAUDE.md §2 : c'est LA confirmation explicite requise avant tout
 * export). Rejoue le rendu + upload Drive exactement comme /api/export
 * (même fonction `processExportJob`, aucune logique dupliquée), à partir de
 * la spec générée par /api/auto-generate et persistée sur disque.
 *
 * Protégé par le même secret partagé que /api/auto-generate.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-import-secret");
  if (!secret || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const contentId = body?.contentId;
  if (typeof contentId !== "string" || !contentId) {
    return NextResponse.json({ error: "contentId requis" }, { status: 400 });
  }

  const sidecar = await loadAutoGenerateSidecar(contentId);
  if (!sidecar) {
    return NextResponse.json(
      { error: "Aperçu introuvable ou expiré — régénérer depuis RADAR" },
      { status: 404 },
    );
  }

  const jobId = randomUUID();
  createJob(jobId, sidecar.gabaritId, sidecar.fieldValues);

  processExportJob(jobId, sidecar.gabaritId, sidecar.fieldValues, contentId, request.nextUrl.origin)
    .then(() => clearAutoGenerateSidecar(contentId))
    .catch((err) => {
      console.error(`[auto-generate/confirm] Job ${jobId} échoué:`, err);
      updateJob(jobId, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    });

  return NextResponse.json({ jobId }, { status: 202 });
}
