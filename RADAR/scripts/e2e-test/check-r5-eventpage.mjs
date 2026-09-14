import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures = [];
  page.on('response', r => {
    if (r.status() === 401 && r.url().includes('/api/')) failures.push(r.url());
  });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForTimeout(1500);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  await page.goto('http://localhost:3000/events/2723', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('nav error', e.message));
  console.log('final url:', page.url());
  console.log('401s:', failures);
  await browser.close();
}
main();
