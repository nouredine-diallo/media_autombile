import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3002";
const PREFILL = "eyJ0IjoiVm9sa3N3YWdlbiBJRC4gUG9sbywgYW5ub25jw6llIGxlIDnigK9zZXB0ZW1icmXigK8yMDI2LCBzZXJhaXQgbGEgbWVpbGxldXJlIGNpdGFkaW5lIMOpbGVjdHJpcXVlIHNlbG9uIHRyb2lzIHNvdXJjZXMuIiwicyI6IkwnQXJndXMiLCJpIjoiaHR0cHM6Ly9pbWFnZXMubGFyZ3VzLmZyL3Bob3Rvcy1jbXMvMjAyNi85L3ZvbGtzd2FnZW4tSUQtUG9sby1HVEktY29uY2VwdC1jYW1vdWZsYWdlLXN0YXRpcXVlLTItYmQtNzY4eDUxMi5qcGciLCJjIjoiTE1BLUFSVC0xNzg5MzcxMjAyNjc4LWsycHZqIiwiYiI6IlZvbGtzd2FnZW4gSUQuIFBvbG_CoDogbGEgbWVpbGxldXJlIGNpdGFkaW5lIMOpbGVjdHJpcXVlwqA_IOKAlCAzIHNvdXJjZXMgY29uZmlybWVudCJ9";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const pw = page.locator('input[type="password"]');
  if (await pw.count()) {
    await pw.fill("work");
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 8000 }),
      page.locator('button[type="submit"]').first().click(),
    ]);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await login(page);
  await page.goto(`${BASE}/titres/carrousel?prefill=${PREFILL}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  const CTRL = 'div[title="Glisser pour déplacer, molette ou pincement pour zoomer"]';
  const count = await page.locator(CTRL).count();
  console.log("Contrôles de recadrage trouvés sur la page carrousel :", count);

  if (count > 0) {
    const ctrl = page.locator(CTRL).first();
    const img = page.locator('[data-gabarit] img').first();
    const before = await img.evaluate((el) => getComputedStyle(el).transform).catch(() => "N/A");
    const box = await ctrl.boundingBox();
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    const after = await img.evaluate((el) => getComputedStyle(el).transform).catch(() => "N/A");
    console.log("transform avant:", before);
    console.log("transform après molette:", after);
    console.log("Le zoom fonctionne sur la slide 1 du carrousel :", before !== after);
  } else {
    const bodyText = await page.locator("body").innerText();
    console.log("=== corps de page (800 premiers car.) ===");
    console.log(bodyText.slice(0, 800));
  }
  console.log("erreurs:", errors.join("\n") || "(aucune)");
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
