import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/cacheCleanup';
import { getLastBackupStatus } from '@/lib/backup';

export async function GET() {
  try {
    const stats = getCacheStats();
    // finding E1 : rendre visible l'état de la dernière sauvegarde plutôt que
    // de le laisser dormir en base sans que personne ne le consulte.
    const lastBackup = getLastBackupStatus();
    return NextResponse.json({ ...stats, lastBackup });
  } catch (error) {
    console.error('[API] Cache stats error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques du cache' },
      { status: 500 }
    );
  }
}
