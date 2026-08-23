// Test de régression visuelle pour les gabarits de l'Étape 4 (1B, 2A, 3A, 3B)
// + re-vérification de 1A après le refactor TitleFooter partagé.
// Même principe que scripts/verify-gabarit-1a.mjs : aperçu et export doivent
// être strictement identiques.
//
// Usage : STUDIO_BASE_URL=http://localhost:3000 node scripts/verify-gabarits-etape4.mjs

import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  console.error("AUTH_PASSWORD manquant (source .env.local d'abord).");
  process.exit(1);
}

const cases = [
  {
    id: "1a",
    dedicated: true, // routes /render/1a + /api/render/1a (pas génériques)
    fields: {
      title: "Hiroshi Okuda, l'ancien président de Toyota et pionnier de la Prius, est décédé à l'âge de 93 ans",
      imageUrl: "/test/placeholder-photo.jpg",
    },
  },
  {
    id: "1b",
    fields: {
      imageUrl: "/test/placeholder-photo.jpg",
      eyebrow: "Une touche unique pour capter l'attention",
      title: "Essayez de trouver un plus gros flex des années 90",
    },
  },
  {
    id: "2a",
    fields: {
      imageUrl: "/test/fixtures/B_fond_f1.jpg",
      bulleUrl: "/test/fixtures/B_bulle_logo.jpg",
      title: "Disney+ devient la plateforme mondiale pour la diffusion de la Formula E",
    },
  },
  {
    id: "2b",
    fields: {
      imageUrl: "/test/fixtures/B_fond_f1.jpg",
      bulleUrl: "/test/fixtures/B_bulle_logo.jpg",
      title: "Disney+ devient la plateforme mondiale pour la diffusion de la Formula E",
    },
  },
  {
    id: "3a",
    fields: {
      imageUrl: "/test/fixtures/A_fond_voiture.jpg",
      bulle1Url: "/test/fixtures/A_bulle_dashboard.jpg",
      bulle2Url: "/test/fixtures/A_bulle_exterior.jpg",
      title: "Essayez de trouver un plus gros flex des années 90",
    },
  },
  {
    id: "3b",
    fields: {
      imageUrl: "/test/fixtures/C_fond_porsche.jpg",
      bulle1Url: "/test/fixtures/C_bulle_spiderman.jpg",
      bulle2Url: "/test/fixtures/C_bulle_cadillac.jpg",
      title: "Au cœur de l'incroyable collection de voitures de la star de Spider-Man",
    },
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);
const cookies = await page.context().cookies();
const sessionCookie = cookies.find((c) => c.name === "session");
const cookie = `session=${sessionCookie.value}`;

let allPass = true;
for (const c of cases) {
  const fields = c.fields;

  await page.setViewportSize({ width: 1080, height: 1350 });
  const params = new URLSearchParams(fields);
  const renderPath = c.dedicated ? `/render/1a` : `/render/${c.id}`;
  await page.goto(`${BASE}${renderPath}?${params.toString()}`);
  const el = await page.waitForSelector(`[data-gabarit="${c.id}"]`);
  const previewBuffer = await el.screenshot({ type: "png" });

  const exportPath = c.dedicated ? `/api/render/1a` : `/api/render/${c.id}`;
  const res = await fetch(`${BASE}${exportPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    console.log(`${c.id}: FAIL — export API erreur ${res.status}: ${await res.text()}`);
    allPass = false;
    continue;
  }
  const exportBuffer = Buffer.from(await res.arrayBuffer());
  const identical = previewBuffer.equals(exportBuffer);
  console.log(`${c.id}: ${identical ? "PASS" : "FAIL"} (aperçu ${previewBuffer.length}o, export ${exportBuffer.length}o)`);
  if (!identical) allPass = false;
}

await browser.close();
process.exitCode = allPass ? 0 : 1;
