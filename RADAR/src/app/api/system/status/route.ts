import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDegradedModeStatus } from '@/lib/killswitch';
import { getPipelineStatus } from '@/lib/db';
import { getLastBackupStatus } from '@/lib/backup';
import { getLastVacuumStatus } from '@/lib/vacuum';

/**
 * Audit du 2026-09-07 (finding E2/E5) : ce endpoint (exempté d'auth,
 * middleware.ts) ne reflétait que le taux de rejet humain — pas un vrai
 * signal de santé. Rien dans le projet ne préviendrait l'équipe d'une
 * panne comme le pipeline resté silencieux ou le disque qui se remplit,
 * avant qu'un humain n'ouvre le dashboard. Enrichi pour être exploitable
 * par un monitoring externe gratuit (UptimeRobot/Healthchecks.io) : un
 * simple "200 OK" ne suffit plus, `healthy` reflète l'état réel.
 */

// Le cron tourne toutes les 4h — 8h de marge avant de considérer le
// pipeline silencieux (deux cycles ratés, pas un seul retard ponctuel).
const PIPELINE_STALE_HOURS = 8;
const DISK_WARN_FREE_BYTES = 500 * 1024 * 1024;

export async function GET() {
  try {
    const status = getDegradedModeStatus();

    const { lastRun } = getPipelineStatus();
    const lastRunAgeHours = lastRun
      ? (Date.now() - new Date(lastRun.started_at).getTime()) / 3_600_000
      : null;
    const pipelineHealthy =
      lastRun !== null &&
      lastRun.status !== 'failed' &&
      (lastRunAgeHours === null || lastRunAgeHours < PIPELINE_STALE_HOURS);

    let diskFreeBytes: number | null = null;
    let diskHealthy = true;
    try {
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'radar.db');
      const stat = fs.statfsSync(path.dirname(dbPath));
      diskFreeBytes = stat.bavail * stat.bsize;
      diskHealthy = diskFreeBytes > DISK_WARN_FREE_BYTES;
    } catch {
      // fs.statfsSync indisponible sur certaines plateformes — ne bloque
      // jamais le endpoint pour ça, juste pas de signal disque cette fois.
    }

    const lastBackup = getLastBackupStatus();
    const lastVacuum = getLastVacuumStatus();
    const healthy = pipelineHealthy && diskHealthy && !status.degraded;

    return NextResponse.json({
      success: true,
      healthy,
      ...status,
      pipeline: {
        healthy: pipelineHealthy,
        lastRunStatus: lastRun?.status ?? null,
        lastRunAgeHours: lastRunAgeHours !== null ? Math.round(lastRunAgeHours * 10) / 10 : null,
        lastRunError: lastRun?.error ?? null,
      },
      disk: {
        healthy: diskHealthy,
        freeBytes: diskFreeBytes,
      },
      lastBackup,
      lastVacuum,
    });
  } catch (error) {
    console.error('Error fetching system status:', error);
    return NextResponse.json(
      { success: false, healthy: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
