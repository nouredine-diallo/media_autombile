import { NextRequest, NextResponse } from 'next/server';
import { acquireLock, releaseLock, heartbeat, forceUnlock, getLockStatus, unlockStale } from '@/lib/locks';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get('ids');

  // Always clean stale locks first
  unlockStale();

  if (ids) {
    const idList = ids.split(',').map(Number).filter(n => !isNaN(n));
    const statuses = getLockStatus(idList);
    return NextResponse.json({ locks: statuses });
  }

  return NextResponse.json({ error: 'ids parameter required' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, article_id, username } = body;

  if (!action || !article_id || !username) {
    return NextResponse.json({ error: 'action, article_id, and username required' }, { status: 400 });
  }

  // Clean stale locks
  unlockStale();

  switch (action) {
    case 'acquire': {
      const result = acquireLock(article_id, username);
      const isOwn = result.locked_by === username;
      return NextResponse.json({
        locked: isOwn,
        locked_by: result.locked_by,
        locked_at: result.locked_at,
      });
    }
    case 'release': {
      releaseLock(article_id, username);
      return NextResponse.json({ ok: true });
    }
    case 'heartbeat': {
      const ok = heartbeat(article_id, username);
      return NextResponse.json({ ok });
    }
    case 'force-unlock': {
      forceUnlock(article_id);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
