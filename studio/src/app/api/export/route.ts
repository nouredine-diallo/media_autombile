import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/session";
import { GABARITS } from "@/components/gabarits/registry";
import { createJob, createCarouselJob, updateJob, type CarouselSlideSpec } from "@/lib/jobs/store";
import { getInternalRenderOrigin } from "@/lib/render/renderGabarit";
import { processExportJob, processCarouselExportJob } from "@/lib/export/runExport";

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

    processCarouselExportJob(jobId, slides, contentId ?? null, fieldValues?.caption, getInternalRenderOrigin()).catch(
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
  processExportJob(jobId, gabaritId, resolved, contentId ?? null, getInternalRenderOrigin()).catch(
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
