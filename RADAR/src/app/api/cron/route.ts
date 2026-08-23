import { NextResponse } from 'next/server';
import { getCronStatus, getCronConfig, saveCronConfig, runPipeline } from '@/lib/cron';
import { getPipelineStatus } from '@/lib/db';

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
    // Trigger a manual run
    runPipeline().catch(console.error);
    return NextResponse.json({ success: true, message: 'Pipeline triggered' });
  }

  if (action === 'update_config' && config) {
    saveCronConfig(config);
    return NextResponse.json({ success: true, config: getCronConfig() });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
