import { chromium } from 'playwright';
import { buildPrefillUrl } from './build-prefill.mjs';

const STUDIO_URL = process.env.STUDIO_TEST_URL || 'http://localhost:3003';
const REAL_IMAGE = 'https://media.media-web-prod.hagerty.com/media/wp-content/uploads/2026/08/7_Ford_Hypercar_Test_PaulRicard26_081716511103818MS.jpg';

async function main() {
  const url = buildPrefillUrl(STUDIO_URL, '/titres', {
    title: 'Vérification fix CORS',
    source: 'Hagerty',
    imageUrl: REAL_IMAGE,
    contentId: 'LMA-TEST-CORS-FIX',
    briefHeadline: 'Test de vérification.',
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto(`${STUDIO_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels/verify-cors-fix.png', fullPage: true });

  const bodyText = await page.locator('body').innerText();
  const hasError = bodyText.includes('Impossible de télécharger');
  const hasImage = await page.locator('img[src*="/api/images/"]').count();
  console.log('Message erreur CORS présent ?', hasError);
  console.log('Nombre d\'images chargées via /api/images/ :', hasImage);
  console.log('Badge "Issue" présent ?', bodyText.includes('Issue'));

  await browser.close();
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
