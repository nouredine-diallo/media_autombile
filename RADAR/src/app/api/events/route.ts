import { NextRequest, NextResponse } from 'next/server';
import { getEventsWithItems } from '@/lib/scoring';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assignedTo = searchParams.get('assigned_to');

  const db = getDb();
  let events;

  if (assignedTo) {
    // Filter: show events assigned to this user, OR unassigned events
    events = db.prepare(`
      SELECT e.*, GROUP_CONCAT(DISTINCT f.name) as feed_names
      FROM events e
      LEFT JOIN event_items ei ON e.id = ei.event_id
      LEFT JOIN items i ON ei.item_id = i.id
      LEFT JOIN feeds f ON i.feed_id = f.id
      WHERE e.assigned_to = ? OR e.assigned_to IS NULL
      GROUP BY e.id
      ORDER BY e.score DESC, e.last_updated_at DESC
    `).all(assignedTo);
  } else {
    events = getEventsWithItems(50);
  }

  return NextResponse.json({ events });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { event_id, force_urgent, assigned_to } = body;

  if (!event_id) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 });
  }

  const db = getDb();

  if (force_urgent) {
    db.prepare(`
      UPDATE events SET urgent_until = datetime('now', '+24 hours') WHERE id = ?
    `).run(event_id);
  } else if (assigned_to !== undefined) {
    db.prepare(`
      UPDATE events SET assigned_to = ? WHERE id = ?
    `).run(assigned_to, event_id);
  } else {
    db.prepare(`
      UPDATE events SET urgent_until = NULL WHERE id = ?
    `).run(event_id);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { action, item_id, reason } = body;

  if (action === 'reject_image' && item_id) {
    const db = getDb();
    db.prepare("UPDATE items SET image_rejected = 1, image_url = NULL, image_source = NULL, rejection_reason = ? WHERE id = ?").run(reason || null, item_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
