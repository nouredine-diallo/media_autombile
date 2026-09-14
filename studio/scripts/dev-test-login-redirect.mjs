import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3002";
const PREFILL = "eyJ0IjoiVm9sa3N3YWdlbiBJRC4gUG9sbywgYW5ub25jw6llIGxlIDnigK9zZXB0ZW1icmXigK8yMDI2LCBzZXJhaXQgbGEgbWVpbGxldXJlIGNpdGFkaW5lIMOpbGVjdHJpcXVlIHNlbG9uIHRyb2lzIHNvdXJjZXMuIiwicyI6IkwnQXJndXMiLCJpIjoiaHR0cHM6Ly9pbWFnZXMubGFyZ3VzLmZyL3Bob3Rvcy1jbXMvMjAyNi85L3ZvbGtzd2FnZW4tSUQtUG9sby1HVEktY29uY2VwdC1jYW1vdWZsYWdlLXN0YXRpcXVlLTItYmQtNzY4eDUxMi5qcGciLCJjIjoiTE1BLUFSVC0xNzg5MzcxMjAyNjc4LWsycHZqIiwiYiI6IlZvbGtzd2FnZW4gSUQuIFBvbG_CoDogbGEgbWVpbGxldXJlIGNpdGFkaW5lIMOpbGVjdHJpcXVlwqA_IOKAlCAzIHNvdXJjZXMgY29uZmlybWVudCJ9";

async function main() {
  const browser = await chromium.launch();
  // Contexte tout neuf, aucun cookie — reproduit exactement le scénario
  // signalé : premier accès STUDIO depuis RADAR, pas de session existante.
  const page = await browser.newPage();

  const target = `/titres/carrousel?prefill=${PREFILL}`;
  await page.goto(`${BASE}${target}`, { waitUntil: "networkidle" });
  console.log("1/ Redirigé vers /login avec next= :", page.url());
  const url = new URL(page.url());
  console.log("   next capturé :", url.searchParams.get("next")?.slice(0, 60) + "...");

  await page.fill('input[type="password"]', "work");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 8000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(500);
  console.log("2/ Atterri après connexion sur :", page.url());
  const onCarrousel = page.url().includes("/titres/carrousel") && page.url().includes("prefill=");
  console.log("3/ Sur l'écran carrousel pré-rempli (pas l'accueil) :", onCarrousel);

  const bodyText = await page.locator("body").innerText();
  console.log("4/ Contenu pré-rempli visible (Volkswagen) :", bodyText.includes("Volkswagen"));

  await browser.close();
}

main().catch((err) => { console.error("FATAL", err); process.exit(1); });
