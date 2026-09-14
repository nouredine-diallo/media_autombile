import { chromium } from 'playwright';
import { buildPrefillUrl } from './build-prefill.mjs';
import fs from 'fs';

const OUT_DIR = '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels';
const DOWNLOAD_DIR = `${OUT_DIR}/downloads`;
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const STUDIO_URL = 'http://localhost:3002';
const CONTENT_ID = process.argv[2];
const TITLE = process.argv[3];
const SOURCE = process.argv[4] || 'Hagerty';
const IMAGE = process.argv[5];
const BRIEF = process.argv[6];

async function main() {
  const url = buildPrefillUrl(STUDIO_URL, '/titres/carrousel', {
    title: TITLE, source: SOURCE, imageUrl: IMAGE, contentId: CONTENT_ID, briefHeadline: BRIEF,
  });
  console.log('URL:', url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto(`${STUDIO_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  console.log('[1/3] Chargement du package carrousel (peut prendre plusieurs minutes)...');
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  let finalState = null;
  for (let i = 0; i < 200; i++) {
    const text = await page.locator('body').innerText();
    if (text.includes('Exporter ce carrousel')) { finalState = 'ready'; break; }
    if (text.includes('Lien invalide') || text.includes('Aucune image trouvée') || text.includes('Aucune image n\'a pu') || text.includes('injoignable') || text.includes('Erreur RADAR')) {
      finalState = 'error';
      console.log('  ERREUR:', text.slice(0, 400));
      break;
    }
    await page.waitForTimeout(3000);
  }
  console.log(`  état: ${finalState} après ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await page.screenshot({ path: `${OUT_DIR}/resume-01-carousel-state.png`, fullPage: true });

  if (finalState !== 'ready') {
    console.log('ARRET.');
    await browser.close();
    return;
  }

  console.log('[2/3] Export du carrousel...');
  await page.click('button:has-text("Exporter ce carrousel")');

  let exportState = null;
  for (let i = 0; i < 60; i++) {
    const text = await page.locator('body').innerText();
    if (text.includes('Ouvrir le dossier Drive') || text.includes('Télécharger le dossier')) { exportState = 'done'; break; }
    if (text.includes('Échec de l\'export')) { exportState = 'error'; break; }
    await page.waitForTimeout(2000);
  }
  console.log('  état export:', exportState);
  await page.screenshot({ path: `${OUT_DIR}/resume-02-export.png`, fullPage: true });

  if (exportState === 'done') {
    const zipBtn = page.locator('a:has-text("Télécharger le dossier")');
    if (await zipBtn.count() > 0) {
      console.log('[3/3] Téléchargement du dossier ZIP...');
      const zipHref = await zipBtn.getAttribute('href');
      const resp = await page.request.get(`${STUDIO_URL}${zipHref}`);
      console.log('  status:', resp.status(), '| content-type:', resp.headers()['content-type']);
      const buffer = await resp.body();
      const path = `${DOWNLOAD_DIR}/carousel-reel-${Date.now()}.zip`;
      fs.writeFileSync(path, buffer);
      console.log('  ZIP TÉLÉCHARGÉ:', path, `(${buffer.length} octets)`);
    } else {
      console.log('  Drive configuré — lien Drive affiché au lieu du ZIP local.');
    }
  }

  await browser.close();
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
