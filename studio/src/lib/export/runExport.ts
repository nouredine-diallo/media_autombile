import "server-only";
import { updateJob, type CarouselSlideSpec } from "@/lib/jobs/store";
import { renderGabaritToPng } from "@/lib/render/renderGabarit";
import { uploadToDrive, uploadCarouselToDrive } from "@/lib/drive/upload";

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

/**
 * Renommage "intelligent" d'une slide : dérivé de son propre texte plutôt
 * que d'un numéro générique (`slide-1.png`) — l'opérateur doit reconnaître
 * le contenu d'un fichier dans son gestionnaire de fichiers sans avoir à
 * ouvrir chacun. Numéro d'ordre conservé en préfixe (`01-`, `02-`…) pour que
 * le tri alphabétique du dossier respecte l'ordre du carrousel.
 */
function nommerSlide(index: number, spec: CarouselSlideSpec): string {
  const texte = extractSlideText(spec);
  const slug = texte
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // accents (diacritiques après décomposition NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const numero = String(index + 1).padStart(2, "0");
  return slug ? `${numero}-${slug}.png` : `${numero}-slide-${spec.gabaritId}.png`;
}

/**
 * Variante carrousel de `processExportJob` — rend chaque slide (même
 * `renderGabaritToPng`, aucune duplication du rendu), puis dépose le tout
 * dans un vrai sous-dossier Drive (`uploadCarouselToDrive`, voir §6 étape D).
 * Extrait de `/api/export` (2026-09-17, phase 4 du plan écosystème) pour
 * être réutilisable par `/api/auto-generate/confirm` — même principe que
 * `processExportJob` juste au-dessus, aucune logique dupliquée.
 *
 * Repli local ajouté le 2026-08-28 : Drive n'était pas configuré, et
 * l'ancien comportement ("un échec Drive ici passe le job en `error`, il
 * n'existe pas encore de route de téléchargement direct pour un lot de
 * slides") rendait le carrousel totalement inutilisable en pratique tant
 * que Drive n'est pas branché. Un job "done" avec les slides déjà rendues
 * mais sans lien Drive n'est PAS une dégradation silencieuse (§5 du
 * CLAUDE.md) puisqu'un vrai moyen de récupérer les fichiers existe
 * maintenant (`/api/export/[jobId]/download-zip`) — même pattern que
 * `processExportJob` applique déjà au single-image juste au-dessus.
 */
export async function processCarouselExportJob(
  jobId: string,
  slidesSpec: CarouselSlideSpec[],
  contentId: string | null,
  caption: string | undefined,
  origin: string,
) {
  updateJob(jobId, { status: "rendering" });

  const slides: { buffer: Buffer; filename: string }[] = [];
  for (let i = 0; i < slidesSpec.length; i++) {
    const spec = slidesSpec[i];
    const buffer = await renderGabaritToPng(spec.gabaritId, spec.fieldValues, origin);
    slides.push({ buffer, filename: nommerSlide(i, spec) });
  }
  updateJob(jobId, { slides });

  const timestamp = new Date().toISOString().slice(0, 10);
  const folderName = `post-${timestamp}-${jobId.slice(0, 8)}`;

  updateJob(jobId, { status: "uploading" });
  try {
    const { folderId, folderUrl } = await uploadCarouselToDrive(slides, folderName, caption);
    updateJob(jobId, {
      status: "done",
      driveUrl: folderUrl,
      driveFileId: folderId,
    });

    if (contentId) {
      const carouselTexts = slidesSpec.map((s) => extractSlideText(s));
      notifyRadarExported(contentId, folderUrl, folderId, carouselTexts).catch((err) => {
        console.warn(`[export] Callback RADAR échoué pour ${contentId}:`, err);
      });
    }
  } catch (driveErr) {
    // Drive peut ne pas être configuré — les slides restent disponibles en
    // ZIP local. Callback RADAR envoyé quand même (2026-08-28, même
    // correctif que processExportJob juste au-dessus) — sinon RADAR ignore
    // toujours que le carrousel a été produit.
    console.warn(`[export] Drive upload carrousel échoué pour ${jobId}:`, driveErr);
    updateJob(jobId, {
      status: "done",
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

/** Texte principal d'une slide, quel que soit le nom du champ selon le gabarit (§2.7 du plan). */
function extractSlideText(spec: CarouselSlideSpec): string {
  return spec.fieldValues.title ?? spec.fieldValues.paragraph ?? spec.fieldValues.message ?? "";
}
