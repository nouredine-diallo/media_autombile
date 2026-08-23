// Vérifie la génération de titre (Étape 5, mode thème) en conditions réelles :
// vrai login, vrai appel Groq, vérifie que les 3 titres respectent la
// longueur, et teste explicitement le cas d'erreur (thème vide -> 400).
//
// Usage : STUDIO_BASE_URL=http://localhost:3000 node scripts/verify-titles-etape5.mjs

import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  console.error("AUTH_PASSWORD manquant (source .env.local d'abord).");
  process.exit(1);
}

const MIN_LEN = 30;
const MAX_LEN = 95;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);
const cookies = await page.context().cookies();
const cookie = `session=${cookies.find((c) => c.name === "session").value}`;
await browser.close();

const themes = [
  "Tom Holland collection voitures",
  "Stig identité Schumacher",
  "rappel Tesla Model 3 problème freins",
];

let allPass = true;
for (const theme of themes) {
  const start = Date.now();
  const res = await fetch(`${BASE}/api/titles/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ theme }),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) {
    console.log(`FAIL — "${theme}" : erreur ${res.status} — ${data.error}`);
    allPass = false;
    continue;
  }
  console.log(`\nThème: "${theme}" (${elapsed}ms, fournisseur: ${data.provider})`);
  let themeOk = true;
  for (const t of data.titles) {
    const len = t.length;
    const ok = len >= MIN_LEN && len <= MAX_LEN;
    if (!ok) themeOk = false;
    console.log(`  ${ok ? "OK " : "FAIL"} (${len} car.) ${t}`);
  }
  if (data.titles.length !== 3) {
    console.log(`  FAIL — attendu 3 titres, reçu ${data.titles.length}`);
    themeOk = false;
  }
  if (!themeOk) allPass = false;
}

// Cas d'erreur : thème vide doit renvoyer 400, pas planter ni renvoyer un titre inventé
console.log("\nTest thème vide (doit échouer proprement) :");
const emptyRes = await fetch(`${BASE}/api/titles/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ theme: "" }),
});
const emptyData = await emptyRes.json();
const emptyOk = emptyRes.status === 400 && typeof emptyData.error === "string";
console.log(`  ${emptyOk ? "PASS" : "FAIL"} — statut ${emptyRes.status}, message: "${emptyData.error}"`);
if (!emptyOk) allPass = false;

console.log(`\n${allPass ? "TOUT PASSE" : "ÉCHECS DÉTECTÉS"}`);
process.exitCode = allPass ? 0 : 1;
