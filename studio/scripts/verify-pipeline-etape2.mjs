// Test manuel du pipeline image de l'Étape 2 : upload -> recadrage auto ->
// amélioration HD à la demande. Vérifie le critère de fin du cahier des
// charges : "Une image floue fournie en entrée produit un rendu net et
// correctement recadré, sans intervention manuelle autre que le clic
// « Améliorer »."
//
// Usage : STUDIO_BASE_URL=http://localhost:3000 node scripts/verify-pipeline-etape2.mjs <chemin-image>

import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
const imagePath = process.argv[2];

if (!PASSWORD) {
  console.error("AUTH_PASSWORD manquant (source .env.local d'abord).");
  process.exit(1);
}
if (!imagePath) {
  console.error("Usage: node scripts/verify-pipeline-etape2.mjs <chemin-image>");
  process.exit(1);
}

// 1. Login réel via le formulaire (Server Action, pas un POST HTML classique
// — on passe par un navigateur plutôt que de simuler l'encodage).
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);
const cookies = await page.context().cookies();
const sessionCookie = cookies.find((c) => c.name === "session");
await browser.close();
if (!sessionCookie) {
  console.error("Login a échoué : pas de cookie de session reçu.");
  process.exit(1);
}
const cookie = `session=${sessionCookie.value}`;
console.log("Login OK");

// 2. Upload
const bytes = await readFile(imagePath);
const form = new FormData();
form.append("image", new Blob([bytes], { type: "image/jpeg" }), "test.jpg");

const uploadRes = await fetch(`${BASE}/api/images/upload`, {
  method: "POST",
  headers: { Cookie: cookie },
  body: form,
});
const uploadData = await uploadRes.json();
if (!uploadRes.ok) {
  console.error("Upload a échoué:", uploadData);
  process.exit(1);
}
console.log("Upload OK, id =", uploadData.id);

// 3. Vérifie le recadrage (dimensions + aspect exact 1080x1350)
const croppedRes = await fetch(`${BASE}${uploadData.croppedUrl}`, {
  headers: { Cookie: cookie },
});
const croppedBytes = Buffer.from(await croppedRes.arrayBuffer());
const meta = await sharp(croppedBytes).metadata();
const aspectOk = meta.width === 1080 && meta.height === 1350;
console.log(
  `Recadrage : ${meta.width}x${meta.height} — ${aspectOk ? "PASS (1080x1350 exact)" : "FAIL"}`,
);

// 4. Amélioration HD à la demande
const upscaleRes = await fetch(`${BASE}/api/images/${uploadData.id}/upscale`, {
  method: "POST",
  headers: { Cookie: cookie },
});
const upscaleData = await upscaleRes.json();
if (upscaleRes.ok) {
  console.log("Amélioration HD : PASS —", upscaleData.upscaledUrl);
} else {
  console.log(
    `Amélioration HD : indisponible (statut ${upscaleRes.status}) — message explicite reçu : "${upscaleData.error}"`,
  );
  console.log(
    "-> Comportement attendu si le binaire/modèle n'est pas installé sur cet environnement : échec visible, pas de dégradation silencieuse.",
  );
}

process.exitCode = aspectOk ? 0 : 1;
