import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import { getSession } from "@/lib/session";
import { getJob } from "@/lib/jobs/store";

export const runtime = "nodejs";

/**
 * GET /api/export/[jobId]/download-zip — dossier ZIP du carrousel exporté
 * (un PNG par slide, noms dérivés du contenu — voir `nommerSlide` dans
 * `../../route.ts` — plus une légende texte). Repli local pour le carrousel
 * quand Drive n'est pas configuré (2026-08-28) — même rôle que
 * `[jobId]/download/route.ts` pour le single-image, format ZIP en plus car
 * un carrousel produit plusieurs fichiers.
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

  if (job.status !== "done" || !job.slides || job.slides.length === 0) {
    return NextResponse.json({ error: "Le rendu n'est pas terminé" }, { status: 409 });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const zipName = `post-${timestamp}-${jobId.slice(0, 8)}.zip`;

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  for (const slide of job.slides) {
    archive.append(slide.buffer, { name: slide.filename });
  }
  // Légende — même contenu que celui déposé à côté des PNG sur Drive
  // (studio/CLAUDE.md §6b), pour que le repli local ait la même info.
  const legende = job.slidesSpec?.map((s) => s.fieldValues.title ?? s.fieldValues.paragraph ?? s.fieldValues.message ?? "").join("\n\n") ?? "";
  if (legende.trim().length > 0) {
    archive.append(legende, { name: "legende.txt" });
  }
  void archive.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of passthrough) {
    chunks.push(chunk as Buffer);
  }
  const zipBuffer = Buffer.concat(chunks);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
    },
  });
}
