import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getJob } from "@/lib/jobs/store";

export const runtime = "nodejs";

/**
 * GET /api/export/[jobId] — retourne l'état du job d'export pour le polling côté client.
 * Quand le job est "done", inclut le lien Drive (si dispo) et un lien de téléchargement direct.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job inconnu ou expiré" }, { status: 404 });
  }

  // Ne pas renvoyer le buffer PNG dans la réponse JSON — le client le récupère
  // via /api/export/[jobId]/download quand le status est "done"
  const safeJob = {
    id: job.id,
    gabaritId: job.gabaritId,
    fieldValues: job.fieldValues,
    status: job.status,
    driveUrl: job.driveUrl,
    driveFileId: job.driveFileId,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };

  const response: Record<string, unknown> = {
    ...safeJob,
    hasDownload: job.status === "done" && !!job.pngBuffer,
    // Présent seulement pour un job carrousel — absent (donc ignoré côté
    // client existant) pour un job single-image, comportement inchangé.
    slideCount: job.slides?.length,
  };

  return NextResponse.json(response);
}
