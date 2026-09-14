import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click();
    await page.waitForTimeout(800);
  }

  await page.goto('http://localhost:3000/partenaires', { waitUntil: 'networkidle' });
  await page.click('text=Renault Test Partner');
  await page.waitForTimeout(800);

  await page.click('text=Associer un article');
  await page.waitForTimeout(800);
  await page.click('text=+ Associer');
  await page.waitForTimeout(1000);
  console.log('--- after associate ---');
  console.log((await page.locator('body').innerText()).slice(0, 800));

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(e => { console.log('no download event:', e.message); return null; }),
    page.click('button:has-text("PDF")'),
  ]);
  if (download) {
    const path = await download.path();
    const fs = await import('fs');
    const stat = fs.statSync(path);
    console.log('PDF downloaded, size:', stat.size, 'bytes');
    fs.copyFileSync(path, '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels/rapport-test.pdf');
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/partenaires-after-pdf.png', fullPage: true });

  await browser.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
