import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto('http://89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);
if (page.url().includes('select-name')) {
  await page.locator('button').first().click();
  await page.waitForTimeout(1000);
}

for (const p of ['/', '/events', '/ready', '/corrections', '/calendrier']) {
  await page.goto(`http://89.168.53.133.nip.io${p}`, { waitUntil: 'networkidle', timeout: 20000 });
  const text = await page.locator('body').innerText();
  const broken = text.includes("couldn't load") || text.includes('Reload to try again');
  console.log(p, '->', broken ? 'CASSÉ' : 'OK', '(', text.slice(0, 40).replace(/\n/g, ' '), ')');
}

await browser.close();
