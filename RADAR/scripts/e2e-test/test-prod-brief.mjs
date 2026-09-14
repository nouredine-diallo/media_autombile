import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
if (page.url().includes('select-name')) {
  await page.locator('button').first().click();
  await page.waitForTimeout(800);
}

console.log('Génération du brief (peut prendre plusieurs minutes)...');
const resp = await page.request.post('http://89.168.53.133.nip.io/api/brief', {
  data: { event_id: 650 },
  timeout: 20 * 60 * 1000,
});
console.log('status:', resp.status());
const json = await resp.json();
console.log('headline:', json.brief?.headline);
console.log('lede:', json.brief?.lede);
console.log('body:', json.brief?.body?.slice(0, 600));

await browser.close();
