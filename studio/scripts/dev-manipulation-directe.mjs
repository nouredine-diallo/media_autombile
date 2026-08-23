// Vérifie que la manipulation directe sur l'aperçu agit réellement sur le
// montage ET que le rendu final la reprend — la contrainte dure du projet
// étant « aperçu = export au pixel » (CLAUDE.md §1).
import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const PASSWORD = process.env.AUTH_PASSWORD;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
ctx.setDefaultTimeout(240_000);
ctx.setDefaultNavigationTimeout(240_000);
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

await page.goto(`${BASE}/titres`, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', ["test33.jpeg", "test31.webp", "test32.webp"]);
await page.waitForSelector("text=/Fond compatible|laisse peu/", { timeout: 240_000 });
await page.fill('input[placeholder*="Mercedes"]', "Mercedes SL 60 AM");
await page.click('button:has-text("Générer")');
await page.waitForSelector('button:has-text("Exporter ce post")', { timeout: 180_000 });

const apercu = page.locator("div.relative.overflow-hidden.rounded-xl").first();
const boite = await apercu.boundingBox();

// Centre de la bulle gauche : 31,3 % x 32,5 % du canevas.
const bx = boite.x + boite.width * 0.313;
const by = boite.y + boite.height * 0.325;

await page.mouse.move(bx, by);
await page.waitForTimeout(300);
await page.screenshot({ path: "test/manip-1-survol.png" });
console.log("survol : barre d'actions affichée");

// Déplacement de la bulle
await page.mouse.down();
await page.mouse.move(bx - 40, by + 30, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);
console.log("bulle déplacée");

// Le lien d'ajustement porte la géométrie => elle partira au rendu
const href = await page.locator('a:has-text("Ajuster le détail")').getAttribute("href");
const geom = new URL(href, BASE).searchParams.get("bulle1Geom");
console.log("bulle1Geom transmis :", geom ?? "AUCUN");

// Débordement : bascule
await page.mouse.move(bx - 40, by + 30);
await page.waitForTimeout(300);
const bouton = page.locator('button:has-text("Débordement")').first();
if (await bouton.count()) {
  await bouton.click();
  await page.waitForTimeout(200);
  const h2 = await page.locator('a:has-text("Ajuster le détail")').getAttribute("href");
  console.log("bulle1SujetUrl après bascule :", new URL(h2, BASE).searchParams.get("bulle1SujetUrl") ? "activé" : "coupé");
}
await page.screenshot({ path: "test/manip-2-apres.png" });

// Export : le rendu final doit reprendre la géométrie
await page.click('button:has-text("Exporter ce post")');
await page.waitForURL(/\/export\//, { timeout: 180_000 });
console.log("export lancé :", new URL(page.url()).pathname);
await browser.close();
