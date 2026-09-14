import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click();
    await page.waitForTimeout(800);
  }
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  const launcher = page.locator('.lma-launcher');
  const antenna = page.locator('.lma-launcher .lma-antenna');

  const before = await antenna.evaluate((el) => getComputedStyle(el).transform);
  await launcher.hover();
  await page.waitForTimeout(300);
  const during = await antenna.evaluate((el) => getComputedStyle(el).transform);
  console.log('transform avant survol:', before);
  console.log('transform pendant survol:', during);
  console.log('changement détecté:', before !== during);

  await browser.close();
}
main();
