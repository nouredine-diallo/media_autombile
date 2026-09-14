"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/apiFetch";

export interface ExportJobState {
  jobId: string;
  status: string;
  driveUrl?: string;
  hasDownload?: boolean;
  error?: string;
}

const POLL_INTERVAL_MS = 800;
// Un échec isolé (blip réseau, 502 nginx passager) ne doit pas arrêter le
// suivi — seule une série d'échecs consécutifs indique une vraie coupure.
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Poll de l'état d'un job d'export.
 *
 * Corrige le finding critique C1 de l'audit du 2026-09-07 : `titres/page.tsx`
 * et `titres/carrousel/page.tsx` arrêtaient le polling au tout premier échec
 * HTTP/réseau sans jamais le signaler (`if (!r.ok) return;` / `catch {}`
 * muet) — l'écran restait figé sur « Rendu Playwright… »/« Upload vers
 * Drive… » indéfiniment, sans message, sans retry ; seul recours : recharger
 * la page et perdre le travail en cours. `export/[jobId]/ExportConfirmationClient.tsx`
 * gérait déjà ça correctement (erreur visible) — ce hook généralise ce
 * comportement aux deux pages qui ne l'avaient pas, en ajoutant en plus une
 * tolérance aux échecs transitoires (5G, connexion qui coupe une seconde)
 * au lieu de mourir sur le premier accroc.
 */
export function useExportJobPolling() {
  const [job, setJob] = useState<ExportJobState | null>(null);
  const cancelledRef = useRef(false);
  const failuresRef = useRef(0);

  const poll = useCallback(function pollOnce(jobId: string): void {
    if (cancelledRef.current) return;

    (async () => {
      try {
        const res = await fetch(`/api/export/${jobId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
          throw new Error(data.error ?? `Erreur ${res.status}`);
        }
        const data = await res.json();
        failuresRef.current = 0;
        if (cancelledRef.current) return;
        setJob({ jobId, status: data.status, driveUrl: data.driveUrl, hasDownload: data.hasDownload });
        if (data.status !== "done" && data.status !== "error") {
          setTimeout(() => pollOnce(jobId), POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelledRef.current) return;
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setJob({
            jobId,
            status: "error",
            error:
              err instanceof Error
                ? `Connexion instable — suivi de l'export interrompu (${err.message}). Vérifie ta connexion et réessaie.`
                : "Connexion instable — suivi de l'export interrompu. Vérifie ta connexion et réessaie.",
          });
          return;
        }
        setTimeout(() => pollOnce(jobId), POLL_INTERVAL_MS);
      }
    })();
  }, []);

  const start = useCallback(
    (jobId: string) => {
      cancelledRef.current = false;
      failuresRef.current = 0;
      setJob({ jobId, status: "pending" });
      poll(jobId);
    },
    [poll]
  );

  /** Relance le suivi du même job après un état d'erreur — sans relancer l'export lui-même. */
  const retry = useCallback(() => {
    setJob((current) => {
      if (!current) return current;
      cancelledRef.current = false;
      failuresRef.current = 0;
      poll(current.jobId);
      return { ...current, status: "pending", error: undefined };
    });
  }, [poll]);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setJob(null);
  }, []);

  // Finding C7 (audit 2026-09-07) : reconnexion automatique — un export
  // resté bloqué en "Connexion instable" (5 échecs consécutifs, ~4s) ne
  // demandait qu'une chose pour repartir : que la connexion revienne. Ne
  // plus obliger l'opérateur à remarquer et taper "Réessayer" lui-même.
  const jobRef = useRef(job);
  useEffect(() => {
    jobRef.current = job;
  }, [job]);
  useOnlineStatus(() => {
    if (jobRef.current?.status === "error") retry();
  });

  return { job, start, retry, reset };
}
