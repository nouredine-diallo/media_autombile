// Test de régression visuelle pour le gabarit 1A (CLAUDE.md §5, §6.1).
//
// Vérifie que /render/1a (la page utilisée par l'aperçu) et /api/render/1a
// (l'export Playwright) produisent un PNG strictement identique, octet pour
// octet, pour les mêmes paramètres. C'est le critère de fin de l'Étape 1 du
// cahier des charges : aucun écart entre ce que l'utilisateur voit et ce qui
// est exporté.
//
// Prérequis : le serveur (dev ou prod) doit déjà tourner, et les variables
// AUTH_PASSWORD / SESSION_SECRET du .env.local doivent être exportées dans
// l'environnement du process qui lance ce script.
//
// Usage : STUDIO_BASE_URL=http://localhost:3000 node scripts/verify-gabarit-1a.mjs

import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;

if (!PASSWORD) {
  console.error(
    "AUTH_PASSWORD manquant dans l'environnement (source .env.local d'abord).",
  );
  process.exit(1);
}

const title =
  "Hiroshi Okuda, l'ancien président de Toyota et pionnier de la Prius, est décédé à l'âge de 93 ans";
const imageUrl = "/test/placeholder-photo.jpg";

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`);

  // "Aperçu" : la même page que celle capturée par l'export, chargée dans un
  // navigateur normal, à la résolution canvas réelle (pas de mise à l'échelle CSS).
  await page.setViewportSize({ width: 1080, height: 1350 });
  const params = new URLSearchParams({ title, imageUrl });
  await page.goto(`${BASE}/render/1a?${params.toString()}`);
  const el = await page.waitForSelector('[data-gabarit="1a"]');
  const previewBuffer = await el.screenshot({ type: "png" });

  // "Export" : le même appel que le bouton "Générer le PNG" de l'écran d'édition.
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === "session");
  const res = await fetch(`${BASE}/api/render/1a`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session=${sessionCookie.value}`,
    },
    body: JSON.stringify({ title, imageUrl }),
  });
  if (!res.ok) {
    throw new Error(`Export API a échoué (${res.status}): ${await res.text()}`);
  }
  const exportBuffer = Buffer.from(await res.arrayBuffer());

  const identical = previewBuffer.equals(exportBuffer);
  console.log(`Aperçu : ${previewBuffer.length} octets`);
  console.log(`Export : ${exportBuffer.length} octets`);
  console.log(identical ? "PASS — pixel-identique" : "FAIL — les fichiers diffèrent");
  process.exitCode = identical ? 0 : 1;
} finally {
  await browser.close();
}
