import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 500, height: 750 } });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300)); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  console.log('post-login url:', page.url());

  await page.goto('http://localhost:3002/', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);

  const launcher = page.locator('.lma-launcher');
  if ((await launcher.count()) === 0) {
    console.log('Launcher absent sur "/", body:', (await page.locator('body').innerText()).slice(0, 200));
    await browser.close();
    return;
  }
  await page.screenshot({ path: 'scripts/output-visuels-assistant/assistant-01-launcher.png' });
  await launcher.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'scripts/output-visuels-assistant/assistant-02-open.png' });

  const chip = page.locator('.lma-chip').first();
  console.log('Premier chip:', await chip.textContent());
  await chip.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'scripts/output-visuels-assistant/assistant-03-reply.png' });
  const related = await page.locator('.lma-card .lma-related .lma-chip').allTextContents();
  console.log('Related chips:', related);

  await browser.close();
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
