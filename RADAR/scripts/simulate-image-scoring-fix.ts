/**
 * Simulation, en lecture seule, du nouveau scoring d'image proposé
 * (correction de la résolution factice og:image + pénalité de position dans
 * le document) contre l'ancien, sur des URLs réelles — pas de modification
 * de code de production, pas d'écriture en base. Analyse du 14 sept. 2026.
 */
import { chromium } from 'playwright';

const MIN_IMAGE_WIDTH = 400;
const MIN_IMAGE_HEIGHT = 300;

interface RawImage {
  url: string;
  width: number;
  height: number;
  source: string;
  alt: string;
  domIndex: number; // position dans l'ordre du document (tous <img>, toutes sources confondues)
  totalImgs: number;
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
        // Cherche si cette même image existe aussi comme <img> réel dans la page,
        // pour hériter sa vraie résolution au lieu d'un chiffre inventé.
        const match = allImgTags.find(el => (el.src || '').split('?')[0] === ogUrl.split('?')[0]);
        results.push({
          url: ogUrl,
          width: match ? (match.naturalWidth || match.width || 0) : 0,
          height: match ? (match.naturalHeight || match.height || 0) : 0,
          source: 'og:image',
          alt: match ? (match.alt || '') : '',
          domIndex: match ? allImgTags.indexOf(match) : -1,
          totalImgs,
        });
      }

      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      if (twitterImage && twitterImage.getAttribute('content')) {
        const twUrl = twitterImage.getAttribute('content');
        const match = allImgTags.find(el => (el.src || '').split('?')[0] === twUrl.split('?')[0]);
        results.push({
          url: twUrl,
          width: match ? (match.naturalWidth || match.width || 0) : 0,
          height: match ? (match.naturalHeight || match.height || 0) : 0,
          source: 'twitter:image',
          alt: match ? (match.alt || '') : '',
          domIndex: match ? allImgTags.indexOf(match) : -1,
          totalImgs,
        });
      }

      const selectors = [
        'article img', '.article-image img', '.featured-image img', '.hero-image img',
        '.post-image img', '.entry-content img', 'figure img', '.press-release img',
        '.gallery img', 'main img',
      ];
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
          results.push({
            url: src, width: w, height: h, source: 'page', alt: img.alt || '',
            domIndex: allImgTags.indexOf(img), totalImgs,
          });
        }
      }
      return results;
    })()
  `) as Promise<RawImage[]>;
}

function scoreOld(img: RawImage, articleTitle: string): number {
  let score = 0;
  // Reproduit fidèlement le bug : og:image/twitter:image ignorent la vraie
  // résolution captée ci-dessus et utilisent les anciennes constantes figées.
  const w = img.source === 'og:image' ? 1200 : img.source === 'twitter:image' ? 800 : img.width;
  const h = img.source === 'og:image' ? 630 : img.source === 'twitter:image' ? 418 : img.height;
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

function scoreNew(img: RawImage, articleTitle: string): number {
  let score = 0;
  // Correctif 1 : vraie résolution pour og:image/twitter:image (héritée du
  // <img> réel si trouvé, sinon 0 — pas de faux plancher inventé).
  const pixels = img.width * img.height;
  if (pixels >= 1920 * 1080) score += 40;
  else if (pixels >= 1200 * 800) score += 30;
  else if (pixels >= MIN_IMAGE_WIDTH * MIN_IMAGE_HEIGHT) score += 20;

  if (img.width > 0 && img.height > 0) {
    const ratio = img.width / img.height;
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

  // Correctif 2 : pénalité de position — plus une image "page" apparaît tard
  // dans le document (proportion de <img> qui la précèdent), plus elle a de
  // chances d'être un bloc "rivaux"/"articles liés" plutôt que le sujet.
  // Pas appliqué à og:image/twitter:image (toujours déclaré par l'éditeur,
  // jamais une question de position). TODO: seuils provisoires (CLAUDE.md
  // §4.3) — calibrés sur les cas mesurés cette session, à recalibrer sur un
  // échantillon plus large si de nouveaux cas contredisent cette courbe.
  if (img.source === 'page' && img.domIndex >= 0 && img.totalImgs > 0) {
    const positionRatio = img.domIndex / img.totalImgs;
    if (positionRatio >= 0.6) score -= 25;
    else if (positionRatio >= 0.4) score -= 10;
  }
  return score;
}

async function analyzeUrl(browser: import('playwright').Browser, url: string, title: string) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(300); }
    await page.evaluate('window.scrollTo(0, 0)');
    const raw = await extractRaw(page);
    const filtered = raw.filter(img => img.width >= MIN_IMAGE_WIDTH || img.height >= MIN_IMAGE_HEIGHT || img.source === 'og:image' || img.source === 'twitter:image');

    const oldRanked = filtered.map(img => ({ img, score: scoreOld(img, title) })).sort((a, b) => b.score - a.score);
    const newRanked = filtered.map(img => ({ img, score: scoreNew(img, title) })).sort((a, b) => b.score - a.score);

    const oldWinner = oldRanked[0];
    const newWinner = newRanked[0];
    const changed = oldWinner?.img.url !== newWinner?.img.url;

    console.log('='.repeat(100));
    console.log('URL:', url);
    console.log('Titre:', title);
    console.log('Candidats trouvés:', filtered.length);
    console.log('ANCIEN choix :', oldWinner ? `[${oldWinner.score}] ${oldWinner.img.source} ${oldWinner.img.url.slice(0, 90)}` : 'aucun');
    console.log('NOUVEAU choix:', newWinner ? `[${newWinner.score}] ${newWinner.img.source} ${newWinner.img.url.slice(0, 90)}` : 'aucun');
    console.log(changed ? '>>> CHANGEMENT DE CHOIX <<<' : 'identique (pas de régression)');
    return { url, title, changed, oldWinner: oldWinner?.img.url, newWinner: newWinner?.img.url, nCandidates: filtered.length };
  } catch (err) {
    console.log('ÉCHEC scraping', url, ':', err instanceof Error ? err.message : err);
    return { url, title, error: true };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch();

  const testCases: { url: string; title: string; note: string }[] = [
    // Le cas connu défectueux
    { url: 'https://carbuzz.com/a35-amg-used-bargain-september-2026/', title: 'A35 AMG: The Compact AMG Sedan You Can Buy For Less Than A New Toyota Camry', note: 'CAS CONNU DÉFECTUEUX (BMW à la place de la Mercedes)' },
    // Autres articles du même "franchise" CarBuzz — même risque de carrousel rivaux
    { url: 'https://carbuzz.com/bmw-m550i-v8-sedan-costs-less-than-new-toyota-camry/', title: "BMW's 456-HP Twin-Turbo V8 Sedan Now Costs Less Than A New Toyota Camry", note: 'même franchise CarBuzz, à vérifier' },
    { url: 'https://carbuzz.com/acura-ev-used-buy-2026/', title: 'The First Acura EV Costs Less Than A New Toyota Camry Right Now', note: 'même franchise CarBuzz, à vérifier' },
    // Diversité de sites/gabarits pour la non-régression
    { url: 'https://www.carscoops.com/2026/09/skoda-fabia-ev-successor/', title: 'Skoda CEO Hints At New Fabia, But It Could Be A Long Wait', note: 'Carscoops — site différent' },
    { url: 'https://www.hagerty.com/media/opinion/vellum-venom/vellum-venom-2026-audi-rs-e-tron-gt/', title: 'Vellum Venom: 2026 Audi RS e-tron GT', note: 'Hagerty — site différent' },
    { url: 'https://www.thedrive.com/news/someone-slapped-a-turbo-on-a-100-year-old-ford-model-t-engine-will-it-actually-work', title: 'Someone Slapped a Turbo on a 100-Year-Old Ford Model T Engine', note: 'The Drive — site différent' },
    { url: 'https://robbreport.com/motors/cars/rezvani-fortress-ford-pickup-truck-1238215343/', title: 'This Bonkers New Pickup Truck Is an Apocalypse-Ready Ford', note: 'Robb Report — site différent' },
    { url: 'https://www.largus.fr/actualite-automobile/renault-niagara-2026-le-nouveau-pick-up-pour-remplacer-loroch-en-amerique-du-sud-40006183.html', title: 'Renault Niagara (2026). Le nouveau pick-up', note: "L'Argus — site français, gabarit différent" },
  ];

  const results = [];
  for (const tc of testCases) {
    console.log('\n### ', tc.note);
    results.push(await analyzeUrl(browser, tc.url, tc.title));
  }

  console.log('\n\n========== RÉSUMÉ ==========');
  for (const r of results) {
    if ('error' in r && r.error) { console.log('ÉCHEC:', r.url); continue; }
    console.log((r.changed ? '[CHANGÉ]' : '[stable]'), r.nCandidates, 'candidats —', r.url);
  }

  await browser.close();
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
