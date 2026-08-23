import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) { console.error("AUTH_PASSWORD manquant"); process.exit(1); }

fs.mkdirSync("test/phase3", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
ctx.setDefaultTimeout(120_000);
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

console.log("Upload des images pour tester Gabarit 3A et 3B...");
await page.goto(`${BASE}/nouveau-post`, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', ["test33.jpeg", "test31.webp", "test32.webp"]);

// Attendre que l'aperçu soit rendu
await page.waitForSelector('[data-gabarit]', { timeout: 120_000 });

// Capture Gabarit 3A (défaut pour 3 images)
console.log("Capture du rendu par défaut (Gabarit 3A, centré, ratio 50/50)...");
const preview = await page.locator('[data-gabarit]').first();
await preview.screenshot({ path: "test/phase3/01-3A-defaut.png" });

// Basculer sur 3B
console.log("Bascule sur Gabarit 3B...");
await page.click('button:has-text("3B")');
await page.waitForTimeout(2000); // laisser le temps au re-render
await preview.screenshot({ path: "test/phase3/02-3B-defaut.png" });

// Tester le curseur Ratio Tailles
console.log("Modification du ratio (Asymétrie)...");
const rangeInput = await page.locator('input[type="range"]');
if (await rangeInput.count() > 0) {
  // Simuler le changement de ratio vers la gauche (ex: 70/30)
  await rangeInput.fill("0.7");
  await rangeInput.dispatchEvent('change');
  await page.waitForTimeout(2000);
  await preview.screenshot({ path: "test/phase3/03-3B-ratio-70-30.png" });
  
  // Ratio vers la droite (ex: 30/70)
  await rangeInput.fill("0.3");
  await rangeInput.dispatchEvent('change');
  await page.waitForTimeout(2000);
  await preview.screenshot({ path: "test/phase3/04-3B-ratio-30-70.png" });
}

await browser.close();
console.log("Test terminé. Captures dans test/phase3/");
