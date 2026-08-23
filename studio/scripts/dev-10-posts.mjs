// Matériel du test des 10 posts (§4.2 du cahier) : génère 10 posts **sans
// aucune retouche manuelle**, par le vrai parcours (upload → détourage →
// contrôle qualité → rendu), titres produits par le vrai routeur LLM.
//
// Le test lui-même est humain et ne peut pas être joué ici : mélanger ces 10
// posts à 10 posts faits main et faire trier le graphiste. Ce script ne
// fournit que la moitié automatique du matériel.
//
// Usage : node scripts/dev-10-posts.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) { console.error("AUTH_PASSWORD manquant"); process.exit(1); }
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".avif": "image/avif" };

// 10 sujets, couvrant les trois familles et les deux agencements de chacune.
const POSTS = [
  { nom: "01-mercedes-3a",  gabarit: "3a", theme: "Mercedes SL 60 AMG",                     photos: ["test33.jpeg", "test31.webp", "test32.webp"] },
  { nom: "02-mercedes-3b",  gabarit: "3b", theme: "Mercedes SL 60 AMG intérieur",           photos: ["test33.jpeg", "test31.jpg", "test32.webp"] },
  { nom: "03-wec-3a",       gabarit: "3a", theme: "Hypercars du championnat du monde WEC",  photos: ["test21.jpg", "test2.jpg", "test23.jpg"] },
  // Les trois combinaisons suivantes ont d'abord été tentées en 3B / 2A / 2B :
  // le contrôle qualité les a refusées (sujet recouvrant 57 %, 77 % et 91 %
  // des bulles) et a proposé un repli **vérifié**. On applique sa suggestion,
  // c'est le comportement attendu de l'outil en production.
  { nom: "04-wec-2a",       gabarit: "2a", theme: "Porsche 963 en endurance",               photos: ["test23.jpg", "test2.jpg"] },
  { nom: "05-renault-1a",   gabarit: "1a", theme: "Renault 5 E-Tech électrique",            photos: ["test12.avif"] },
  { nom: "06-renault-1b",   gabarit: "1b", theme: "Intérieur de la Renault 5 E-Tech",       photos: ["test13.jpg"] },
  { nom: "07-mercedes-2a",  gabarit: "2a", theme: "Tableau de bord Mercedes des années 90", photos: ["test33.jpeg", "test31.webp"] },
  { nom: "08-personne-1a",  gabarit: "1a", theme: "Hiroshi Okuda ancien président de Toyota", photos: ["test-personne.jpg"] },
  { nom: "09-renault-1a",   gabarit: "1a", theme: "Renault 5 E-Tech de retour",             photos: ["test1.jpg"] },
  { nom: "10-wec-1b",       gabarit: "1b", theme: "Ferrari 499P en pit lane",               photos: ["test2.jpg"] },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
ctx.setDefaultTimeout(240_000);
ctx.setDefaultNavigationTimeout(240_000);
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

async function up(f) {
  const r = await page.request.post(`${BASE}/api/images/upload`, {
    multipart: { image: { name: f, mimeType: MIME[f.slice(f.lastIndexOf("."))], buffer: fs.readFileSync(f) } },
    timeout: 240_000,
  });
  if (!r.ok()) throw new Error(`upload ${f}: ${r.status()}`);
  return r.json();
}
const cadres = {};
const conseils = {};
const positions = {};
async function seg(id, variant) {
  const q = variant ? `?variant=${variant}` : "";
  const r = await page.request.post(`${BASE}/api/images/${id}/segment${q}`, { timeout: 240_000 });
  if (!r.ok()) return undefined;
  const j = await r.json();
  if (j.debordement?.cadre) cadres[id] = j.debordement.cadre;
  if (j.debordement) conseils[id] = j.debordement.conseille;
  if (j.sujet) positions[id] = j.sujet;
  return j.sujetUrl;
}

fs.mkdirSync("test/10-posts", { recursive: true });
const journal = [];

for (const post of POSTS) {
  const imgs = [];
  for (const f of post.photos) imgs.push(await up(f));
  const fond = imgs[0];
  const sujetUrl = await seg(fond.id);
  const bulles = [];
  for (const b of imgs.slice(1)) bulles.push({ ...b, sujet: await seg(b.id, "bulle") });

  // Contrôle qualité — enregistré, jamais contourné en silence.
  const fit = await page.request.get(`${BASE}/api/images/${fond.id}/gabarit-fit?gabarit=${post.gabarit}`)
    .then((r) => (r.ok() ? r.json() : null));

  const t = await page.request.post(`${BASE}/api/titles/generate`, { data: { theme: post.theme }, timeout: 180_000 });
  const titre = t.ok() ? (await t.json()).titles[0] : post.theme;

  const fields = { imageUrl: fond.backdropUrl, title: titre };
  if (sujetUrl) fields.sujetUrl = sujetUrl;
  if (post.gabarit.startsWith("2")) {
    if (bulles[0]) {
      fields.bulleUrl = bulles[0].bulleUrl;
      // Débordement seulement quand la mesure le conseille — le forcer
      // peignait un pavé de décor hors du cercle (constaté le 2026-08-22).
      if (bulles[0].sujet && conseils[bulles[0].id]) fields.bulleSujetUrl = bulles[0].sujet;
      if (cadres[bulles[0].id]) fields.bulleCadre = cadres[bulles[0].id];
    }
  } else if (post.gabarit.startsWith("3")) {
    if (bulles[0]) {
      fields.bulle1Url = bulles[0].bulleUrl;
      if (cadres[bulles[0].id]) fields.bulle1Cadre = cadres[bulles[0].id];
    }
    if (bulles[1]) {
      fields.bulle2Url = bulles[1].bulleUrl;
      if (bulles[1].sujet && conseils[bulles[1].id]) fields.bulle2SujetUrl = bulles[1].sujet;
      if (cadres[bulles[1].id]) fields.bulle2Cadre = cadres[bulles[1].id];
    }
  }
  if (post.gabarit === "1b") fields.eyebrow = post.theme;

  const params = new URLSearchParams(fields);
  await page.goto(`${BASE}/render/${post.gabarit}?${params.toString()}`, { waitUntil: "networkidle" });
  const el = await page.waitForSelector(`[data-gabarit="${post.gabarit}"]`);
  const out = `test/10-posts/${post.nom}.png`;
  await el.screenshot({ path: out });
  journal.push({ ...post, titre, fit: fit ? { ok: fit.ok, message: fit.message } : null, fichier: out });
  console.log(`${post.nom.padEnd(18)} ${fit?.ok ? "QC ok    " : "QC ALERTE"} ${titre.slice(0, 60)}`);
}

fs.writeFileSync("test/10-posts/journal.json", JSON.stringify(journal, null, 2));
console.log("\njournal : test/10-posts/journal.json");
await browser.close();
