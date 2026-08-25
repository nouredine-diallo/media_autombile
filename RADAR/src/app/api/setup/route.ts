import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const INITIAL_FEEDS = [
  // ── Internationaux (RSS natifs, pas de scraping) ──
  { name: 'Autocar UK', url: 'https://www.autocar.co.uk/car-news/rss', priority: 1, requiresScraping: false },
  { name: 'Carscoops', url: 'https://www.carscoops.com/feed/', priority: 1, requiresScraping: false },
  { name: 'Motor1', url: 'https://www.motor1.com/rss/news/', priority: 1, requiresScraping: false },
  { name: 'CarBuzz', url: 'https://www.carbuzz.com/feed', priority: 1, requiresScraping: false },
  { name: 'InsideEVs', url: 'https://insideevs.com/rss/news/all/', priority: 1, requiresScraping: false },
  { name: 'The Drive', url: 'https://www.thedrive.com/feed', priority: 2, requiresScraping: false },
  { name: 'Green Car Reports', url: 'https://www.greencarreports.com/rss/news', priority: 2, requiresScraping: false },
  { name: 'Top Speed', url: 'https://www.topspeed.com/feed/', priority: 2, requiresScraping: false },
  { name: 'Motor Authority', url: 'https://www.motorauthority.com/feed', priority: 2, requiresScraping: false },
  { name: 'Motor Trend', url: 'https://www.motortrend.com/feed/', priority: 2, requiresScraping: false },

  // ── Constructeurs (RSS natifs) ──
  { name: 'Toyota Global', url: 'https://global.toyota/export/en/allnews_rss.xml', priority: 1, requiresScraping: false },
  { name: 'BMW Press', url: 'https://www.press.bmwgroup.com/global/rss', priority: 2, requiresScraping: false },
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
