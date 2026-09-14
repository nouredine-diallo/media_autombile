import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 500, height: 750 } });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 300)); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  if (page.url().includes('select-name')) {
    await page.locator('button').first().click();
    await page.waitForTimeout(800);
  }

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/assistant-01-launcher.png' });

  await page.click('.lma-launcher');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/assistant-02-open.png' });

  // Clique un starter chip
  const chip = page.locator('.lma-chip').first();
  const chipLabel = await chip.textContent();
  console.log('Premier chip starter (doit être un titre lisible, pas un id) :', chipLabel);
  await chip.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/assistant-03-starter-reply.png' });

  // Vérifie les chips "en lien" dans la réponse
  const relatedChips = await page.locator('.lma-card .lma-related .lma-chip').allTextContents();
  console.log('Chips "en lien" (doivent être des titres) :', relatedChips);

  // Pose une vraie question avec faute de frappe
  await page.fill('.lma-input', 'comment publir un article');
  await page.click('.lma-send');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'scripts/e2e-test/output-visuels/assistant-04-typo-question.png' });
  const cardTitle = await page.locator('.lma-card-title').last().textContent();
  console.log('Réponse à la question avec faute de frappe :', cardTitle);

  await browser.close();
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
