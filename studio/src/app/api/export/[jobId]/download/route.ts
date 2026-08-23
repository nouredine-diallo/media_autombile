import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getJob } from "@/lib/jobs/store";

export const runtime = "nodejs";

/**
 * GET /api/export/[jobId]/download — renvoie le PNG exporté en tant que fichier.
 * Utilisé une fois le job terminé pour le téléchargement direct.
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

  if (job.status !== "done" || !job.pngBuffer) {
    return NextResponse.json({ error: "Le rendu n'est pas terminé" }, { status: 409 });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `post-${timestamp}-${jobId.slice(0, 8)}.png`;

  return new NextResponse(new Uint8Array(job.pngBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
