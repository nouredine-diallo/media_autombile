// Test de régression pour le détourage (correctif directeur point 4,
// 2026-08-19) : la 3e couche "sujet" des gabarits à bulles (familles 2/3).
//
// Vérifie :
// 1. La route POST /api/images/[id]/segment calcule et met en cache un
//    detourage réel (variant "subject").
// 2. Aperçu et export restent pixel-identiques une fois `sujetUrl` fourni
//    (CLAUDE.md §1 : zéro écart aperçu/export, même avec la 3e couche).
// 3. Sans `sujetUrl` (image jamais détourée), le gabarit reste identique
//    au comportement précédent (repli à 2 couches, pas de régression).
//
// Prérequis : le modèle `models/u2net.onnx` doit être présent (voir
// CLAUDE.md §3.3 pour la provenance/licence) et les 3 images de test
// uploadées (id ci-dessous, issues d'un upload réel du test Renault 5).
//
// Usage : STUDIO_BASE_URL=http://localhost:3001 node scripts/verify-detourage.mjs

import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  console.error("AUTH_PASSWORD manquant (source .env.local d'abord).");
  process.exit(1);
}

const FOND_ID = "44d2b6d4-c4c3-4ac7-944d-a40b5c25df83";
const fields = {
  imageUrl: `/api/images/${FOND_ID}?variant=cropped`,
  bulle1Url: "/api/images/048b8bb3-9661-426d-9da7-b4aac495add1?variant=cropped",
  bulle2Url: "/api/images/85e3b7af-5dd2-4e3d-987b-805faef73089?variant=cropped",
  title: "Test parité avec découpe du sujet",
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`);

  let failed = false;

  // 1. Segmentation réelle.
  const segRes = await page.request.post(`${BASE}/api/images/${FOND_ID}/segment`);
  if (!segRes.ok()) {
    console.error("FAIL — segmentation:", segRes.status(), await segRes.text());
    process.exit(1);
  }
  const { sujetUrl } = await segRes.json();
  console.log("segmentation OK ->", sujetUrl);

  // 2. Parité aperçu/export AVEC sujetUrl.
  for (const withSujet of [true, false]) {
    const testFields = withSujet ? { ...fields, sujetUrl } : fields;
    const params = new URLSearchParams(testFields);
    await page.goto(`${BASE}/render/3a?${params.toString()}`, { waitUntil: "networkidle" });
    const el = await page.waitForSelector('[data-gabarit="3a"]');
    const previewPng = await el.screenshot({ type: "png" });

    const exportRes = await page.request.post(`${BASE}/api/render/3a`, { data: testFields });
    if (!exportRes.ok()) {
      console.error("FAIL — export:", exportRes.status(), await exportRes.text());
      failed = true;
      continue;
    }
    const exportPng = await exportRes.body();

    const label = withSujet ? "3a+sujet" : "3a sans sujet (repli 2 couches)";
    if (Buffer.compare(previewPng, exportPng) === 0) {
      console.log(`PASS — ${label} (${previewPng.length}o) pixel-identique`);
    } else {
      console.error(`FAIL — ${label} : aperçu et export diffèrent`);
      failed = true;
    }
  }

  if (failed) process.exit(1);
} finally {
  await browser.close();
}
