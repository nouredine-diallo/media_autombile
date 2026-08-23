import { NextRequest, NextResponse } from 'next/server';
import { reSearchImageForItem } from '@/lib/visualSearch';
import { getDb } from '@/lib/db';

/**
 * C3: Reject an auto-found visual and immediately try to find a better alternative.
 * POST { item_id: number, rejected_url: string, reason?: string }
 *
 * Flow:
 * 1. Mark item as rejected + clear image
 * 2. Re-scrape the article, blacklisting the rejected URL
 * 3. If alternative found → update item, return new image
 * 4. If no alternative → return null, user must search manually
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { item_id, rejected_url, reason } = body;

  if (!item_id || !rejected_url) {
    return NextResponse.json(
      { error: 'item_id and rejected_url required' },
      { status: 400 }
    );
  }

  const db = getDb();

  // Step 1: Mark rejected + clear current image
  db.prepare(
    "UPDATE items SET image_rejected = 1, image_url = NULL, image_source = NULL, rejection_reason = ? WHERE id = ?"
  ).run(reason || 'unsuitable', item_id);

  // Step 2: Re-scrape with blacklist
  const { newImage, newSource } = await reSearchImageForItem(item_id, rejected_url);

  return NextResponse.json({
    ok: true,
    rejected: true,
    newImage,
    newSource,
    message: newImage
      ? 'Un visuel alternatif a été trouvé'
      : 'Aucun alternatif trouvé — recherche manuelle recommandée',
  });
}
