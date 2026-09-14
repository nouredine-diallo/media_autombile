import { chromium, devices } from 'playwright';

const iphone = devices['iPhone 13'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...iphone });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 150)); });

await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'scripts/e2e-test/output-visuels/mobile-studio-01-login.png' });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);

const pages = ['/', '/titres'];
for (const p of pages) {
  await page.goto(`http://localhost:3002${p}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
  const name = p.replace(/\//g, '_') || 'home';
  await page.screenshot({ path: `scripts/e2e-test/output-visuels/mobile-studio${name}.png`, fullPage: true });
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  console.log(p, '-> horizontal scroll:', hasHorizontalScroll);
}
console.log('console errors:', errors);
await browser.close();
