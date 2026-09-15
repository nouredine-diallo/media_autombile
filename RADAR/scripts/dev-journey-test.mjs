// Test réel du parcours RADAR (login -> dashboard -> events -> brief -> pages
// annexes), chronométré à chaque étape. Aucun appel Groq (brief =
// extraction déterministe, pas de LLM). Usage : node scripts/dev-journey-test.mjs
import { chromium } from "playwright";

const BASE = process.env.RADAR_BASE_URL ?? "http://localhost:3000";
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
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("  [console error]", msg.text());
  });
  page.on("pageerror", (err) => console.log("  [page error]", err.message));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log(`  [HTTP ${res.status()}] ${res.url()}`);
  });

  console.log("=== 1. Login ===");
  await timed("Chargement /login", async () => {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  });
  await timed("Login (submit -> select-name)", async () => {
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/select-name`, { timeout: 15000 });
  });
  await timed("Sélection nom -> dashboard", async () => {
    await page.selectOption("#name", { index: 1 }); // premier membre de TEAM_MEMBERS
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  });

  console.log("\n=== 2. Dashboard ===");
  await timed("Rendu complet dashboard + statut pipeline client-side", async () => {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await page.waitForTimeout(500); // laisse le composant client PipelineStatusIndicator finir son fetch
  });
  await page.screenshot({ path: "scripts/.dashboard-screenshot.png", fullPage: true });
  const dashboardText = await page.textContent("body");
  console.log("  Longueur du texte rendu:", dashboardText?.length ?? 0, "caractères");
  console.log("  Capture: scripts/.dashboard-screenshot.png");

  console.log("\n=== 3. Liste des événements ===");
  await timed("Chargement /events", async () => {
    await page.goto(`${BASE}/events`, { waitUntil: "networkidle", timeout: 20000 });
  });

  console.log("\n=== 4. Créer un brief (gratuit, pas de LLM — extraction déterministe) ===");
  // Le seul bouton UI pour un event sans brief ("Brief + Article") déclenche
  // aussi la génération d'article (Groq) — appel direct de l'API dédiée
  // (generateBrief() utilise translateLocal.ts, jamais Groq) pour tester ce
  // chemin réel sans consommer de quota, comme convenu.
  const NO_BRIEF_EVENT_ID = Number(process.env.NO_BRIEF_EVENT_ID ?? 115143);
  await timed(`Chargement /events/${NO_BRIEF_EVENT_ID}`, async () => {
    await page.goto(`${BASE}/events/${NO_BRIEF_EVENT_ID}`, { waitUntil: "networkidle", timeout: 20000 });
  });
  const briefResult = await timed("POST /api/brief (extraction déterministe, sans LLM)", async () => {
    return page.evaluate(async (eventId) => {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      return { status: res.status, ok: res.ok, body: await res.json() };
    }, NO_BRIEF_EVENT_ID);
  });
  console.log(`  status=${briefResult.status} facts=${briefResult.body?.facts?.length ?? "n/a"}`);

  console.log("\n=== 5. Consulter un event avec brief existant (pas d'article) ===");
  const WITH_BRIEF_EVENT_ID = Number(process.env.WITH_BRIEF_EVENT_ID ?? 100595);
  await timed(`Chargement /events/${WITH_BRIEF_EVENT_ID}`, async () => {
    await page.goto(`${BASE}/events/${WITH_BRIEF_EVENT_ID}`, { waitUntil: "networkidle", timeout: 20000 });
  });

  if (process.env.GENERATE_ARTICLE === "1") {
    console.log("\n=== 5b. Génération d'article RÉELLE (1 appel Groq) ===");
    const articleResult = await timed(`POST /api/generate (event ${WITH_BRIEF_EVENT_ID}, brief -> article)`, async () => {
      return page.evaluate(async (eventId) => {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: eventId }),
        });
        const body = await res.json().catch(() => ({}));
        return { status: res.status, ok: res.ok, body };
      }, WITH_BRIEF_EVENT_ID);
    });
    console.log(`  status=${articleResult.status} ok=${articleResult.ok}`);
    console.log(`  article title: ${articleResult.body?.article?.title ?? articleResult.body?.error ?? "n/a"}`);
  }

  console.log("\n=== 6. Pages annexes (lecture seule) ===");
  for (const path of ["/ready", "/corrections", "/stats", "/partenaires", "/calendrier", "/drive"]) {
    await timed(`Chargement ${path}`, async () => {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 20000 });
      if (!res || !res.ok()) console.log(`  ⚠️  HTTP ${res?.status()} sur ${path}`);
    });
  }

  console.log("\n=== Résumé ===");
  const total = timings.reduce((s, t) => s + t.ms, 0);
  console.log(`Total: ${total}ms sur ${timings.length} étapes`);
  const slow = timings.filter((t) => t.ms > 2000);
  if (slow.length) {
    console.log("Étapes lentes (>2s):");
    for (const s of slow) console.log(`  - ${s.label}: ${s.ms}ms`);
  } else {
    console.log("Aucune étape au-dessus de 2s.");
  }
} finally {
  await browser.close();
}
