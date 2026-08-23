// Vérifie que l'export produit bien LE MONTAGE (photos incluses) et non le
// gabarit d'exemple — le défaut signalé par le directeur le 2026-08-21, causé
// par les deux pages d'upload déconnectées.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const PASSWORD = process.env.AUTH_PASSWORD;
const browser = await chromium.launch();
const ctx = await browser.newContext();
ctx.setDefaultTimeout(240_000);
ctx.setDefaultNavigationTimeout(240_000);
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);

const jobId = process.argv[2];
if (!jobId) { console.error("usage: node scripts/dev-verifie-export.mjs <jobId>"); process.exit(1); }

let job = null;
for (let i = 0; i < 60; i++) {
  const r = await page.request.get(`${BASE}/api/export/${jobId}`);
  if (!r.ok()) { console.error("job:", r.status(), await r.text()); break; }
  job = await r.json();
  if (job.status === "done" || job.status === "error") break;
  await page.waitForTimeout(2000);
}
console.log("statut :", job?.status, job?.error ? `— ${job.error}` : "");

if (job?.hasDownload) {
  const png = await page.request.get(`${BASE}/api/export/${jobId}/download`);
  const buf = await png.body();
  fs.writeFileSync("test/export-verifie.png", buf);
  console.log(`PNG récupéré : test/export-verifie.png (${(buf.length / 1024).toFixed(0)} ko)`);
} else {
  console.log("pas de PNG téléchargeable —", JSON.stringify(job));
}
await browser.close();
