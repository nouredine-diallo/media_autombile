import { chromium } from 'playwright';
import { buildPrefillUrl } from './build-prefill.mjs';
import fs from 'fs';

const STUDIO_URL = 'http://localhost:3002';
const SHOT_DIR = '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const LABEL = process.argv[2] || 'test1';
const TITLE = process.argv[3] || '1968 Ford Mustang GT restaurée : douze sources confirment son retour aux enchères';
const IMAGE = process.argv[4] || 'https://media.media-web-prod.hagerty.com/media/wp-content/uploads/2026/08/7_Ford_Hypercar_Test_PaulRicard26_081716511103818MS.jpg';
const CONTENT_ID = process.argv[5] || `LMA-TEST-${Date.now()}`;
const BRIEF = process.argv[6] || 'La Ford Mustang GT 1968, modèle emblématique du muscle car américain, revient sur le devant de la scène après une restauration complète documentée par 12 sources spécialisées.';

async function main() {
  const url = buildPrefillUrl(STUDIO_URL, '/titres', {
    title: TITLE,
    source: 'Hagerty',
    imageUrl: IMAGE,
    contentId: CONTENT_ID,
    briefHeadline: BRIEF,
  });
  console.log(`[${LABEL}] URL construite:`, url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[HTTP', r.status(), ']', r.url()); });

  // Login STUDIO (mot de passe partagé)
  await page.goto(`${STUDIO_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[name="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  console.log(`[${LABEL}] login STUDIO OK, URL:`, page.url());

  // Naviguer vers le lien prefill
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.screenshot({ path: `${SHOT_DIR}/${LABEL}-01-arrivee.png`, fullPage: true });
  console.log(`[${LABEL}] arrivée sur /titres avec prefill`);

  // Attendre que le préremplissage + auto-génération se termine (max 45s)
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT_DIR}/${LABEL}-02-apres-3s.png`, fullPage: true });

  try {
    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return !body.includes('Chargement') && (document.querySelectorAll('[class*="titre"], button').length > 0);
    }, { timeout: 40000 });
  } catch {}
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/${LABEL}-03-final.png`, fullPage: true });

  // Extraire l'état du thème / titres / paragraphes affichés
  const themeValue = await page.locator('input[placeholder*="sujet de votre actualité"]').inputValue().catch((e) => 'ERREUR: ' + e.message);
  const bodyText = await page.locator('body').innerText();
  console.log(`[${LABEL}] champ thème:`, themeValue);

  // Contourner l'échec CORS : upload manuel d'une image locale + passage au gabarit 1B (paragraphe)
  const LOCAL_IMAGE = process.argv[7];
  if (LOCAL_IMAGE) {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(LOCAL_IMAGE);
    await page.waitForTimeout(4000);
    await page.click('button:has-text("1B — Image + paragraphe")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOT_DIR}/${LABEL}-04-gabarit1B.png`, fullPage: true });
    const bodyText2 = await page.locator('body').innerText();
    console.log(`[${LABEL}] --- texte page après upload + gabarit 1B ---`);
    console.log(bodyText2.slice(0, 3000));
  }
  console.log(`[${LABEL}] --- texte complet de la page (pour vérif manuelle) ---`);
  console.log(bodyText.slice(0, 3000));

  await browser.close();
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
