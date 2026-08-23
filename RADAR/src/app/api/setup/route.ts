import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const INITIAL_FEEDS = [
  // Toyota - RSS natif (fonctionne)
  { name: 'Toyota Global', url: 'https://global.toyota/export/en/allnews_rss.xml', priority: 1, requiresScraping: false },
  
  // Stellantis - RSS natifs (nécessitent Playwright - bloqués par CDN)
  { name: 'Stellantis Corporate', url: 'https://www.media.stellantis.com/me-en/corporate/rss', priority: 1, requiresScraping: true },
  { name: 'Peugeot France', url: 'https://www.media.stellantis.com/fr-fr/peugeot/rss', priority: 1, requiresScraping: true },
  { name: 'Citroën France', url: 'https://www.media.stellantis.com/fr-fr/citroen/rss', priority: 1, requiresScraping: true },
];

export async function POST() {
  const db = getDb();
  
  const insert = db.prepare(`
    INSERT OR IGNORE INTO feeds (name, url, priority, requires_scraping)
    VALUES (?, ?, ?, ?)
  `);

  let created = 0;
  let existing = 0;

  const insertMany = db.transaction((feeds: typeof INITIAL_FEEDS) => {
    for (const feed of feeds) {
      const result = insert.run(feed.name, feed.url, feed.priority, feed.requiresScraping ? 1 : 0);
      if (result.changes > 0) {
        created++;
      } else {
        existing++;
      }
    }
  });

  insertMany(INITIAL_FEEDS);

  return NextResponse.json({
    success: true,
    created,
    existing,
    total: INITIAL_FEEDS.length,
  });
}

export async function GET() {
  const db = getDb();
  const feeds = db.prepare('SELECT * FROM feeds ORDER BY priority').all();
  return NextResponse.json({ feeds });
}
