import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { enabled } = await request.json();
    const db = getDb();
    db.prepare('UPDATE feeds SET enabled = ? WHERE id = ?').run(
      enabled ? 1 : 0,
      Number(id)
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update feed' }, { status: 500 });
  }
}
