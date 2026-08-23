// Produit un rendu réel pour CHAQUE gabarit, avec le même jeu de photos, et
// mesure ce qui est mesurable sur chacun. Sert à vérifier qu'aucun agencement
// n'est cassé — pas seulement le 3A sur lequel tout a été calé.
//
// Usage : FOND=test33.jpeg BULLE_G=test31.webp BULLE_D=test32.webp \
//         node scripts/dev-test-tous-gabarits.mjs <tag>
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) { console.error("AUTH_PASSWORD manquant"); process.exit(1); }
const tag = process.argv[2] ?? "tous";

const FOND = process.env.FOND ?? "test33.jpeg";
const BG = process.env.BULLE_G ?? "test31.webp";
const BD = process.env.BULLE_D ?? "test32.webp";
const TITLE = process.env.TITLE ?? "Mercedes SL 60 AM : le roadster qui mêle luxe rétro et technologie moderne";
const EYEBROW = process.env.EYEBROW ?? "Une touche japonaise pour séduire les internautes";
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".avif": "image/avif" };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
ctx.setDefaultTimeout(180_000);
ctx.setDefaultNavigationTimeout(240_000);
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

async function up(f) {
  const r = await page.request.post(`${BASE}/api/images/upload`, {
    multipart: { image: { name: f, mimeType: MIME[f.slice(f.lastIndexOf("."))], buffer: fs.readFileSync(f) } },
    timeout: 180_000,
  });
  if (!r.ok()) throw new Error(`upload ${f}: ${r.status()} ${await r.text()}`);
  return r.json();
}
async function seg(id, variant) {
  const q = variant ? `?variant=${variant}` : "";
  const r = await page.request.post(`${BASE}/api/images/${id}/segment${q}`, { timeout: 180_000 });
  if (!r.ok()) throw new Error(`segment ${id}: ${r.status()}`);
  return (await r.json()).sujetUrl;
}

console.log(`fond=${FOND}  bulle gauche=${BG}  bulle droite=${BD}`);
const fond = await up(FOND), bg = await up(BG), bd = await up(BD);
const sujetUrl = await seg(fond.id);
// Découpe du plein cadre : sert au contrôle qualité de la famille 1.
await seg(fond.id, "cropped");
const sg = await seg(bg.id, "bulle");
const sd = await seg(bd.id, "bulle");

// Contrôle qualité : quels gabarits à bulles conviennent à ce fond ?
for (const g of ["1a", "2a", "2b", "3a", "3b"]) {
  const r = await page.request.get(`${BASE}/api/images/${fond.id}/gabarit-fit?gabarit=${g}`);
  const b = await r.json();
  console.log(`  contrôle ${g.toUpperCase()} : ${b.ok ? "OK    " : "REFUSÉ"}  ${((b.ratios || []).map((v) => (v * 100).toFixed(0) + "%").join(", ") || "—").padEnd(10)} ${b.ok ? "" : b.message.slice(0, 120)}`);
}

const CAS = {
  "1a": { imageUrl: fond.backdropUrl, title: TITLE },
  "1b": { imageUrl: fond.backdropUrl, title: TITLE, eyebrow: EYEBROW },
  "2a": { imageUrl: fond.backdropUrl, bulleUrl: bg.bulleUrl, sujetUrl, bulleSujetUrl: sg, title: TITLE },
  "2b": { imageUrl: fond.backdropUrl, bulleUrl: bd.bulleUrl, sujetUrl, bulleSujetUrl: sd, title: TITLE },
  "3a": { imageUrl: fond.backdropUrl, bulle1Url: bg.bulleUrl, bulle2Url: bd.bulleUrl, sujetUrl, bulle2SujetUrl: sd, title: TITLE },
  "3b": { imageUrl: fond.backdropUrl, bulle1Url: bg.bulleUrl, bulle2Url: bd.bulleUrl, sujetUrl, bulle2SujetUrl: sd, title: TITLE },
};

for (const [g, fields] of Object.entries(CAS)) {
  const params = new URLSearchParams(fields);
  await page.goto(`${BASE}/render/${g}?${params.toString()}`, { waitUntil: "networkidle" });
  const el = await page.waitForSelector(`[data-gabarit="${g}"]`);
  const out = `test/gabarit-${g}-${tag}.png`;
  await el.screenshot({ path: out });
  console.log("  rendu", out);
}
await browser.close();
console.log("\nfond id :", fond.id);
