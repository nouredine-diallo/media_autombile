import { chromium, type Browser } from 'playwright';
import { getDb } from './db';
import { getItemsWithoutImages, updateItemImage, updateItemImagePreflight, getItemById, storeItemImages } from './rss';
import path from 'path';
import fs from 'fs';

const VISUAL_SEARCH_DIR = path.join(process.cwd(), 'visual-cache');
const MIN_IMAGE_WIDTH = 400;
const MIN_IMAGE_HEIGHT = 300;
// URL interne (conteneur → conteneur) pour l'import d'images — distincte de
// STUDIO_URL qui, elle, alimente les liens cliqués dans le navigateur.
const STUDIO_IMPORT_URL = process.env.STUDIO_IMPORT_URL || process.env.STUDIO_URL || 'http://127.0.0.1:3002';
const IMPORT_SECRET = process.env.IMPORT_SECRET || '';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

interface ScrapedImage {
  url: string;
  width: number;
  height: number;
  source: string;
  alt?: string;
}

/**
 * Extract images from a page using multiple strategies
 */
async function extractImagesFromPage(page: import('playwright').Page): Promise<ScrapedImage[]> {
  // NOTE: Using string-based evaluate to avoid esbuild/tsx `__name` injection issue
  return page.evaluate(`
    (() => {
      const images = [];

      // Strategy 1: og:image meta tag
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.getAttribute('content')) {
        images.push({ url: ogImage.getAttribute('content'), width: 1200, height: 630, source: 'og:image', alt: '' });
      }

      // Strategy 2: twitter:image meta tag
      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      if (twitterImage && twitterImage.getAttribute('content')) {
        images.push({ url: twitterImage.getAttribute('content'), width: 800, height: 418, source: 'twitter:image', alt: '' });
      }

      // Strategy 3: article featured images (common selectors)
      const selectors = [
        'article img',
        '.article-image img',
        '.featured-image img',
        '.hero-image img',
        '.post-image img',
        '.entry-content img',
        'figure img',
        '.press-release img',
        '.gallery img',
        'main img',
      ];

      const seen = new Set();
      for (const selector of selectors) {
        const imgs = document.querySelectorAll(selector);
        for (const img of imgs) {
          const htmlImg = img;
          const src = htmlImg.src || (htmlImg.dataset && htmlImg.dataset.src);
          if (!src || seen.has(src)) continue;

          const w = htmlImg.naturalWidth || htmlImg.width || 0;
          const h = htmlImg.naturalHeight || htmlImg.height || 0;
          if (w < 200 && h < 200) continue;

          if (/logo|icon|avatar|sprite|pixel|tracking|1x1/i.test(src)) continue;

          seen.add(src);
          images.push({ url: src, width: w, height: h, source: 'page', alt: htmlImg.alt || '' });
        }
      }

      // Strategy 4: srcset (pick largest)
      const srcsetImgs = document.querySelectorAll('img[srcset]');
      for (const img of srcsetImgs) {
        const srcset = img.getAttribute('srcset');
        if (!srcset) continue;
        const parts = srcset.split(',').map(function(s) { return s.trim(); });
        let bestUrl = '';
        let bestWidth = 0;
        for (const part of parts) {
          const tokens = part.split(/\\s+/);
          const url = tokens[0];
          const w = parseInt(tokens[1]) || 0;
          if (w > bestWidth) {
            bestWidth = w;
            bestUrl = url;
          }
        }
        if (bestUrl && bestWidth >= 400 && !seen.has(bestUrl)) {
          seen.add(bestUrl);
          images.push({ url: bestUrl, width: bestWidth, height: 0, source: 'srcset', alt: '' });
        }
      }

      return images;
    })()
  `) as Promise<ScrapedImage[]>;
}

/**
 * Score an image for relevance to automotive content
 */
function scoreImage(img: ScrapedImage, articleTitle: string): number {
  let score = 0;

  // Resolution bonus
  const pixels = img.width * img.height;
  if (pixels >= 1920 * 1080) score += 40;
  else if (pixels >= 1200 * 800) score += 30;
  else if (pixels >= MIN_IMAGE_WIDTH * MIN_IMAGE_HEIGHT) score += 20;

  // Aspect ratio bonus (4:5 or 1:1 preferred for Instagram)
  if (img.width > 0 && img.height > 0) {
    const ratio = img.width / img.height;
    if (ratio >= 0.75 && ratio <= 0.9) score += 20; // 4:5
    else if (ratio >= 0.95 && ratio <= 1.05) score += 15; // 1:1
    else if (ratio >= 1.5 && ratio <= 1.8) score += 10; // 16:9
  }

  // Source priority
  if (img.source === 'og:image') score += 15;
  else if (img.source === 'twitter:image') score += 12;
  else if (img.source === 'page') score += 8;

  // URL pattern bonus (high-res images)
  if (/hero|featured|main|press/i.test(img.url)) score += 10;
  if (/\d{3,}x\d{3,}/i.test(img.url)) score += 5;

  // C3: Keyword matching — title words found in alt text or URL path = strong relevance signal
  const titleWords = articleTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const haystack = `${img.alt || ''} ${img.url}`.toLowerCase();
  let keywordHits = 0;
  for (const word of titleWords) {
    if (haystack.includes(word)) keywordHits++;
  }
  if (titleWords.length > 0) {
    const hitRatio = keywordHits / titleWords.length;
    if (hitRatio >= 0.4) score += 30;      // 40%+ title words match = very relevant
    else if (hitRatio >= 0.2) score += 15;  // 20-40% = likely relevant
  }

  // C3: Blacklist penalty — stock photos, generic images, watermarks
  if (/shutterstock|getty|istock|adobe|stock|watermark|placeholder|generic/i.test(img.url)) score -= 40;
  if (/default|no-image|missing|blank|empty/i.test(img.url)) score -= 30;
  if (/icon|logo|avatar|badge|button/i.test(img.url)) score -= 20;
  // Penalize very small files even if dimensions pass
  if (/thumb|small|mini|_s\.|_t\./i.test(img.url)) score -= 10;

  return score;
}

/**
 * Scrape images from a single article URL.
 * Uses progressive wait strategies for JS-heavy sites (e.g. toyota-racing-newsroom.com).
 */
export async function scrapeArticleImages(
  url: string,
  articleTitle: string
): Promise<ScrapedImage[]> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Step 1: Load page — wait for network to settle (not just DOM)
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    // Step 2: Scroll down to trigger lazy-loaded images
    // NOTE: We avoid page.evaluate with arrow functions because esbuild/tsx
    // compilation injects a `__name` helper that breaks in the browser context.
    // Instead, use Playwright's mouse.wheel() API.
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(400);
    }
    await page.evaluate('window.scrollTo(0, 0)');

    // Step 3: Wait for images to actually appear in DOM (JS-rendered content)
    // Try common image selectors — if any appear, we know JS has rendered
    const jsImageSelectors = [
      'article img[src]',
      '.article-image img[src]',
      'figure img[src]',
      '.press-release img[src]',
      'main img[src]',
      'img[data-src]',
      'img[data-lazy-src]',
      'img[data-original]',
      '.content img[src]',
    ];

    let foundJsImages = false;
    for (const sel of jsImageSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        foundJsImages = true;
        break;
      } catch {
        // Selector not found, try next
      }
    }

    // Step 4: If no images found yet, wait a bit more for very slow sites
    if (!foundJsImages) {
      await page.waitForTimeout(3000);
      // Try scrolling again
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(500);
      }
      await page.evaluate('window.scrollTo(0, 0)');
      await page.waitForTimeout(1000);
    }

    // Step 5: Also try waiting for network to be truly idle (all XHR/image loads done)
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Timeout is OK — we'll work with what we have
    }

    const images = await extractImagesFromPage(page);

    // Score and sort
    const scored = images
      .map(img => ({ ...img, score: scoreImage(img, articleTitle) }))
      .filter(img => img.width >= MIN_IMAGE_WIDTH || img.height >= MIN_IMAGE_HEIGHT)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ score, ...img }) => img);
  } catch (error) {
    console.error(`Failed to scrape images from ${url}:`, error);
    return [];
  } finally {
    await context.close();
  }
}

/**
 * Download an image to local cache
 */
export async function downloadImage(imageUrl: string): Promise<string | null> {
  try {
    if (!fs.existsSync(VISUAL_SEARCH_DIR)) {
      fs.mkdirSync(VISUAL_SEARCH_DIR, { recursive: true });
    }

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // Skip tiny files (< 5KB)
    if (buffer.length < 5000) return null;

    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = path.join(VISUAL_SEARCH_DIR, filename);

    fs.writeFileSync(filepath, buffer);
    return filepath;
  } catch {
    return null;
  }
}

/**
 * Preflight: send an image URL to STUDIO's import endpoint for gabarit
 * compatibility check. Returns the verdict or null on failure.
 *
 * This is fire-and-forget: failures are logged but never block the pipeline.
 */
export async function preflightImage(imageUrl: string): Promise<{
  verdict: 'ok' | 'marginal' | 'bad';
  bestGabarits: string[];
  subjectWidth: number;
  fitsSubject: boolean;
} | null> {
  if (!IMPORT_SECRET) {
    console.log('  Preflight skipped: IMPORT_SECRET not set');
    return null;
  }

  try {
    const res = await fetch(`${STUDIO_IMPORT_URL}/api/images/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-import-secret': IMPORT_SECRET,
      },
      body: JSON.stringify({ url: imageUrl }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.error(`  Preflight failed (${res.status}): ${await res.text().catch(() => '?')}`);
      return null;
    }

    const data = await res.json();
    return {
      verdict: data.verdict,
      bestGabarits: data.bestGabarits,
      subjectWidth: data.subjectWidth,
      fitsSubject: data.fitsSubject,
    };
  } catch (err) {
    console.error('  Preflight error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Main function: find images for items that don't have any
 * Called after RSS ingestion
 */
export async function findImagesForItems(): Promise<{ processed: number; found: number; preflied: number }> {
  const items = getItemsWithoutImages();
  let found = 0;
  let preflied = 0;

  console.log(`Visual search: ${items.length} items without images`);

  for (const item of items) {
    if (!item.url) continue;

    try {
      const images = await scrapeArticleImages(item.url, item.title);
      if (images.length > 0) {
        const best = images[0];
        updateItemImage(item.id, best.url, best.source);
        storeItemImages(item.id, images);
        found++;
        console.log(`  Found image for "${item.title.slice(0, 60)}..." [${best.source}]`);

        // Preflight: check gabarit compatibility asynchronously (non-blocking)
        preflightImage(best.url).then((verdict) => {
          if (verdict) {
            updateItemImagePreflight(item.id, JSON.stringify(verdict));
            preflied++;
            console.log(`  Preflight ${verdict.verdict} for "${item.title.slice(0, 40)}..." [${verdict.bestGabarits.join(',')}]`);
          }
        }).catch(() => {});
      }
    } catch (error) {
      console.error(`  Error scraping ${item.url}:`, error);
    }
  }

  return { processed: items.length, found, preflied };
}

/**
 * Preflight items that have images but no preflight verdict yet.
 * Called as step 5 in the cron pipeline.
 */
export async function preflightItemsWithoutVerdict(): Promise<{ checked: number; ok: number; marginal: number; bad: number }> {
  const db = getDb();
  const items = db.prepare(`
    SELECT i.id, i.image_url, i.title
    FROM items i
    WHERE i.image_url IS NOT NULL
      AND (i.image_rejected IS NULL OR i.image_rejected = 0)
      AND i.image_preflight IS NULL
    ORDER BY i.id DESC
    LIMIT 20
  `).all() as { id: number; image_url: string; title: string }[];

  let checked = 0, ok = 0, marginal = 0, bad = 0;

  if (items.length === 0) return { checked: 0, ok: 0, marginal: 0, bad: 0 };
  console.log(`Preflight: ${items.length} images without verdict`);

  for (const item of items) {
    const verdict = await preflightImage(item.image_url);
    if (verdict) {
      updateItemImagePreflight(item.id, JSON.stringify(verdict));
      checked++;
      if (verdict.verdict === 'ok') ok++;
      else if (verdict.verdict === 'marginal') marginal++;
      else bad++;
    }
  }

  console.log(`Preflight done: ${checked} checked — ${ok} ok, ${marginal} marginal, ${bad} bad`);
  return { checked, ok, marginal, bad };
}

/**
 * Find best image for a specific event (from its source items)
 */
export function getBestImageForEvent(eventId: number): string | null {
  const db = getDb();
  const item = db.prepare(`
    SELECT i.image_url
    FROM items i
    JOIN event_items ei ON ei.item_id = i.id
    WHERE ei.event_id = ? AND i.image_url IS NOT NULL
      AND (i.image_rejected IS NULL OR i.image_rejected = 0)
    ORDER BY
      CASE
        WHEN i.image_source = 'og:image' THEN 1
        WHEN i.image_source = 'twitter:image' THEN 2
        WHEN i.image_source = 'page' THEN 3
        WHEN i.image_source = 'rss' THEN 4
        ELSE 5
      END
    LIMIT 1
  `).get(eventId) as { image_url: string } | undefined;

  return item?.image_url ?? null;
}

/**
 * Find images for multiple events at once
 */
export function getImagesForEvents(eventIds: number[]): Map<number, string | null> {
  const db = getDb();
  const result = new Map<number, string | null>();

  const rows = db.prepare(`
    SELECT ei.event_id, i.image_url
    FROM event_items ei
    JOIN items i ON ei.item_id = i.id
    WHERE ei.event_id IN (${eventIds.map(() => '?').join(',')})
      AND i.image_url IS NOT NULL
      AND (i.image_rejected IS NULL OR i.image_rejected = 0)
    ORDER BY
      CASE
        WHEN i.image_source = 'og:image' THEN 1
        WHEN i.image_source = 'twitter:image' THEN 2
        WHEN i.image_source = 'page' THEN 3
        WHEN i.image_source = 'rss' THEN 4
        ELSE 5
      END
  `).all(...eventIds) as { event_id: number; image_url: string }[];

  for (const row of rows) {
    if (!result.has(row.event_id)) {
      result.set(row.event_id, row.image_url);
    }
  }

  // Set null for events without images
  for (const id of eventIds) {
    if (!result.has(id)) {
      result.set(id, null);
    }
  }

  return result;
}

/**
 * Clean up old files in the visual-cache directory (files older than maxAgeMs).
 * Called by the cron pipeline to prevent unbounded disk growth.
 */
export function cleanupVisualCache(maxAgeMs = 72 * 60 * 60 * 1000): { removed: number; kept: number } {
  if (!fs.existsSync(VISUAL_SEARCH_DIR)) return { removed: 0, kept: 0 };

  const now = Date.now();
  let removed = 0;
  let kept = 0;

  try {
    const files = fs.readdirSync(VISUAL_SEARCH_DIR);
    for (const file of files) {
      const filepath = path.join(VISUAL_SEARCH_DIR, file);
      try {
        const stat = fs.statSync(filepath);
        if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filepath);
          removed++;
        } else {
          kept++;
        }
      } catch {
        kept++;
      }
    }
  } catch {
    // Directory read failure — non-fatal
  }

  return { removed, kept };
}

/**
 * Graceful cleanup
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * C3: Re-search for an image after rejection.
 * Blacklists the rejected URL so it won't be picked again.
 * Returns new image URL if found, null otherwise.
 */
export async function reSearchImageForItem(
  itemId: number,
  rejectedUrl: string
): Promise<{ newImage: string | null; newSource: string | null }> {
  const item = getItemById(itemId);
  if (!item?.url) return { newImage: null, newSource: null };

  try {
    const images = await scrapeArticleImages(item.url, item.title);

    // Blacklist: skip the rejected URL and any URL from the same domain path
    const rejectedPath = new URL(rejectedUrl).pathname;
    const alternatives = images.filter(img => {
      try {
        const imgPath = new URL(img.url).pathname;
        return img.url !== rejectedUrl && imgPath !== rejectedPath;
      } catch {
        return img.url !== rejectedUrl;
      }
    });

    if (alternatives.length > 0) {
      const best = alternatives[0];
      updateItemImage(itemId, best.url, best.source);
      storeItemImages(itemId, alternatives);
      return { newImage: best.url, newSource: best.source };
    }

    return { newImage: null, newSource: null };
  } catch (error) {
    console.error(`Re-search failed for item ${itemId}:`, error);
    return { newImage: null, newSource: null };
  }
}
