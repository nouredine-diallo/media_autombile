import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

page.on('requestfailed', (req) => {
  console.log('[REQUEST FAILED]', req.method(), req.url(), '->', req.failure()?.errorText);
});
page.on('requestfinished', async (req) => {
  const url = req.url();
  if (!url.includes('_next/static') && !url.includes('favicon')) {
    const resp = await req.response().catch(() => null);
    console.log('[OK]', req.method(), url, '->', resp?.status());
  }
});
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300));
});
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
page.on('crash', () => console.log('[PAGE CRASHED]'));

console.log('=== Navigation 1: /login ===');
try {
  await page.goto('http://89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('OK, url:', page.url());
} catch (e) {
  console.log('GOTO ERROR:', e.message);
}

console.log('=== Attente 3s ===');
await page.waitForTimeout(3000);

console.log('=== État final du body ===');
console.log((await page.locator('body').innerText().catch((e) => 'READ ERROR: ' + e.message)).slice(0, 300));

await browser.close();
