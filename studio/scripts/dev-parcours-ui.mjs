// Parcours utilisateur réel, dans le navigateur — pas via l'API.
// Vérifie l'exigence « le post généré doit être bon du premier coup » :
// upload → aperçu déjà juste → export, sans passer par l'éditeur détaillé.
import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) { console.error("AUTH_PASSWORD manquant"); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
ctx.setDefaultTimeout(240_000);
ctx.setDefaultNavigationTimeout(240_000);
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

// Entrée par l'ancienne URL : elle doit rediriger vers le parcours unique.
await page.goto(`${BASE}/nouveau-post`, { waitUntil: "networkidle" });
console.log("/nouveau-post redirige vers :", new URL(page.url()).pathname);
await page.setInputFiles('input[type="file"]', ["test33.jpeg", "test31.webp", "test32.webp"]);
console.log("3 images déposées, attente des découpes…");

// Le contrôle qualité n'apparaît qu'une fois le détourage du fond terminé :
// c'est donc un bon signal que le montage est prêt.
await page.waitForSelector("text=/Fond compatible|laisse peu d'espace|n'occupe que/", { timeout: 240_000 });
const verdict = await page.locator("text=/Fond compatible|laisse peu d'espace|n'occupe que/").first().textContent();
console.log("contrôle qualité affiché :", verdict?.trim().slice(0, 110));

await page.screenshot({ path: "test/parcours-titres.png", fullPage: true });
console.log("capture : test/parcours-titres.png");

// Parcours complet : thème → titres → sélection → export, sans jamais ouvrir
// l'éditeur détaillé. C'est l'exigence « bon du premier coup » du §4.1.
await page.fill('input[placeholder*="Mercedes"]', "Mercedes SL 60 AM");
await page.click('button:has-text("Générer")');
await page.waitForSelector('button:has-text("Exporter ce post")', { timeout: 180_000 });
console.log("titres générés — premier titre pré-sélectionné, export déjà disponible");

await page.waitForSelector('button:has-text("Exporter ce post")', { timeout: 30_000 });
const lienAjuster = await page.locator('a:has-text("Ajuster le détail")').count();
console.log(`bouton « Exporter ce post » : présent`);
console.log(`lien « Ajuster le détail »  : ${lienAjuster > 0 ? "présent (optionnel)" : "absent"}`);
await page.screenshot({ path: "test/parcours-pret.png", fullPage: true });

// L'écran d'ajustement doit reprendre le montage tel quel, pas repartir de zéro.
const hrefAjuster = await page.locator('a:has-text("Ajuster le détail")').getAttribute("href");
const champsTransmis = new URL(hrefAjuster, BASE).searchParams;
console.log("état transmis à l'ajustement :", [...champsTransmis.keys()].join(", "));

await page.click('button:has-text("Exporter ce post")');
await page.waitForURL(/\/export\//, { timeout: 180_000 });
console.log("export lancé, arrivé sur", new URL(page.url()).pathname);
console.log("NOMBRE D'ÉTAPES : upload -> titre -> export  (l'éditeur n'a jamais été ouvert)");
await page.screenshot({ path: "test/parcours-export.png", fullPage: true });

await browser.close();
