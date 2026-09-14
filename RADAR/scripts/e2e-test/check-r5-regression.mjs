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
  // pick first name button/select if present
  const nameBtn = page.locator('button, [role="option"]').first();
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForTimeout(1500);

  // If redirected to /select-name, pick a name
  if (page.url().includes('select-name')) {
    const firstOption = page.locator('button').first();
    await firstOption.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  console.log('URL after login:', page.url());

  for (const path of ['/', '/events', '/corrections', '/partenaires', '/calendrier']) {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('nav error', path, e.message));
    console.log(path, '->', page.url());
  }

  console.log('401 API failures while logged in:', failures);
  await browser.close();
}
main();
