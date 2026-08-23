/**
 * Test Étape 6 — Workflow complet Renault 5 E-Tech
 * 
 * Ce script teste le workflow bout en bout :
 * 1. Authentification (génération token JWT directement)
 * 2. Upload de 3 images test
 * 3. Génération de titre via Groq
 * 4. Export PNG via Playwright (tâche de fond)
 * 5. Téléchargement du résultat
 * 
 * Usage: node scripts/test-workflow.mjs
 */

import { SignJWT } from "jose";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const BASE = "http://localhost:3000";
const SECRET = "change-me-in-production-use-openssl-rand-base64-32";
const encodedKey = new TextEncoder().encode(SECRET);

// --- Auth : générer un token JWT directement ---
async function getAuthCookie() {
  console.log("\n=== AUTH : Génération token JWT ===");
  
  const token = await new SignJWT({ userId: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
  
  console.log("✅ Token JWT généré");
  return `session=${token}`;
}

// --- Upload images ---
async function uploadImages(cookie) {
  console.log("\n=== UPLOAD : 3 images test ===");
  
  const images = ["test1.jpg", "test12.avif", "test13.jpg"];
  const form = new FormData();
  
  for (const img of images) {
    const filePath = path.join(process.cwd(), img);
    if (!existsSync(filePath)) {
      console.log(`   ⚠️  ${img} non trouvé, skip`);
      continue;
    }
    const ext = path.extname(img).toLowerCase();
    const mime = MIME_TYPES[ext] || "image/jpeg";
    const blob = new Blob([readFileSync(filePath)], { type: mime });
    form.append("images", blob, img);
    console.log(`   📁 ${img} [${mime}] (${(readFileSync(filePath).length / 1024).toFixed(0)} Ko)`);
  }
  
  const res = await fetch(`${BASE}/api/images/upload-batch`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload: ${data.error}`);
  
  console.log(`\n✅ ${data.images.length} images uploadées :`);
  for (const img of data.images) {
    console.log(`   • ${img.role.toUpperCase().padEnd(7)} → ${img.reason}`);
    console.log(`     URL: ${img.croppedUrl}`);
  }
  
  return data.images;
}

// --- Générer titre ---
async function generateTitles(cookie, theme) {
  console.log(`\n=== TITRE : Groq API ===`);
  console.log(`   Thème: "${theme}"`);
  
  const res = await fetch(`${BASE}/api/titles/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ theme }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(`Titre: ${data.error}`);
  
  console.log(`\n✅ ${data.titles.length} propositions :`);
  for (const [i, t] of data.titles.entries()) {
    console.log(`   ${i + 1}. "${t}"`);
  }
  
  return data.titles;
}

// --- Export PNG ---
async function startExport(cookie, gabaritId, fieldValues) {
  console.log(`\n=== EXPORT : Gabarit ${gabaritId} ===`);
  console.log(`   Champs: ${Object.keys(fieldValues).join(", ")}`);
  
  const res = await fetch(`${BASE}/api/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ gabaritId, fieldValues }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(`Export: ${data.error}`);
  
  console.log(`✅ Job démarré: ${data.jobId}`);
  return data.jobId;
}

// --- Polling ---
async function waitForExport(cookie, jobId) {
  console.log(`\n=== POLLING : ${jobId.slice(0, 8)}… ===`);
  
  const start = Date.now();
  while (Date.now() - start < 60000) {
    const res = await fetch(`${BASE}/api/export/${jobId}`, {
      headers: { Cookie: cookie },
    });
    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    const statusEmoji = {
      pending: "⏳",
      rendering: "🎨",
      uploading: "☁️",
      done: "✅",
      error: "❌",
    };
    
    console.log(`   ${statusEmoji[data.status] || "?"} ${data.status} (${elapsed}s)`);
    
    if (data.status === "done") return data;
    if (data.status === "error") throw new Error(data.error);
    
    await new Promise((r) => setTimeout(r, 800));
  }
  
  throw new Error("Timeout 60s");
}

// --- Download ---
async function downloadPng(cookie, jobId, outputPath) {
  console.log(`\n=== DOWNLOAD : ${outputPath} ===`);
  
  const res = await fetch(`${BASE}/api/export/${jobId}/download`, {
    headers: { Cookie: cookie },
  });
  
  if (!res.ok) throw new Error("Download échoué");
  
  const buffer = Buffer.from(await res.arrayBuffer());
  
  const dir = path.dirname(outputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outputPath, buffer);
  
  console.log(`✅ PNG sauvegardé: ${outputPath} (${(buffer.length / 1024).toFixed(0)} Ko)`);
  return outputPath;
}

// ============================================================
// TEST 1 : 3 visuels + sujet Renault 5
// ============================================================
async function test1_renault5() {
  console.log("\n" + "═".repeat(70));
  console.log("  🚗 TEST 1 : Renault 5 E-Tech — 3 visuels + sujet");
  console.log("═".repeat(70));
  
  const cookie = await getAuthCookie();
  
  // Upload
  const images = await uploadImages(cookie);
  
  // Titre
  const theme = "Renault 5 E-Tech : le pari électrique néo-rétro de Renault";
  const titles = await generateTitles(cookie, theme);
  const selectedTitle = titles[0];
  console.log(`\n   ➤ Titre retenu: "${selectedTitle}"`);
  
  // Préparer les champs
  const fondImage = images.find((img) => img.role === "fond");
  const bulle1 = images.find((img) => img.role === "bulle1");
  const bulle2 = images.find((img) => img.role === "bulle2");
  
  const fieldValues = {
    imageUrl: fondImage?.croppedUrl || "",
    title: selectedTitle,
  };
  if (bulle1) fieldValues.bulle1Url = bulle1.croppedUrl;
  if (bulle2) fieldValues.bulle2Url = bulle2.croppedUrl;
  
  // Déterminer gabarit
  let gabaritId = "1a";
  if (bulle1 && bulle2) gabaritId = "3a";
  else if (bulle1) gabaritId = "2a";
  
  console.log(`   ➤ Gabarit: ${gabaritId}`);
  
  // Export
  const jobId = await startExport(cookie, gabaritId, fieldValues);
  const result = await waitForExport(cookie, jobId);
  
  // Download
  const outputPath = "test/test-renault5-3images.png";
  await downloadPng(cookie, jobId, outputPath);
  
  console.log("\n" + "─".repeat(70));
  console.log("  ✅ TEST 1 TERMINÉ");
  console.log("─".repeat(70));
  
  return { success: true, jobId, titles, outputPath, gabaritId };
}

// ============================================================
// TEST 2 : Sujet Toyota SANS visuel — titre seul
// ============================================================
async function test2_toyota_no_image() {
  console.log("\n" + "═".repeat(70));
  console.log("  🏭 TEST 2 : Toyota restructuring — SUJET SEUL (pas de visuel)");
  console.log("═".repeat(70));
  
  const cookie = await getAuthCookie();
  
  const theme = "recent Toyota Motor Corp announces major organizational and board restructuring";
  const titles = await generateTitles(cookie, theme);
  
  console.log("\n   ⚠️  NOTE : Sans visuel, on ne peut PAS générer le post complet.");
  console.log("   La génération de visuels (Étape 7) n'est pas encore implémentée.");
  console.log("   Seule la génération de titre est disponible.");
  
  console.log("\n" + "─".repeat(70));
  console.log("  ✅ TEST 2 TERMINÉ (titre seul, pas de PNG)");
  console.log("─".repeat(70));
  
  return { success: true, titles, hasImages: false };
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("\n" + "█".repeat(70));
  console.log("  STUDIO AUTOMOBILE — TEST WORKFLOW COMPLET");
  console.log("  Étape 6 : validation + export");
  console.log("█".repeat(70));
  
  const results = {};
  
  try {
    // Test 1 : 3 visuels + Renault 5
    results.test1 = await test1_renault5();
    
    // Test 2 : Toyota sans visuel
    results.test2 = await test2_toyota_no_image();
    
    console.log("\n\n" + "█".repeat(70));
    console.log("  RÉSUMÉ DES TESTS");
    console.log("█".repeat(70));
    console.log(`  Test 1 (Renault 5, 3 images): ${results.test1.success ? "✅ SUCCÈS" : "❌ ÉCHEC"}`);
    if (results.test1.outputPath) console.log(`    → ${results.test1.outputPath}`);
    console.log(`  Test 2 (Toyota, sans image):  ${results.test2.success ? "✅ SUCCÈS" : "❌ ÉCHEC"}`);
    console.log(`    → Titres générés: ${results.test2.titles?.length || 0}`);
    console.log("█".repeat(70));
    
  } catch (err) {
    console.error("\n❌ ERREUR FATALE:", err.message);
    console.error(err.stack);
  }
}

main();
