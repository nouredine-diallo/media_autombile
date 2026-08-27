import Parser from 'rss-parser';
import type Database from 'better-sqlite3';
import { getDb, Feed, Item } from './db';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  customFields: {
    item: [
      ['enclosure', 'enclosure'],
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

export interface ParsedItem {
  title: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  imageUrl?: string | null;
}

function extractImageUrl(item: Record<string, unknown>): string | null {
  // 1. enclosure with image type
  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && enclosure.type?.startsWith('image/')) {
    return enclosure.url;
  }

  // 2. media:content with image type
  const mediaContent = item.mediaContent as { url?: string; medium?: string; type?: string } | undefined;
  if (mediaContent?.url && (mediaContent.medium === 'image' || mediaContent.type?.startsWith('image/'))) {
    return mediaContent.url;
  }

  // 3. media:thumbnail
  const mediaThumbnail = item.mediaThumbnail as { url?: string } | undefined;
  if (mediaThumbnail?.url) {
    return mediaThumbnail.url;
  }

  // 4. enclosure without type check (some feeds don't set type)
  if (enclosure?.url && /\.(jpe?g|png|gif|webp|avif)/i.test(enclosure.url)) {
    return enclosure.url;
  }

  // 5. Parse content/summary for <img> tags
  const htmlContent = (item.contentEncoded as string) || (item.content as string) || '';
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }

  // 6. Parse summary for <img> tags
  const summary = (item.contentSnippet as string) || '';
  const summaryImgMatch = summary.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (summaryImgMatch) {
    return summaryImgMatch[1];
  }

  return null;
}

export async function fetchFeed(feed: Feed): Promise<ParsedItem[]> {
  try {
    console.log(`Fetching feed: ${feed.name} from ${feed.url}`);
    const feedData = await parser.parseURL(feed.url);
    console.log(`Feed ${feed.name} parsed, found ${(feedData.items || []).length} items`);
    
    return (feedData.items || []).map(item => {
      const raw = item as unknown as Record<string, unknown>;
      return {
        title: item.title || 'Untitled',
        link: item.link,
        content: item.content || item.contentSnippet,
        contentSnippet: item.contentSnippet,
        isoDate: item.isoDate,
        pubDate: item.pubDate,
        imageUrl: extractImageUrl(raw),
      };
    });
  } catch (error) {
    console.error(`Error fetching feed ${feed.name} from ${feed.url}:`, error);
    return [];
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 2));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isNearDuplicate(title: string, db: Database.Database): boolean {
  // Check last 500 items for similar titles (covers recent ingests)
  const recent = db.prepare(
    'SELECT title FROM items ORDER BY id DESC LIMIT 500'
  ).all() as { title: string }[];

  for (const item of recent) {
    if (titleSimilarity(title, item.title) >= 0.75) {
      return true;
    }
  }
  return false;
}

export function storeItems(feedId: number, items: ParsedItem[]): { stored: number; duplicates: number; nearDuplicates: number } {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO items (feed_id, title, url, content, summary, published_at, image_url, image_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'rss')
  `);

  let stored = 0;
  let duplicates = 0;
  let nearDuplicates = 0;

  const insertMany = db.transaction((items: ParsedItem[]) => {
    for (const item of items) {
      // Exact duplicate (UNIQUE constraint)
      const result = insert.run(
        feedId,
        item.title,
        item.link || null,
        item.content || null,
        item.contentSnippet || null,
        item.isoDate || item.pubDate || null,
        item.imageUrl || null
      );
      if (result.changes > 0) {
        stored++;
        continue;
      }

      duplicates++;

      // Near-duplicate check: same story, slightly different title
      if (!isNearDuplicate(item.title, db)) {
        // Not a near-duplicate of existing items — mark explicitly
        // This is a genuine re-publish or update, not a clone
      } else {
        nearDuplicates++;
      }
    }
  });

  insertMany(items);
  return { stored, duplicates, nearDuplicates };
}

export function getFeeds(): Feed[] {
  const db = getDb();
  return db.prepare('SELECT * FROM feeds WHERE enabled = 1 ORDER BY priority').all() as Feed[];
}

export function addFeed(name: string, url: string, priority: number = 1, requiresScraping: boolean = false): Feed {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO feeds (name, url, priority, requires_scraping) VALUES (?, ?, ?, ?)'
  ).run(name, url, priority, requiresScraping ? 1 : 0);
  
  return db.prepare('SELECT * FROM feeds WHERE id = ?').get(result.lastInsertRowid) as Feed;
}

export function updateFeedLastFetched(feedId: number): void {
  const db = getDb();
  db.prepare('UPDATE feeds SET last_fetched_at = datetime(\'now\') WHERE id = ?').run(feedId);
}

export function getItems(limit: number = 50): (Item & { feed_name: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name 
    FROM items i 
    JOIN feeds f ON i.feed_id = f.id 
    WHERE i.is_duplicate = 0 
    ORDER BY i.fetched_at DESC 
    LIMIT ?
  `).all(limit) as (Item & { feed_name: string })[];
}

export function getItemsWithoutImages(): (Item & { feed_name: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name
    FROM items i
    JOIN feeds f ON i.feed_id = f.id
    WHERE i.is_duplicate = 0
      AND i.image_url IS NULL
      AND (i.image_rejected IS NULL OR i.image_rejected = 0)
      AND i.url IS NOT NULL
    ORDER BY i.fetched_at DESC
    LIMIT 50
  `).all() as (Item & { feed_name: string })[];
}

export function getItemsWithRejectedImages(): (Item & { feed_name: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name
    FROM items i
    JOIN feeds f ON i.feed_id = f.id
    WHERE i.image_rejected = 1
      AND i.url IS NOT NULL
    ORDER BY i.id DESC
  `).all() as (Item & { feed_name: string })[];
}

export function updateItemImage(itemId: number, imageUrl: string, source: string): void {
  const db = getDb();
  db.prepare('UPDATE items SET image_url = ?, image_source = ? WHERE id = ?').run(imageUrl, source, itemId);
}

/**
 * Enregistre toutes les images candidates trouvées pour un item (pas
 * seulement la meilleure, déjà posée sur `items.image_url` par
 * `updateItemImage`) — nécessaire pour composer un carrousel à plusieurs
 * visuels. Additif : remplace le contenu précédent de `item_images` pour cet
 * item (une nouvelle recherche invalide l'ancien classement), ne touche pas
 * `items.image_url`.
 */
export function storeItemImages(
  itemId: number,
  images: Array<{ url: string; source: string; width?: number; height?: number }>
): void {
  const db = getDb();
  const del = db.prepare('DELETE FROM item_images WHERE item_id = ?');
  const insert = db.prepare(
    'INSERT INTO item_images (item_id, url, source, rank, width, height) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction((imgs: typeof images) => {
    del.run(itemId);
    imgs.forEach((img, rank) => {
      insert.run(itemId, img.url, img.source, rank, img.width ?? null, img.height ?? null);
    });
  });
  tx(images);
}

export function getItemImages(itemId: number): Array<{ url: string; source: string; rank: number; width: number | null; height: number | null }> {
  const db = getDb();
  return db.prepare(
    'SELECT url, source, rank, width, height FROM item_images WHERE item_id = ? ORDER BY rank ASC'
  ).all(itemId) as Array<{ url: string; source: string; rank: number; width: number | null; height: number | null }>;
}

export function updateItemImagePreflight(itemId: number, verdict: string): void {
  const db = getDb();
  db.prepare('UPDATE items SET image_preflight = ? WHERE id = ?').run(verdict, itemId);
}

export function getItemById(itemId: number): (Item & { feed_name: string }) | null {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name
    FROM items i
    JOIN feeds f ON i.feed_id = f.id
    WHERE i.id = ?
  `).get(itemId) as (Item & { feed_name: string }) | null;
}
