import { NextResponse } from 'next/server';
import { generateBrief, getBrief } from '@/lib/brief';

export async function POST(request: Request) {
  try {
    const { event_id } = await request.json();
    
    if (!event_id) {
      return NextResponse.json(
        { error: 'event_id is required' },
        { status: 400 }
      );
    }
    
    const brief = generateBrief(event_id);
    
    if (!brief) {
      return NextResponse.json(
        { error: 'Event not found or no items available' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      brief,
    });
  } catch (error) {
    console.error('Error generating brief:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    
    if (!eventId) {
      return NextResponse.json(
        { error: 'event_id query parameter is required' },
        { status: 400 }
      );
    }
    
    const brief = getBrief(parseInt(eventId));
    
    if (!brief) {
      return NextResponse.json(
        { error: 'Brief not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      brief,
    });
  } catch (error) {
    console.error('Error fetching brief:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
