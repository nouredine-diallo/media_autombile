// Script de test réutilisable pour le visuel Mercedes SL 60 AM — beaucoup
// de correctifs seront testés dessus (2026-08-19 et après), donc paramétré
// plutôt que jetable. Mêmes photos que la référence réelle Le Média
// Automobile, inspi/5776137084027474227.jpg :
//   fond = test33.jpeg, bulle gauche = test31.webp, bulle droite = test32.webp
//
// Source du fond corrigée le 2026-08-20 : `test33.jpeg` (1920×1280) est la
// vraie source — elle porte le filigrane « CURATED » sur le bandeau de
// pare-brise, visible à l'identique sur la référence. `test3.webp`
// (1500×1000) est un recadrage plus serré du même cliché, sans filigrane, et
// sa hauteur insuffisante force un repli en fond flou (voir CLAUDE.md §1.1,
// Chantier 1 bis). Surchargeable par FOND=/BULLE_G=/BULLE_D= si besoin de
// re-tester l'ancienne source.
//
// Usage : STUDIO_BASE_URL=http://localhost:3000 node scripts/test-mercedes-sl60am.mjs [tag] [gabaritId]
//   [tag]       suffixe du nom de fichier de sortie (ex: "chantier1-v2") — obligatoire, pour ne jamais écraser un test précédent.
//   [gabaritId] "3a" par défaut ; "3b" pour tester l'autre disposition de bulles.

import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) { console.error("AUTH_PASSWORD manquant (source .env.local d'abord)."); process.exit(1); }

const tag = process.argv[2];
if (!tag) {
  console.error('Usage: node scripts/test-mercedes-sl60am.mjs <tag> [gabaritId]\nEx:    node scripts/test-mercedes-sl60am.mjs chantier1-v2');
  process.exit(1);
}
const gabaritId = process.argv[3] ?? "3a";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
// Timeouts globaux larges : machine de dev à mémoire contrainte, où même
// /login peut dépasser les 30s par défaut quand Next dev compile en parallèle
// d'un passage ONNX (constaté le 2026-08-20). Ce n'est pas une lenteur du
// produit, c'est l'environnement — voir CLAUDE.md §3.2/§3.3 sur les mesures
// non transposables à la VM cible.
context.setDefaultTimeout(180_000);
context.setDefaultNavigationTimeout(240_000);

const page = await context.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

async function uploadOne(filePath, filename, mime) {
  const buf = fs.readFileSync(filePath);
  const res = await page.request.post(`${BASE}/api/images/upload`, {
    multipart: { image: { name: filename, mimeType: mime, buffer: buf } },
    timeout: 180_000, // machine de dev partagée, parfois très chargée — l'upload calcule 2 recadrages + détourage
  });
  if (!res.ok()) throw new Error(`upload ${filePath} failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".avif": "image/avif" };
const mimeOf = (f) => MIME[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream";

const FOND = process.env.FOND ?? "test33.jpeg";
const BULLE_G = process.env.BULLE_G ?? "test31.webp";
const BULLE_D = process.env.BULLE_D ?? "test32.webp";

// REUSE_IDS="<fond>,<bulleG>,<bulleD>" rejoue le rendu sur des images déjà
// uploadées. Utile sur cette machine : chaque upload déclenche un passage
// u2net (modèle de 176 Mo) et le serveur Next s'est fait tuer par l'OOM
// killer en réessayant un run complet (constaté le 2026-08-20, dmesg à
// l'appui). Sauter les uploads ne change rien à ce qui est testé ici — le
// recadrage a déjà été produit par le vrai pipeline.
const reuse = process.env.REUSE_IDS?.split(",").map((s) => s.trim());
const urlsFor = (id) => ({
  id,
  croppedUrl: `/api/images/${id}?variant=cropped`,
  backdropUrl: `/api/images/${id}?variant=backdrop`,
  bulleUrl: `/api/images/${id}?variant=bulle`,
});

let fond, bulleGauche, bulleDroite;
if (reuse?.length === 3) {
  [fond, bulleGauche, bulleDroite] = reuse.map(urlsFor);
  console.log("Réutilisation des images déjà uploadées :", reuse.join(", "));
} else {
  console.log(`Upload des 3 images (${FOND}=fond, ${BULLE_G}=bulle gauche, ${BULLE_D}=bulle droite)…`);
  fond = await uploadOne(FOND, FOND, mimeOf(FOND));
  bulleGauche = await uploadOne(BULLE_G, BULLE_G, mimeOf(BULLE_G));
  bulleDroite = await uploadOne(BULLE_D, BULLE_D, mimeOf(BULLE_D));
  console.log("fond:", fond.id, "bulle gauche:", bulleGauche.id, "bulle droite:", bulleDroite.id);
  console.log("  stratégie de recadrage du fond :", JSON.stringify(fond.crop?.backdrop));
}

// 3e couche (découpe alpha du sujet du fond, par-dessus les bulles) — calculée
// sur backdrop.jpg pour rester alignée pixel pour pixel avec le fond affiché.
// L'ancienne version de ce script ne l'appelait pas, donc les rendus produits
// avant le 2026-08-20 testaient en réalité un empilement à 2 couches.
// La route de détourage ne met rien en cache : elle relance u2net à chaque
// appel. SKIP_SEGMENT=1 réutilise les PNG déjà produits — mêmes fichiers,
// sans le coût mémoire du modèle (utile sur cette machine, cf. OOM du
// 2026-08-20).
const cadres = {};
const conseils = {};
const positions = {};
async function segment(id, variant) {
  const q = variant ? `?variant=${variant}` : "";
  const resultVariant = variant === "bulle" ? "subject-bulle" : variant === "cropped" ? "subject-cropped" : "subject";
  if (process.env.SKIP_SEGMENT === "1") {
    return `/api/images/${id}?variant=${resultVariant}`;
  }
  const res = await page.request.post(`${BASE}/api/images/${id}/segment${q}`, { timeout: 180_000 });
  if (!res.ok()) throw new Error(`segment ${id} ${variant ?? "backdrop"} failed: ${res.status()} ${await res.text()}`);
  const j = await res.json();
  if (j.debordement?.cadre) cadres[id] = j.debordement.cadre;
  if (j.debordement) conseils[id] = j.debordement.conseille;
  if (j.sujet) positions[id] = j.sujet;
  return j.sujetUrl;
}

console.log("Détourage du fond (3e couche) et des deux bulles (débordement, Chantier 3)…");
const sujetUrl = await segment(fond.id);
const bulle1SujetUrl = await segment(bulleGauche.id, "bulle");
const bulle2SujetUrl = await segment(bulleDroite.id, "bulle");
console.log("  fond   :", sujetUrl);
console.log("  bulle 1:", bulle1SujetUrl);
console.log("  bulle 2:", bulle2SujetUrl);

// TITLE= permet de rejouer un test de cadrage/empilement sans redépendre du
// fournisseur LLM (utile quand on itère sur le visuel : le titre n'est pas ce
// qu'on teste, et une latence Groq fait échouer le run pour rien).
let title = process.env.TITLE;
if (title) {
  console.log("Titre fourni par TITLE= :", title);
} else {
  const theme = process.env.THEME ?? "Mercedes SL 60 AM";
  console.log(`Génération du titre à partir du thème « ${theme} »…`);
  const titleRes = await page.request.post(`${BASE}/api/titles/generate`, {
    data: { theme },
    timeout: 120_000,
  });
  if (!titleRes.ok()) throw new Error(`title generation failed: ${titleRes.status()} ${await titleRes.text()}`);
  const titleBody = await titleRes.json();
  title = titleBody.titles[0];
  console.log("Titre retenu:", title, "(fournisseur:", titleBody.provider + ")");
}

// imageUrl (fond) utilise backdropUrl (photo entière, fond flou/assombri si
// besoin) ; les bulles utilisent croppedUrl (recadrage strict, jamais de
// fond flou dans un petit cercle) — voir cropToAspectSmart, 2026-08-19.
const params = new URLSearchParams({
  imageUrl: fond.backdropUrl,
  // Les familles 2 n'ont qu'un champ `bulleUrl` ; les familles 3 en ont deux.
  // Envoyer les mauvaises clés laissait la bulle sur le visuel d'exemple —
  // piège rencontré le 2026-08-22 en testant le post Disney+ en 2B.
  ...(gabaritId.startsWith("2")
    ? {
        bulleUrl: bulleGauche.bulleUrl,
        ...(cadres[bulleGauche.id] ? { bulleCadre: cadres[bulleGauche.id] } : {}),
        // Bulle placée d'après le sujet du fond (famille 2) : au-dessus de lui
        // pour créer le contact, du côté qu'il laisse libre.
        ...(positions[fond.id]
          ? (() => {
              const p = positions[fond.id];
              const r = ((54 / 100) * 1080) / 2 / 1350 * 100;
              const cy = Math.min(36, Math.max(20, p.haut + 13 - r));
              const cx = gabaritId === "2a" ? 50 : Math.min(72, Math.max(28, 100 - p.centreX));
              return { bulleGeom: `${cx.toFixed(2)},${cy.toFixed(2)},54.00` };
            })()
          : {}),
      }
    : {
        bulle1Url: bulleGauche.bulleUrl,
        bulle2Url: bulleDroite.bulleUrl,
        ...(cadres[bulleGauche.id] ? { bulle1Cadre: cadres[bulleGauche.id] } : {}),
        ...(cadres[bulleDroite.id] ? { bulle2Cadre: cadres[bulleDroite.id] } : {}),
      }),
  sujetUrl,
  // Débordement de bulle (Chantier 3) : jamais imposé — l'effet est calculé
  // et proposé, c'est l'opérateur qui l'active bulle par bulle (spec : "
  // proposer de le laisser visible", et CLAUDE.md §2 : l'outil prépare, il ne
  // décide pas). BULLE_OVERFLOW="1,2" active les deux, "2" seulement la
  // droite, vide ou absent aucune.
  ...(() => {
    // Par défaut on suit le conseil mesuré ; BULLE_OVERFLOW ne sert qu'à forcer
    // manuellement pour un test.
    const force = process.env.BULLE_OVERFLOW;
    if (force === undefined) {
      if (gabaritId.startsWith("2")) {
        return conseils[bulleGauche.id] ? { bulleSujetUrl: bulle1SujetUrl } : {};
      }
      return {
        ...(conseils[bulleGauche.id] ? { bulle1SujetUrl } : {}),
        ...(conseils[bulleDroite.id] ? { bulle2SujetUrl } : {}),
      };
    }
    const on = force.split(",").map((v) => v.trim());
    if (gabaritId.startsWith("2")) {
      return on.includes("1") ? { bulleSujetUrl: bulle1SujetUrl } : {};
    }
    return {
      ...(on.includes("1") ? { bulle1SujetUrl } : {}),
      ...(on.includes("2") ? { bulle2SujetUrl } : {}),
    };
  })(),
  title,
});
// Timeout large : sur cette machine de dev à mémoire contrainte, la première
// compilation de /render/[gabaritId] par Next dev dépasse régulièrement les
// 30s par défaut de Playwright (constaté le 2026-08-20, cf. CLAUDE.md §3.3
// sur les timeouts déjà rencontrés) — ce n'est pas un défaut du gabarit.
await page.goto(`${BASE}/render/${gabaritId}?${params.toString()}`, {
  waitUntil: "networkidle",
  timeout: 240_000,
});
const el = await page.waitForSelector(`[data-gabarit="${gabaritId}"]`, { timeout: 120_000 });
const outPath = `test/montage-${tag}.png`;
await el.screenshot({ path: outPath });
console.log("Sauvegardé:", outPath);

const fondCropRes = await page.request.get(`${BASE}${fond.backdropUrl}`);
const fondOutPath = `test/montage-${tag}-fond.jpg`;
fs.writeFileSync(fondOutPath, await fondCropRes.body());
console.log("Sauvegardé:", fondOutPath, "(fond seul, pour inspection directe du recadrage)");

await browser.close();
