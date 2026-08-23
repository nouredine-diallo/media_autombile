import { NextRequest, NextResponse } from 'next/server';
import { getAllRules, addRule, updateRule, deleteRule, getActiveRules } from '@/lib/style-rules';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active') === 'true';

  const rules = activeOnly ? getActiveRules() : getAllRules();
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { banned, expected } = body;

  if (!banned || !expected) {
    return NextResponse.json({ error: 'banned and expected required' }, { status: 400 });
  }

  const rule = addRule(banned, expected);
  return NextResponse.json({ rule });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, banned, expected, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  updateRule(id, { banned, expected, is_active });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  deleteRule(id);
  return NextResponse.json({ ok: true });
}
