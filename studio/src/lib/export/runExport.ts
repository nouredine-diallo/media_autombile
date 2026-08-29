import "server-only";
import { updateJob } from "@/lib/jobs/store";
import { renderGabaritToPng } from "@/lib/render/renderGabarit";
import { uploadToDrive } from "@/lib/drive/upload";

/**
 * Rendu + upload Drive d'un job single-image — extrait de `/api/export`
 * (2026-08-29) pour être réutilisable par `/api/auto-generate/confirm`
 * (flux "Confirmer" du parcours à un clic) sans dupliquer la logique
 * Playwright/Drive, même principe que l'extraction de `renderGabaritToPng`
 * (CLAUDE.md §1 : un seul chemin de rendu/export).
 */
export async function processExportJob(
  jobId: string,
  gabaritId: string,
  fieldValues: Record<string, string>,
  contentId: string | null,
  origin: string,
) {
  // 1. Rendu Playwright (~1-3s)
  updateJob(jobId, { status: "rendering" });
  const pngBuffer = await renderGabaritToPng(gabaritId, fieldValues, origin);
  updateJob(jobId, { status: "rendering" });

  // 2. Upload Google Drive (~1-2s)
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `post-${timestamp}-${jobId.slice(0, 8)}.png`;
  const caption = fieldValues.title || "";

  try {
    updateJob(jobId, { status: "uploading" });
    const { fileId, webViewLink } = await uploadToDrive(pngBuffer, filename, {
      title: fieldValues.title,
      caption,
    });
    updateJob(jobId, {
      status: "done",
      pngBuffer,
      driveUrl: webViewLink,
      driveFileId: fileId,
    });

    if (contentId) {
      notifyRadarExported(contentId, webViewLink, fileId).catch((err) => {
        console.warn(`[export] Callback RADAR échoué pour ${contentId}:`, err);
      });
    }
  } catch (driveErr) {
    // Drive peut ne pas être configuré — le PNG reste disponible en téléchargement direct.
    console.warn(`[export] Drive upload échoué pour ${jobId}:`, driveErr);
    updateJob(jobId, {
      status: "done",
      pngBuffer,
      driveUrl: undefined,
      driveFileId: undefined,
    });
    if (contentId) {
      notifyRadarExported(contentId, undefined, undefined).catch((err) => {
        console.warn(`[export] Callback RADAR (repli local) échoué pour ${contentId}:`, err);
      });
    }
  }
}

/**
 * Notifie silencieusement RADAR qu'un export a eu lieu — fire-and-forget,
 * si RADAR est down l'export STUDIO continue normalement.
 */
export async function notifyRadarExported(
  contentId: string,
  driveUrl: string | undefined,
  driveFileId: string | undefined,
  carouselTexts?: string[],
): Promise<void> {
  const radarUrl = process.env.RADAR_URL;
  if (!radarUrl) return;

  await fetch(`${radarUrl}/api/events/${contentId}/exported`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driveUrl, driveFileId, carouselTexts }),
    signal: AbortSignal.timeout(5000),
  });
}
