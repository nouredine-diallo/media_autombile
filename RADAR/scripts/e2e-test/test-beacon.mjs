import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
if (page.url().includes('select-name')) { await page.locator('button').first().click(); await page.waitForTimeout(800); }

for (const p of ['/', '/events', '/ready']) {
  await page.goto(`http://localhost:3000${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}
await browser.close();
