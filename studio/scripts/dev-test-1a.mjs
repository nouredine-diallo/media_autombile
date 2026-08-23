// Rendu de contrôle du gabarit 1A (image seule + titre) — famille prioritaire
// fixée par le directeur. Produit toujours le MÊME fichier de sortie, pour que
// deux itérations soient comparables au pixel.
//
// Usage : FOND=test33.jpeg node scripts/dev-test-1a.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) { console.error("AUTH_PASSWORD manquant"); process.exit(1); }

const FOND = process.env.FOND ?? "test33.jpeg";
const TITLE = process.env.TITLE
  ?? "Hiroshi Okuda, l'ancien président de Toyota et pionnier de la Prius, est décédé à l'âge de 93 ans";
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".avif": "image/avif" };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
context.setDefaultTimeout(180_000);
context.setDefaultNavigationTimeout(240_000);
const page = await context.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

const res = await page.request.post(`${BASE}/api/images/upload`, {
  multipart: { image: { name: FOND, mimeType: MIME[FOND.slice(FOND.lastIndexOf("."))], buffer: fs.readFileSync(FOND) } },
  timeout: 180_000,
});
if (!res.ok()) throw new Error(`upload: ${res.status()} ${await res.text()}`);
const img = await res.json();
console.log("image:", img.id);

// 1A compose la photo dans la même zone haute que les autres familles.
const params = new URLSearchParams({ imageUrl: img.backdropUrl, title: TITLE });
await page.goto(`${BASE}/render/1a?${params.toString()}`, { waitUntil: "networkidle" });
const el = await page.waitForSelector('[data-gabarit="1a"]');
await el.screenshot({ path: "test/montage-1a.png" });
console.log("Sauvegardé: test/montage-1a.png");

const crop = await page.request.get(`${BASE}${img.backdropUrl}`);
fs.writeFileSync("test/montage-1a-fond.jpg", await crop.body());
console.log("Sauvegardé: test/montage-1a-fond.jpg (photo non retouchée, pour mesurer le dégradé)");
await browser.close();
