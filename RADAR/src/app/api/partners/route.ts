import { NextResponse } from 'next/server';
import { getAllPartners, createPartner, getPartnerById, updatePartner, deletePartner, associatePost, dissociatePost, getAvailableArticles, generatePartnerReport } from '@/lib/partners';

// GET all partners or single partner
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const report = searchParams.get('report');
    const available = searchParams.get('available');

    if (available === 'true') {
      const articles = getAvailableArticles();
      return NextResponse.json({ success: true, articles });
    }

    if (id) {
      const partner = getPartnerById(parseInt(id));
      if (!partner) {
        return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
      }

      if (report === 'true') {
        const reportData = generatePartnerReport(parseInt(id));
        return NextResponse.json({ success: true, report: reportData });
      }

      return NextResponse.json({ success: true, partner });
    }

    const partners = getAllPartners();
    return NextResponse.json({ success: true, partners });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST create partner or associate post
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (body.action === 'associate') {
      const { partnerId, contentId } = body;
      if (!partnerId || !contentId) {
        return NextResponse.json({ error: 'partnerId and contentId required' }, { status: 400 });
      }
      const result = associatePost(partnerId, contentId);
      return NextResponse.json({ success: true, association: result });
    }

    if (body.action === 'dissociate') {
      const { partnerId, contentId } = body;
      if (!partnerId || !contentId) {
        return NextResponse.json({ error: 'partnerId and contentId required' }, { status: 400 });
      }
      const result = dissociatePost(partnerId, contentId);
      return NextResponse.json({ success: true, removed: result });
    }

    // Create partner
    const { name, brand, campaign_start, campaign_end, deliverables, notes } = body;
    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }

    const partner = createPartner({ name, brand, campaign_start, campaign_end, deliverables, notes });
    return NextResponse.json({ success: true, partner });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT update partner
export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const body = await request.json();
    const partner = updatePartner(parseInt(id), body);
    
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, partner });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE partner
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const result = deletePartner(parseInt(id));
    return NextResponse.json({ success: true, deleted: result });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
