import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click();
    await page.waitForTimeout(800);
  }

  await page.goto('http://localhost:3000/ready', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Planifier")');
  await page.waitForTimeout(500);
  const tomorrow = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
  await page.fill('input[type="date"]', tomorrow);
  await page.click('button:has-text("OK")');
  await page.waitForTimeout(1500);
  console.log('--- after planifier ---');
  console.log((await page.locator('body').innerText()).slice(0, 500));
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/ready-after-planifier.png', fullPage: true });

  await page.goto('http://localhost:3000/calendrier', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  console.log('--- calendrier page text ---');
  console.log((await page.locator('body').innerText()).slice(0, 1500));
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/calendrier-after-planifier.png', fullPage: true });

  await browser.close();
}
main();
