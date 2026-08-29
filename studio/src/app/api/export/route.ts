import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/session";
import { GABARITS } from "@/components/gabarits/registry";
import { createJob, createCarouselJob, updateJob, type CarouselSlideSpec } from "@/lib/jobs/store";
import { renderGabaritToPng } from "@/lib/render/renderGabarit";
import { uploadCarouselToDrive } from "@/lib/drive/upload";
import { processExportJob, notifyRadarExported } from "@/lib/export/runExport";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/export — lance le rendu Playwright + upload Drive en tâche de fond.
 * Retourne immédiatement un jobId que le client poll via GET /api/export/[jobId].
 *
 * Le body peut contenir un champ optionnel `contentId` passé depuis RADAR via
 * le prefill. Après upload Drive réussi, un callback silencieux est envoyé à
 * RADAR pour marquer l'article comme exporté (fire-and-forget).
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

  const { gabaritId, fieldValues, contentId, slides } = body as {
    gabaritId?: string;
    fieldValues?: Record<string, string>;
    contentId?: string;
    slides?: CarouselSlideSpec[];
  };

  // Chemin carrousel (§6 du plan écosystème, étape D) — distinct du chemin
  // single-image ci-dessous, jamais emprunté par lui. `slides` n'existe que
  // dans le nouveau contrat carrousel ; son absence retombe exactement sur le
  // comportement single-image déjà en production, inchangé.
  if (Array.isArray(slides)) {
    if (slides.length === 0) {
      return NextResponse.json({ error: "slides ne peut pas être vide" }, { status: 400 });
    }
    for (const slide of slides) {
      if (!slide.gabaritId || !GABARITS[slide.gabaritId]) {
        return NextResponse.json({ error: `Gabarit inconnu dans slides: ${slide.gabaritId}` }, { status: 404 });
      }
    }

    const jobId = randomUUID();
    createCarouselJob(jobId, slides);

    processCarouselExportJob(jobId, slides, contentId ?? null, fieldValues?.caption, request.nextUrl.origin).catch(
      (err) => {
        console.error(`[export] Job carrousel ${jobId} échoué:`, err);
        updateJob(jobId, {
          status: "error",
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      },
    );

    return NextResponse.json({ jobId }, { status: 202 });
  }

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
    if (typeof value === "string" && value.length > 0) {
      resolved[field.key] = value;
    } else if (field.key === "eyebrow") {
      // Le surtitre ne doit JAMAIS utiliser le placeholder par défaut
      resolved[field.key] = "";
    } else {
      resolved[field.key] = def.defaults[field.key] ?? "";
    }
  }

  const jobId = randomUUID();
  createJob(jobId, gabaritId, resolved);

  // Lancer le traitement en arrière-plan (ne pas attendre la réponse)
  processExportJob(jobId, gabaritId, resolved, contentId ?? null, request.nextUrl.origin).catch(
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents (diacritiques après décomposition NFD)
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
async function processCarouselExportJob(
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

