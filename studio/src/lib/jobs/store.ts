import "server-only";

export type ExportJobStatus = "pending" | "rendering" | "uploading" | "done" | "error";

export interface ExportJob {
  id: string;
  gabaritId: string;
  fieldValues: Record<string, string>;
  status: ExportJobStatus;
  pngBuffer?: Buffer;
  driveUrl?: string;
  driveFileId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Stockage en mémoire pour les jobs d'export.
 * Perf suffisante pour un outil interne mono-utilisateur :
 * Playwright render ~2s, Drive upload ~1s, job total < 5s.
 * Un job vit rarement plus de 60s. Le nettoyage automatique
 * des jobs de > 5 min garantit qu'on ne filling pas la RAM.
 */
const jobs = new Map<string, ExportJob>();

const JOB_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createJob(
  id: string,
  gabaritId: string,
  fieldValues: Record<string, string>,
): ExportJob {
  const now = Date.now();
  const job: ExportJob = {
    id,
    gabaritId,
    fieldValues,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  cleanup();
  return job;
}

export function getJob(id: string): ExportJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<ExportJob>): ExportJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

function cleanup() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}
