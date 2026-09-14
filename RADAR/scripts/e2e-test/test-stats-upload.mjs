import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click();
    await page.waitForTimeout(800);
  }

  await page.goto('http://localhost:3000/stats', { waitUntil: 'networkidle' });
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('/tmp/claude-1000/-home-land-media-autombile/4bd1e535-af39-49d4-93cc-4f46fe84475f/scratchpad/instagram-export-test.csv');
  await page.waitForTimeout(2000);

  const text = await page.locator('body').innerText();
  console.log('--- page text after upload ---');
  console.log(text.slice(0, 2000));

  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/stats-after-upload.png', fullPage: true });
  await browser.close();
}
main();
