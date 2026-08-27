import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const feeds = db.prepare(
      'SELECT id, name, url, priority, enabled, last_fetched_at FROM feeds ORDER BY priority, name'
    ).all();
    return NextResponse.json(feeds);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch feeds' }, { status: 500 });
  }
}
