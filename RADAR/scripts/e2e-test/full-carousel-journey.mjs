import { newSession, shot, loginRadar } from './e2e-utils.mjs';
import fs from 'fs';

const RADAR_URL = 'http://localhost:3000';
const EVENT_PATH = process.argv[2] || '/events/1919';
const OUT_DIR = '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels';
const DOWNLOAD_DIR = `${OUT_DIR}/downloads`;
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

async function main() {
  const { browser, context, page } = await newSession();
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[RADAR HTTP', r.status(), ']', r.url()); });

  await loginRadar(page, RADAR_URL, 'work', 'Test');
  await page.goto(`${RADAR_URL}${EVENT_PATH}`, { waitUntil: 'networkidle' });
  await shot(page, 'full-01-event');

  console.log('[1/6] Génération de l\'article (Ollama local, generateChained = 2 passes LLM, jusqu\'à 15 min)...');
  const t0 = Date.now();
  await page.click('button:has-text("Générer")');
  await page.waitForSelector('button:has-text("Valider")', { timeout: 900000 });
  console.log(`  généré en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await shot(page, 'full-02-generated');

  const confirmAllBtn = page.locator('button:has-text("Tout confirmer")');
  if (await confirmAllBtn.count() > 0) {
    await confirmAllBtn.click();
    console.log('  faits confirmés');
  }

  console.log('[2/6] Validation de l\'article...');
  const validerBtn = page.locator('button:has-text("Valider")').first();
  const isDisabled = await validerBtn.isDisabled();
  if (isDisabled) {
    console.log('  Valider est désactivé — tentative "Valider sans vérifier"');
    const overrideBtn = page.locator('button:has-text("Valider sans vérifier")');
    if (await overrideBtn.count() > 0) {
      await overrideBtn.click();
      await page.waitForTimeout(500);
      await page.click('button:has-text("Confirmer")');
    }
  } else {
    await validerBtn.click();
  }
  await page.waitForTimeout(2000);
  await shot(page, 'full-03-validated');

  console.log('[3/6] Clic sur "Carrousel →" (nouvel onglet)...');
  const [studioPage] = await Promise.all([
    context.waitForEvent('page'),
    page.click('a:has-text("Carrousel")'),
  ]);
  await studioPage.waitForLoadState('domcontentloaded');
  console.log('  URL STUDIO ouverte:', studioPage.url());

  // Login STUDIO si nécessaire
  if (studioPage.url().includes('/login')) {
    await studioPage.fill('input[name="password"]', 'work');
    await studioPage.click('button[type="submit"]');
    await studioPage.waitForTimeout(1500);
  }

  console.log('[4/6] Attente du chargement du package carrousel + import images...');
  await studioPage.waitForTimeout(3000);
  await studioPage.screenshot({ path: `${OUT_DIR}/full-04-carousel-loading.png`, fullPage: true });

  // Attendre l'état "ready" ou une erreur explicite (Ollama local, plus lent
  // pour generateCarouselParagraphs côté RADAR — jusqu'à ~5 min)
  let finalState = null;
  for (let i = 0; i < 100; i++) {
    const text = await studioPage.locator('body').innerText();
    if (text.includes('Exporter ce carrousel')) { finalState = 'ready'; break; }
    if (text.includes('Lien invalide') || text.includes('Aucune image trouvée') || text.includes('Aucune image n\'a pu')) {
      finalState = 'error';
      console.log('  ERREUR:', text.slice(0, 300));
      break;
    }
    await studioPage.waitForTimeout(3000);
  }
  console.log('  état final chargement carrousel:', finalState);
  await studioPage.screenshot({ path: `${OUT_DIR}/full-05-carousel-ready.png`, fullPage: true });

  if (finalState !== 'ready') {
    console.log('ARRET — le carrousel ne peut pas être exporté depuis cet état.');
    await browser.close();
    return;
  }

  console.log('[5/6] Export du carrousel...');
  await studioPage.click('button:has-text("Exporter ce carrousel")');

  let exportState = null;
  for (let i = 0; i < 30; i++) {
    const text = await studioPage.locator('body').innerText();
    if (text.includes('Ouvrir le dossier Drive') || text.includes('Télécharger le dossier')) { exportState = 'done'; break; }
    if (text.includes('Échec de l\'export')) { exportState = 'error'; break; }
    await studioPage.waitForTimeout(2000);
  }
  console.log('  état export:', exportState);
  await studioPage.screenshot({ path: `${OUT_DIR}/full-06-export-done.png`, fullPage: true });

  if (exportState === 'done') {
    const zipBtn = studioPage.locator('a:has-text("Télécharger le dossier")');
    if (await zipBtn.count() > 0) {
      console.log('[6/6] Téléchargement du dossier ZIP...');
      const downloadPromise = studioPage.waitForEvent('download', { timeout: 20000 });
      await zipBtn.click();
      const download = await downloadPromise;
      const path = `${DOWNLOAD_DIR}/${download.suggestedFilename()}`;
      await download.saveAs(path);
      console.log('  FICHIER ZIP TÉLÉCHARGÉ:', path);
    } else {
      console.log('  Drive configuré — lien Drive affiché au lieu du ZIP local.');
    }
  }

  await browser.close();
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
