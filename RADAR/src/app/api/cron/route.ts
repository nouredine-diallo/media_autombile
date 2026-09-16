import { NextResponse } from 'next/server';
import { getCronStatus, getCronConfig, saveCronConfig } from '@/lib/cron';
import { getPipelineStatus } from '@/lib/db';

/**
 * Finding "pipeline bloque le serveur web" (TODO.md §3.3, résolu le 16
 * sept. 2026) : `runPipeline()` s'exécutait autrefois directement ici, dans
 * le process web — exactement la cause du blocage de 30-50 min. Le
 * pipeline tourne désormais dans son propre process PM2 (`radar-pipeline`,
 * src/pipeline-worker.ts), joignable uniquement en interne. Timeout court
 * volontaire (5s) sur le déclenchement : ce process ne fait que relayer la
 * requête, jamais attendre la fin du pipeline lui-même (qui répond
 * immédiatement avec un jobId logique, `runPipeline()` continue en tâche
 * de fond côté worker).
 */
const PIPELINE_WORKER_URL = `http://127.0.0.1:${process.env.PIPELINE_WORKER_PORT || 3010}`;

export async function GET() {
  const cronStatus = getCronStatus();
  const pipelineStatus = getPipelineStatus();

  return NextResponse.json({
    success: true,
    cron: cronStatus,
    pipeline: pipelineStatus,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, config } = body;

  if (action === 'run') {
    try {
      const res = await fetch(`${PIPELINE_WORKER_URL}/run`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (error) {
      // Jamais une dégradation silencieuse (RADAR/CLAUDE.md §6) : si le
      // worker est injoignable, le dire explicitement plutôt que de
      // renvoyer un faux succès.
      console.error('[api/cron] Worker pipeline injoignable:', error);
      return NextResponse.json(
        { success: false, message: 'Process pipeline injoignable — voir pm2 logs radar-pipeline' },
        { status: 503 },
      );
    }
  }

  if (action === 'update_config' && config) {
    saveCronConfig(config);
    // Le worker doit relire la config lui-même pour que le nouveau planning
    // s'applique réellement (cron.ts, saveCronConfig ne redémarre plus rien
    // toute seule depuis la séparation en process). Échec du ping non
    // bloquant : la config est déjà écrite en base, le worker la reprendra
    // au prochain redémarrage même si ce ping échoue — signalé, pas perdu.
    try {
      await fetch(`${PIPELINE_WORKER_URL}/reload-config`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      console.error('[api/cron] Échec du rechargement de config sur le worker (config déjà sauvegardée en base):', error);
    }
    return NextResponse.json({ success: true, config: getCronConfig() });
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
}
