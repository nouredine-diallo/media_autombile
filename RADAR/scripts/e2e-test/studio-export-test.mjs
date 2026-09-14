import { chromium } from 'playwright';
import { buildPrefillUrl } from './build-prefill.mjs';
import fs from 'fs';

const STUDIO_URL = process.env.STUDIO_TEST_URL || 'http://localhost:3002';
const SHOT_DIR = '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels';
const DOWNLOAD_DIR = '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels/downloads';
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const LABEL = process.argv[2];
const TITLE = process.argv[3];
const CONTENT_ID = process.argv[4];
const BRIEF = process.argv[5];
const LOCAL_IMAGE = process.argv[6];

async function main() {
  const url = buildPrefillUrl(STUDIO_URL, '/titres', {
    title: TITLE, source: 'Hagerty', imageUrl: 'https://x.jpg', contentId: CONTENT_ID, briefHeadline: BRIEF,
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto(`${STUDIO_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  await page.locator('input[type="file"]').setInputFiles(LOCAL_IMAGE);
  await page.waitForTimeout(4000);
  await page.click('button:has-text("1B — Image + paragraphe")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/${LABEL}-pre-export.png`, fullPage: true });

  console.log(`[${LABEL}] clic sur Exporter ce post...`);
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.click('button:has-text("Exporter ce post")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT_DIR}/${LABEL}-post-export-click.png`, fullPage: true });

  const bodyText = await page.locator('body').innerText();
  console.log(`[${LABEL}] état après clic export:`);
  console.log(bodyText.slice(-1500));

  // Attendre que l'export se termine (polling job) jusqu'à 60s
  let exported = false;
  for (let i = 0; i < 20; i++) {
    const text = await page.locator('body').innerText();
    if (text.includes('Télécharger') || text.includes('terminé') || text.includes('Drive')) {
      exported = true;
      break;
    }
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: `${SHOT_DIR}/${LABEL}-export-final.png`, fullPage: true });
  console.log(`[${LABEL}] export terminé (signal détecté)?`, exported);
  const finalText = await page.locator('body').innerText();
  console.log(finalText.slice(-1500));

  const downloadBtn = page.locator('button:has-text("Télécharger le PNG"), a:has-text("Télécharger le PNG")');
  if (await downloadBtn.count() > 0) {
    const dl2Promise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await downloadBtn.click();
    const dl2 = await dl2Promise;
    if (dl2) {
      const path2 = `${DOWNLOAD_DIR}/${LABEL}-${dl2.suggestedFilename()}`;
      await dl2.saveAs(path2);
      console.log(`[${LABEL}] FICHIER TÉLÉCHARGÉ (bouton PNG):`, path2);
    } else {
      console.log(`[${LABEL}] clic sur Télécharger le PNG fait mais aucun download event`);
    }
  }

  const download = await downloadPromise;
  if (download) {
    const path = `${DOWNLOAD_DIR}/${LABEL}-${download.suggestedFilename()}`;
    await download.saveAs(path);
    console.log(`[${LABEL}] FICHIER TÉLÉCHARGÉ:`, path);
  } else {
    console.log(`[${LABEL}] aucun download event capté par Playwright`);
  }

  await browser.close();
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
