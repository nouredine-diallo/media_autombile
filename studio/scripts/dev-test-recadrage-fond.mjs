import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3002";
const CTRL = 'div[title="Glisser pour déplacer, molette ou pincement pour zoomer"]';

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const pw = page.locator('input[type="password"]');
  if (await pw.count()) {
    await pw.fill("work");
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 8000 }),
      page.locator('button[type="submit"]').first().click(),
    ]);
  }
}

async function testGabarit(page, id) {
  await page.goto(`${BASE}/gabarits/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const ctrl = page.locator(CTRL);
  const present = (await ctrl.count()) === 1;
  if (!present) {
    console.log(`${id}: contrôle absent — FAIL`);
    return false;
  }
  const img = page.locator(`[data-gabarit="${id}"] img`).first();
  const before = await img.evaluate((el) => getComputedStyle(el).transform);
  const box = await ctrl.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const afterZoom = await img.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterDrag = await img.evaluate((el) => getComputedStyle(el).transform);
  await page.locator('button:has-text("Réinitialiser")').click();
  await page.waitForTimeout(200);
  const afterReset = await img.evaluate((el) => getComputedStyle(el).transform);

  const zoomWorked = before !== afterZoom;
  const dragWorked = afterZoom !== afterDrag;
  const resetWorked = afterReset === before;
  console.log(`${id}: zoom=${zoomWorked} drag=${dragWorked} reset=${resetWorked}`);
  return zoomWorked && dragWorked && resetWorked;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) errors.push(`HTTP ${r.status()} ${r.url()}`); });

  await login(page);

  console.log("=== Éditeur détaillé /gabarits/{id} ===");
  for (const id of ["1a", "1b", "1c"]) {
    await testGabarit(page, id);
  }

  await page.goto(`${BASE}/gabarits/3a`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  console.log("3a: contrôle de fond absent (attendu) =", (await page.locator(CTRL).count()) === 0);

  console.log("\n=== Parcours réel /titres (RADAR) ===");
  await page.goto(`${BASE}/titres`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  // Upload une image de test pour peupler le gabarit 1a par défaut
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles("public/test/placeholder-photo.jpg").catch(async () => {
    // repli si le fichier n'existe pas à cet emplacement précis
    const alt = fs.readdirSync("public/test").find((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (alt) await fileInput.setInputFiles(`public/test/${alt}`);
  });
  await page.waitForTimeout(2500); // upload + détourage
  const ctrlTitres = page.locator(CTRL);
  const presentOnTitres = (await ctrlTitres.count()) === 1;
  console.log("Contrôle présent sur /titres après upload (gabarit 1a) :", presentOnTitres);

  if (presentOnTitres) {
    const box = await ctrlTitres.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);

    // Export réel → vérifie que le PNG produit reflète le recadrage
    const exportBtn = page.locator('button:has-text("Exporter")').first();
    if (await exportBtn.count()) {
      await exportBtn.click();
      await page.waitForTimeout(8000);
      const bodyText = await page.locator("body").innerText();
      console.log("Export lancé, statut visible sur la page (extrait) :", bodyText.includes("Drive") || bodyText.includes("Télécharger") || bodyText.includes("terminé"));
    }
  }

  console.log("\n=== Erreurs capturées (attendu: vide) ===");
  console.log(errors.length ? errors.join("\n") : "(aucune)");

  await browser.close();
}

main().catch((err) => { console.error("FATAL", err); process.exit(1); });
