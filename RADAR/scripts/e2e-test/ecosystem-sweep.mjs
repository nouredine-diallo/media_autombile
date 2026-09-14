import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const pages = ['/', '/events', '/ready', '/corrections', '/stats', '/partenaires', '/calendrier'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const consoleErrors = [];
  const httpErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) httpErrors.push(`${r.status()} ${r.url()}`); });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click();
    await page.waitForTimeout(800);
  }

  for (const path of pages) {
    consoleErrors.length = 0;
    httpErrors.length = 0;
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log(path, 'NAV ERROR', e.message));
    await page.waitForTimeout(500);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const isBlank = bodyText.trim().length < 20;
    console.log(`\n=== ${path} ===`);
    console.log('  final url:', page.url());
    console.log('  blank page:', isBlank);
    console.log('  console errors:', consoleErrors.length ? consoleErrors : 'none');
    console.log('  http errors:', httpErrors.length ? httpErrors : 'none');
    await page.screenshot({ path: `scripts/e2e-test/output-visuels/sweep-${path.replace(/\//g, '_') || 'home'}.png`, fullPage: true }).catch(() => {});
  }

  await browser.close();
}
main();
