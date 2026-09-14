import { chromium, devices } from 'playwright';
const iphone = devices['iPhone 13'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...iphone });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 150)); });
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
if (page.url().includes('select-name')) { await page.locator('button').first().click(); await page.waitForTimeout(800); }
await page.goto('http://localhost:3000/events/100000', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'scripts/e2e-test/output-visuels/mobile-event-detail.png', fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
console.log('horizontal scroll:', overflow, '| console errors:', errors);
await browser.close();
