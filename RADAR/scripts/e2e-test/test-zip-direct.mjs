import { chromium } from 'playwright';
import fs from 'fs';

const STUDIO_URL = 'http://localhost:3002';
const OUT_DIR = '/home/land/media_autombile/RADAR/scripts/e2e-test/output-visuels';
const DOWNLOAD_DIR = `${OUT_DIR}/downloads`;
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });

  await page.goto(`${STUDIO_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="password"]', 'work');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  // Appel direct de /api/export avec des slides fabriquées manuellement (sans LLM)
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slides: [
          { gabaritId: '1a', fieldValues: { title: 'Renault 5 E-Tech : le retour du mythe électrique' } },
          { gabaritId: '1b', fieldValues: { title: 'Détails', paragraph: 'Douze sources confirment que la version définitive arrive en concession dès mars 2027, avec un tarif encore non communiqué par la marque.' } },
          { gabaritId: 'cta', fieldValues: { message: 'Retrouvez tous les détails sur Le Média Automobile.' } },
        ],
        fieldValues: { caption: 'Renault 5 E-Tech : le retour du mythe électrique' },
      }),
    });
    return { status: res.status, body: await res.json() };
  });
  console.log('POST /api/export ->', JSON.stringify(result));

  if (!result.body.jobId) {
    console.log('ERREUR: pas de jobId retourné');
    await browser.close();
    return;
  }
  const jobId = result.body.jobId;

  // Poll du job jusqu'à "done" ou "error"
  let status = null;
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(async (id) => {
      const r = await fetch(`/api/export/${id}`);
      return r.json();
    }, jobId);
    status = s.status;
    console.log(`  poll ${i}: status=${status}, driveUrl=${s.driveUrl ?? 'aucun'}`);
    if (status === 'done' || status === 'error') break;
    await page.waitForTimeout(2000);
  }

  if (status !== 'done') {
    console.log('ERREUR: le job ne s\'est jamais terminé avec succès, status final:', status);
    await browser.close();
    return;
  }

  // Télécharger le ZIP via la nouvelle route — requête HTTP directe authentifiée
  // (mêmes cookies que la page), plus fiable qu'un vrai navigateur pour ce test.
  console.log('Téléchargement du ZIP via /api/export/' + jobId + '/download-zip ...');
  const resp = await page.request.get(`${STUDIO_URL}/api/export/${jobId}/download-zip`);
  console.log('  status:', resp.status(), '| content-type:', resp.headers()['content-type']);
  const buffer = await resp.body();
  const path = `${DOWNLOAD_DIR}/test-carousel-${jobId.slice(0, 8)}.zip`;
  fs.writeFileSync(path, buffer);
  console.log('ZIP TÉLÉCHARGÉ:', path, `(${buffer.length} octets)`);

  await browser.close();
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
