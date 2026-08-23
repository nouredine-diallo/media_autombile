import { NextRequest, NextResponse } from 'next/server';
import { autoTagEvent, getEventTags, removeEventTag } from '@/lib/auto-tag';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = Number(searchParams.get('event_id'));

  if (!eventId) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 });
  }

  const tags = getEventTags(eventId);
  return NextResponse.json({ tags });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { event_id, title, summary } = body;

  if (!event_id || !title) {
    return NextResponse.json({ error: 'event_id and title required' }, { status: 400 });
  }

  const tags = autoTagEvent(event_id, title, summary);
  return NextResponse.json({ tags });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = Number(searchParams.get('event_id'));
  const tag = searchParams.get('tag');

  if (!eventId || !tag) {
    return NextResponse.json({ error: 'event_id and tag required' }, { status: 400 });
  }

  removeEventTag(eventId, tag);
  return NextResponse.json({ ok: true });
}
