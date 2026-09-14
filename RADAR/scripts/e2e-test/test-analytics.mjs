import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });

await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
if (page.url().includes('select-name')) { await page.locator('button').first().click(); await page.waitForTimeout(800); }

// Naviguer sur quelques pages pour générer des page_view
for (const p of ['/', '/events', '/ready', '/corrections']) {
  await page.goto(`http://localhost:3000${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

await page.goto('http://localhost:3000/analytics', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
console.log((await page.locator('body').innerText()).slice(0, 1200));
console.log('console errors:', errors);
await page.screenshot({ path: 'scripts/e2e-test/output-visuels/analytics-page.png', fullPage: true });
await browser.close();
