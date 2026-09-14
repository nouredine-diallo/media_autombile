import { newSession, shot, dumpButtons, loginRadar } from './e2e-utils.mjs';

const RADAR_URL = 'http://localhost:3000';
const EVENT_PATH = process.argv[2] || '/events/1919';
const LABEL = process.argv[3] || 'run1';

async function main() {
  const { browser, page } = await newSession();
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  await loginRadar(page, RADAR_URL, 'work', 'Test');
  console.log(`[${LABEL}] connecté, URL:`, page.url());

  await page.goto(`${RADAR_URL}${EVENT_PATH}`, { waitUntil: 'networkidle' });
  await shot(page, `${LABEL}-01-event`);

  const title = await page.locator('h1').first().textContent();
  console.log(`[${LABEL}] event ouvert:`, title);

  // 1. Générer l'article
  await page.click('button:has-text("Générer")');
  console.log(`[${LABEL}] génération lancée, attente...`);
  await page.waitForSelector('button:has-text("Valider")', { timeout: 90000 });
  await shot(page, `${LABEL}-02-generated`);
  console.log(`[${LABEL}] article généré`);

  // 2. Confirmer tous les faits si le bouton existe
  const confirmAllBtn = page.locator('button:has-text("Tout confirmer")');
  if (await confirmAllBtn.count() > 0) {
    await confirmAllBtn.click();
    console.log(`[${LABEL}] tous les faits confirmés`);
  }
  await shot(page, `${LABEL}-03-confirmed`);

  // 3. Valider l'article
  const validerBtn = page.locator('button:has-text("Valider")').first();
  await validerBtn.waitFor({ state: 'visible' });
  const isDisabled = await validerBtn.isDisabled();
  console.log(`[${LABEL}] bouton Valider disabled?`, isDisabled);
  if (!isDisabled) {
    await validerBtn.click();
    await page.waitForTimeout(1500);
  }
  await shot(page, `${LABEL}-04-validated`);

  // 4. Récupérer les liens STUDIO générés
  const slideLink = await page.locator('a:has-text("Slide unique")').getAttribute('href').catch(() => null);
  const carouselLink = await page.locator('a:has-text("Carrousel")').getAttribute('href').catch(() => null);
  console.log(`[${LABEL}] lien slide unique:`, slideLink);
  console.log(`[${LABEL}] lien carrousel:`, carouselLink);

  await browser.close();
  return { slideLink, carouselLink, title };
}

main().then(r => {
  console.log('RESULT_JSON:' + JSON.stringify(r));
}).catch(e => {
  console.error('ERREUR:', e.message);
  process.exit(1);
});
