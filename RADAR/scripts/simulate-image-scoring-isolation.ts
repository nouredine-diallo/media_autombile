/**
 * Isole lequel des deux correctifs (résolution og:image réelle vs pénalité
 * de position) cause chaque changement observé — pour attribuer précisément
 * la cause avant de conclure, pas deviner. Lecture seule.
 */
import { chromium } from 'playwright';

const MIN_IMAGE_WIDTH = 400;
const MIN_IMAGE_HEIGHT = 300;

interface RawImage {
  url: string; width: number; height: number; source: string; alt: string;
  domIndex: number; totalImgs: number;
}

async function extractRaw(page: import('playwright').Page): Promise<RawImage[]> {
  return page.evaluate(`
    (() => {
      const results = [];
      const allImgTags = Array.from(document.querySelectorAll('img'));
      const totalImgs = allImgTags.length;
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.getAttribute('content')) {
        const ogUrl = ogImage.getAttribute('content');
        const match = allImgTags.find(el => (el.src || '').split('?')[0] === ogUrl.split('?')[0]);
        results.push({ url: ogUrl, width: match ? (match.naturalWidth || match.width || 0) : 0, height: match ? (match.naturalHeight || match.height || 0) : 0, source: 'og:image', alt: match ? (match.alt || '') : '', domIndex: match ? allImgTags.indexOf(match) : -1, totalImgs });
      }
      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      if (twitterImage && twitterImage.getAttribute('content')) {
        const twUrl = twitterImage.getAttribute('content');
        const match = allImgTags.find(el => (el.src || '').split('?')[0] === twUrl.split('?')[0]);
        results.push({ url: twUrl, width: match ? (match.naturalWidth || match.width || 0) : 0, height: match ? (match.naturalHeight || match.height || 0) : 0, source: 'twitter:image', alt: match ? (match.alt || '') : '', domIndex: match ? allImgTags.indexOf(match) : -1, totalImgs });
      }
      const selectors = ['article img', '.article-image img', '.featured-image img', '.hero-image img', '.post-image img', '.entry-content img', 'figure img', '.press-release img', '.gallery img', 'main img'];
      const seen = new Set();
      for (const selector of selectors) {
        const imgs = document.querySelectorAll(selector);
        for (const img of imgs) {
          const src = img.src || (img.dataset && img.dataset.src);
          if (!src || seen.has(src)) continue;
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (w < 200 && h < 200) continue;
          if (/logo|icon|avatar|sprite|pixel|tracking|1x1/i.test(src)) continue;
          seen.add(src);
          results.push({ url: src, width: w, height: h, source: 'page', alt: img.alt || '', domIndex: allImgTags.indexOf(img), totalImgs });
        }
      }
      return results;
    })()
  `) as Promise<RawImage[]>;
}

function baseScore(img: RawImage, articleTitle: string, w: number, h: number): number {
  let score = 0;
  const pixels = w * h;
  if (pixels >= 1920 * 1080) score += 40;
  else if (pixels >= 1200 * 800) score += 30;
  else if (pixels >= MIN_IMAGE_WIDTH * MIN_IMAGE_HEIGHT) score += 20;
  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio >= 0.75 && ratio <= 0.9) score += 20;
    else if (ratio >= 0.95 && ratio <= 1.05) score += 15;
    else if (ratio >= 1.5 && ratio <= 1.8) score += 10;
  }
  if (img.source === 'og:image') score += 15;
  else if (img.source === 'twitter:image') score += 12;
  else if (img.source === 'page') score += 8;
  if (/hero|featured|main|press/i.test(img.url)) score += 10;
  if (/\d{3,}x\d{3,}/i.test(img.url)) score += 5;
  const titleWords = articleTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const haystack = `${img.alt || ''} ${img.url}`.toLowerCase();
  let keywordHits = 0;
  for (const word of titleWords) if (haystack.includes(word)) keywordHits++;
  if (titleWords.length > 0) {
    const hitRatio = keywordHits / titleWords.length;
    if (hitRatio >= 0.4) score += 30;
    else if (hitRatio >= 0.2) score += 15;
  }
  if (/shutterstock|getty|istock|adobe|stock|watermark|placeholder|generic/i.test(img.url)) score -= 40;
  if (/default|no-image|missing|blank|empty/i.test(img.url)) score -= 30;
  if (/icon|logo|avatar|badge|button/i.test(img.url)) score -= 20;
  if (/thumb|small|mini|_s\.|_t\./i.test(img.url)) score -= 10;
  return score;
}

function scoreOld(img: RawImage, title: string): number {
  const w = img.source === 'og:image' ? 1200 : img.source === 'twitter:image' ? 800 : img.width;
  const h = img.source === 'og:image' ? 630 : img.source === 'twitter:image' ? 418 : img.height;
  return baseScore(img, title, w, h);
}
function scoreFix1Only(img: RawImage, title: string): number {
  // Vraie résolution og:image, PAS de pénalité de position.
  return baseScore(img, title, img.width, img.height);
}
function scoreFix2Only(img: RawImage, title: string): number {
  // Résolution factice (comme l'ancien), MAIS pénalité de position ajoutée.
  const w = img.source === 'og:image' ? 1200 : img.source === 'twitter:image' ? 800 : img.width;
  const h = img.source === 'og:image' ? 630 : img.source === 'twitter:image' ? 418 : img.height;
  let score = baseScore(img, title, w, h);
  if (img.source === 'page' && img.domIndex >= 0 && img.totalImgs > 0) {
    const positionRatio = img.domIndex / img.totalImgs;
    if (positionRatio >= 0.6) score -= 25;
    else if (positionRatio >= 0.4) score -= 10;
  }
  return score;
}

async function analyze(browser: import('playwright').Browser, url: string, title: string) {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(300); }
    await page.evaluate('window.scrollTo(0, 0)');
    const raw = await extractRaw(page);
    const filtered = raw.filter(img => img.width >= MIN_IMAGE_WIDTH || img.height >= MIN_IMAGE_HEIGHT || img.source === 'og:image' || img.source === 'twitter:image');

    function winner(fn: (i: RawImage, t: string) => number) {
      return filtered.map(img => ({ img, score: fn(img, title) })).sort((a, b) => b.score - a.score)[0];
    }
    const w0 = winner(scoreOld);
    const w1 = winner(scoreFix1Only);
    const w2 = winner(scoreFix2Only);

    console.log('='.repeat(100));
    console.log('URL:', url);
    console.log('ANCIEN            :', w0 ? `[${w0.score}] ${w0.img.source} idx=${w0.img.domIndex}/${w0.img.totalImgs} ${w0.img.url.slice(0, 75)}` : '-');
    console.log('Correctif 1 seul  :', w1 ? `[${w1.score}] ${w1.img.source} idx=${w1.img.domIndex}/${w1.img.totalImgs} ${w1.img.url.slice(0, 75)}` : '-');
    console.log('Correctif 2 seul  :', w2 ? `[${w2.score}] ${w2.img.source} idx=${w2.img.domIndex}/${w2.img.totalImgs} ${w2.img.url.slice(0, 75)}` : '-');
    console.log('Correctif1 change ?', w0?.img.url !== w1?.img.url, '| Correctif2 change ?', w0?.img.url !== w2?.img.url);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  await analyze(browser, 'https://www.largus.fr/actualite-automobile/renault-niagara-2026-le-nouveau-pick-up-pour-remplacer-loroch-en-amerique-du-sud-40006183.html', 'Renault Niagara (2026). Le nouveau pick-up');
  await analyze(browser, 'https://www.thedrive.com/news/someone-slapped-a-turbo-on-a-100-year-old-ford-model-t-engine-will-it-actually-work', 'Someone Slapped a Turbo on a 100-Year-Old Ford Model T Engine');
  await browser.close();
}
main().catch((err) => { console.error('FATAL', err); process.exit(1); });
