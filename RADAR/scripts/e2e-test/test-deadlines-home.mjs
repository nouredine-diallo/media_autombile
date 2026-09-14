import { chromium } from 'playwright';
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  if (page.url().includes('select-name')) { await page.locator('button').first().click(); await page.waitForTimeout(800); }

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  console.log('--- accueil ---');
  console.log((await page.locator('body').innerText()).slice(0, 1500));
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/accueil.png', fullPage: true });

  await page.goto('http://localhost:3000/calendrier', { waitUntil: 'networkidle' });
  await page.click('text=Générer deadlines');
  await page.waitForTimeout(1500);
  console.log('--- after generer deadlines ---');
  console.log((await page.locator('body').innerText()).slice(0, 1200));
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/calendrier-deadlines.png', fullPage: true });

  await browser.close();
}
main();
