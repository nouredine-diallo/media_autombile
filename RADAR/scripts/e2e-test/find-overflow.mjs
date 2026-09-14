import { chromium, devices } from 'playwright';
const iphone = devices['iPhone 13'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...iphone });
const page = await context.newPage();
await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);
await page.goto('http://localhost:3002/titres', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('body *').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.right > vw + 2 || rect.left < -2) {
      offenders.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 120),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      });
    }
  });
  return { vw, offenders: offenders.slice(0, 15) };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
