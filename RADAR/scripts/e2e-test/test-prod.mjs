import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto('http://89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click();
    await page.waitForTimeout(800);
  }
  await page.goto('http://89.168.53.133.nip.io/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(500);
  console.log('URL finale RADAR:', page.url());
  console.log('Erreurs console:', errors);
  await page.screenshot({ path: '/tmp/claude-1000/-home-land-media-autombile/8ca52d3c-fe3b-482f-ba68-3a0dab088594/scratchpad/prod-radar-home.png', fullPage: true });

  await page.click('.lma-launcher');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/claude-1000/-home-land-media-autombile/8ca52d3c-fe3b-482f-ba68-3a0dab088594/scratchpad/prod-radar-assistant.png' });

  await page.goto('http://studio.89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  console.log('URL finale STUDIO:', page.url());
  await page.screenshot({ path: '/tmp/claude-1000/-home-land-media-autombile/8ca52d3c-fe3b-482f-ba68-3a0dab088594/scratchpad/prod-studio-home.png', fullPage: true });

  await browser.close();
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
