// Test de l'heuristique d'attribution de rôle (Étape 3) sur des combinaisons
// construites à partir de vraies photos du Média Automobile (recadrées
// depuis inspi/ pour isoler "ce qui serait le fond" vs "ce qui serait une
// bulle" dans chaque post de référence) — pas des données 100% synthétiques.
//
// Usage : STUDIO_BASE_URL=http://localhost:3000 node scripts/verify-roles-etape3.mjs

import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  console.error("AUTH_PASSWORD manquant (source .env.local d'abord).");
  process.exit(1);
}

const cases = [
  { name: "A: voiture large vs drapeau (quasi carré)", files: ["A_fond_voiture.jpg", "A_bulle_drapeau.jpg"], expectFond: "A_fond_voiture.jpg" },
  { name: "B: F1 détaillée vs logo plat", files: ["B_fond_f1.jpg", "B_bulle_logo.jpg"], expectFond: "B_fond_f1.jpg" },
  { name: "C: Porsche large vs portrait Spider-Man", files: ["C_fond_porsche.jpg", "C_bulle_spiderman.jpg"], expectFond: "C_fond_porsche.jpg" },
  { name: "D: image unique", files: ["D_seule.jpg"], expectFond: "D_seule.jpg" },
  { name: "E: ordre inversé de A (le fond déposé en second)", files: ["A_bulle_drapeau.jpg", "A_fond_voiture.jpg"], expectFond: "A_fond_voiture.jpg" },
  { name: "F: 3 images (F1 fond, logo + spiderman bulles)", files: ["B_fond_f1.jpg", "B_bulle_logo.jpg", "C_bulle_spiderman.jpg"], expectFond: "B_fond_f1.jpg" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);
const cookies = await page.context().cookies();
const sessionCookie = cookies.find((c) => c.name === "session");
await browser.close();
const cookie = `session=${sessionCookie.value}`;

let pass = 0;
for (const c of cases) {
  const form = new FormData();
  for (const fname of c.files) {
    const bytes = await readFile(`/tmp/roles-test/${fname}`);
    form.append("images", new Blob([bytes], { type: "image/jpeg" }), fname);
  }
  const res = await fetch(`${BASE}/api/images/upload-batch`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    console.log(`${c.name}: ERREUR API — ${data.error}`);
    continue;
  }
  const fondIndex = data.images.findIndex((im) => im.role === "fond");
  const expectedIndex = c.files.indexOf(c.expectFond);
  const ok = fondIndex === expectedIndex;
  if (ok) pass++;
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${c.name} : fond attendu="${c.expectFond}", fond obtenu="${c.files[fondIndex]}" (${data.images[fondIndex].reason})`,
  );
}

console.log(`\n${pass}/${cases.length} cas corrects sans correction manuelle.`);
