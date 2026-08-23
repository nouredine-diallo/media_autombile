"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface JobStatus {
  id: string;
  gabaritId: string;
  status: "pending" | "rendering" | "uploading" | "done" | "error";
  driveUrl?: string;
  driveFileId?: string;
  error?: string;
  hasDownload: boolean;
}

const STATUS_LABEL: Record<JobStatus["status"], string> = {
  pending: "En attente…",
  rendering: "Rendu Playwright en cours…",
  uploading: "Upload vers Google Drive…",
  done: "Terminé",
  error: "Erreur",
};

export function ExportConfirmationClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/export/${jobId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erreur inconnue" }));
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      const data: JobStatus = await res.json();
      setJob(data);
      return data.status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      return "error";
    }
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function loop() {
      if (cancelled) return;
      const status = await poll();
      if (cancelled) return;
      if (status !== "done" && status !== "error") {
        timer = setTimeout(loop, 800);
      }
    }

    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [poll]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">
          Export en cours
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {job && (
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              {job.status !== "done" && job.status !== "error" && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
              )}
              {job.status === "done" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {job.status === "error" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              <p className="text-sm font-medium text-zinc-900">
                {STATUS_LABEL[job.status]}
              </p>
            </div>

            {job.status === "done" && (
              <div className="flex flex-col gap-3">
                {job.driveUrl && (
                  <a
                    href={job.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-700"
                  >
                    Ouvrir dans Google Drive
                  </a>
                )}
                {job.hasDownload && (
                  <a
                    href={`/api/export/${jobId}/download`}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Télécharger le PNG
                  </a>
                )}
                {!job.driveUrl && job.hasDownload && (
                  <p className="text-xs text-zinc-500">
                    Google Drive non configuré — le fichier est disponible en téléchargement direct.
                  </p>
                )}
              </div>
            )}

            {job.status === "error" && job.error && (
              <p className="text-sm text-red-600">{job.error}</p>
            )}
          </div>
        )}

        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
        >
          Retour à l&apos;accueil
        </Link>
      </main>
    </div>
  );
}
