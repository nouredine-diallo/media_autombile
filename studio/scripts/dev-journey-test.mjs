// Test réel du parcours STUDIO (login -> titres -> pages), chronométré.
// Aucun appel Groq dans cette passe (génération de titre exclue, gate à part).
import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3002";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) {
  console.error("AUTH_PASSWORD manquant (source .env.local d'abord).");
  process.exit(1);
}

const timings = [];
function mark(label, ms) {
  timings.push({ label, ms });
  const flag = ms > 3000 ? "🔴" : ms > 1000 ? "🟡" : "🟢";
  console.log(`${flag} ${label}: ${ms}ms`);
}
async function timed(label, fn) {
  const start = Date.now();
  const result = await fn();
  mark(label, Date.now() - start);
  return result;
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("response", (res) => {
    if (res.status() >= 400) console.log(`  [HTTP ${res.status()}] ${res.url()}`);
  });
  page.on("pageerror", (err) => console.log("  [page error]", err.message));

  console.log("=== 1. Login ===");
  await timed("Chargement /login", async () => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  });
  await timed("Login (submit -> accueil)", async () => {
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  });

  console.log("\n=== 2. Parcours création (sans génération LLM) ===");
  await timed("Chargement /titres (page d'accueil du parcours)", async () => {
    await page.goto(`${BASE}/titres`, { waitUntil: "networkidle", timeout: 20000 });
  });

  console.log("\n=== 3. Gabarits (aperçu, sans export) ===");
  await timed("Chargement /gabarits/1a", async () => {
    const res = await page.goto(`${BASE}/gabarits/1a`, { waitUntil: "networkidle", timeout: 20000 });
    if (!res || !res.ok()) console.log(`  ⚠️  HTTP ${res?.status()}`);
  });

  console.log("\n=== 4. Pipeline (page de suivi) ===");
  await timed("Chargement /pipeline", async () => {
    const res = await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle", timeout: 20000 });
    if (!res || !res.ok()) console.log(`  ⚠️  HTTP ${res?.status()}`);
  });

  console.log("\n=== Résumé ===");
  const total = timings.reduce((s, t) => s + t.ms, 0);
  console.log(`Total: ${total}ms sur ${timings.length} étapes`);
  const slow = timings.filter((t) => t.ms > 2000);
  console.log(slow.length ? `Étapes lentes (>2s): ${slow.map((s) => s.label).join(", ")}` : "Aucune étape au-dessus de 2s.");
} finally {
  await browser.close();
}
