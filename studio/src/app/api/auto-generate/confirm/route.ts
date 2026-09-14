import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createJob, updateJob } from "@/lib/jobs/store";
import { processExportJob } from "@/lib/export/runExport";
import { loadAutoGenerateSidecar, clearAutoGenerateSidecar } from "@/lib/autoGenerate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Finding D5 (audit 2026-09-07) : le sidecar n'était effacé qu'APRÈS un
 * export réussi (`.then(() => clearAutoGenerateSidecar(...))` ci-dessous) —
 * deux appels rapprochés de cette route pour le même contentId (double-clic,
 * requête rejouée) passaient donc tous les deux `loadAutoGenerateSidecar`
 * avec succès et déclenchaient chacun leur propre export Drive. Verrou en
 * mémoire process, même idée que `locked_by`/`locked_at` côté RADAR
 * (articles) — suffisant ici : un seul process Node sert STUDIO (PM2 sans
 * cluster, deploy/start-studio.sh).
 */
const contentIdsInFlight = new Set<string>();

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

  if (contentIdsInFlight.has(contentId)) {
    return NextResponse.json(
      { error: "Export déjà en cours pour cet article" },
      { status: 409 },
    );
  }

  const sidecar = await loadAutoGenerateSidecar(contentId);
  if (!sidecar) {
    return NextResponse.json(
      { error: "Aperçu introuvable ou expiré — régénérer depuis RADAR" },
      { status: 404 },
    );
  }

  contentIdsInFlight.add(contentId);

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
    })
    .finally(() => {
      contentIdsInFlight.delete(contentId);
    });

  return NextResponse.json({ jobId }, { status: 202 });
}
