import { NextResponse } from 'next/server';
import { 
  getCalendarEvents, 
  getAllCalendarEvents, 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent,
  generateArticleDeadlines,
  getWeekDates 
} from '@/lib/calendar';

// GET events
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const id = searchParams.get('id');
    const week = searchParams.get('week');
    const generate = searchParams.get('generate');

    if (generate === 'deadlines') {
      const count = generateArticleDeadlines();
      return NextResponse.json({ success: true, generated: count });
    }

    if (id) {
      // This would need getCalendarEventById, but we'll keep it simple
      return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
    }

    let events;
    if (week) {
      const weekDates = getWeekDates(new Date(week));
      events = getCalendarEvents(weekDates.start, weekDates.end);
    } else if (start && end) {
      events = getCalendarEvents(start, end);
    } else {
      events = getAllCalendarEvents();
    }

    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST create event
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, event_type, start_date, end_date, all_day, content_id, partner_id, article_id, color } = body;

    if (!title || !event_type || !start_date) {
      return NextResponse.json({ 
        error: 'title, event_type, and start_date are required' 
      }, { status: 400 });
    }

    const event = createCalendarEvent({
      title,
      description,
      event_type,
      start_date,
      end_date,
      all_day: all_day ?? 1,
      content_id,
      partner_id,
      article_id,
      color,
    });

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT update event
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const body = await request.json();
    const event = updateCalendarEvent(parseInt(id), body);

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE event
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const result = deleteCalendarEvent(parseInt(id));
    return NextResponse.json({ success: true, deleted: result });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
