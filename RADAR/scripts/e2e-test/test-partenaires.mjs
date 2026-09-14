import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
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
  await page.click('button:has-text("Ajouter")');
  await page.waitForTimeout(500);

  const inputs = await page.locator('form input[type="text"], form input:not([type])').all();
  console.log('text inputs found:', inputs.length);

  // Nom / Marque are likely first two text inputs
  await page.locator('form input').nth(0).fill('Renault Test Partner');
  await page.locator('form input').nth(1).fill('Renault');
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(1500);

  const text1 = await page.locator('body').innerText();
  console.log('--- after create ---');
  console.log(text1.slice(0, 800));

  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/partenaires-after-create.png', fullPage: true });

  // Click into partner detail
  await page.click('text=Renault Test Partner');
  await page.waitForTimeout(1000);
  const text2 = await page.locator('body').innerText();
  console.log('--- detail page ---');
  console.log(text2.slice(0, 1500));
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/partenaires-detail.png', fullPage: true });

  await browser.close();
}
main();
