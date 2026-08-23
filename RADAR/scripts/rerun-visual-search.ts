/**
 * Re-run visual search on toyota-racing-newsroom.com items
 * to test the Playwright JS-loaded image fix.
 */
import { getDb } from '../src/lib/db';
import { scrapeArticleImages } from '../src/lib/visualSearch';

async function main() {
  const db = getDb();
  const items = db.prepare(
    "SELECT id, title, url FROM items WHERE url LIKE '%racing-newsroom%' AND (image_url IS NULL OR image_url = '')"
  ).all() as { id: number; title: string; url: string }[];

  console.log(`Re-running visual search on ${items.length} racing-newsroom items...\n`);

  for (const item of items) {
    console.log(`[${item.id}] ${item.title.substring(0, 60)}`);
    console.log(`  URL: ${item.url}`);

    try {
      const images = await scrapeArticleImages(item.url, item.title);
      console.log(`  Found ${images.length} images:`);

      for (const img of images.slice(0, 3)) {
        console.log(`    - [${img.source}] ${img.url.substring(0, 80)} (${img.width}x${img.height})`);
      }

      if (images.length > 0) {
        const best = images[0];
        db.prepare("UPDATE items SET image_url = ?, image_source = ? WHERE id = ?").run(
          best.url, best.source, item.id
        );
        console.log(`  ✅ Updated item ${item.id} with [${best.source}] ${best.url.substring(0, 80)}`);
      } else {
        console.log(`  ❌ No images found`);
      }
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`);
    }
    console.log();
  }

  // Close browser
  const { closeBrowser } = await import('../src/lib/visualSearch');
  await closeBrowser();
}

main().catch(console.error);
