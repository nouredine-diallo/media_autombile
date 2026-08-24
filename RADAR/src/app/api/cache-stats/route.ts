import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/cacheCleanup';

export async function GET() {
  try {
    const stats = getCacheStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[API] Cache stats error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques du cache' },
      { status: 500 }
    );
  }
}
