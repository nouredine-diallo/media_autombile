import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3002";

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

async function lancerExport(page, imageCadre) {
  return page.evaluate(async (imageCadre) => {
    const r = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gabaritId: "1a",
        fieldValues: {
          imageUrl: "/test/placeholder-photo.jpg",
          title: "Test export recadrage",
          ...(imageCadre ? { imageCadre } : {}),
        },
      }),
    });
    return r.json();
  }, imageCadre);
}

async function attendre(page, jobId) {
  for (let i = 0; i < 40; i++) {
    const job = await page.evaluate(async (id) => (await fetch(`/api/export/${id}`)).json(), jobId);
    if (job.status === "done") return job;
    if (job.status === "error") throw new Error("job error: " + JSON.stringify(job));
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("timeout attente job " + jobId);
}

async function telecharger(page, jobId) {
  const buf = await page.evaluate(async (id) => {
    const r = await fetch(`/api/export/${id}/download`);
    const ab = await r.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  }, jobId);
  return Buffer.from(buf);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await login(page);

  console.log("Lancement export SANS recadrage...");
  const sans = await lancerExport(page, null);
  console.log("Lancement export AVEC recadrage (zoom 1.8, décalé)...");
  const avec = await lancerExport(page, "1.800,25.00,15.00");

  if (!sans.jobId || !avec.jobId) {
    console.log("Réponse export inattendue:", sans, avec);
    await browser.close();
    return;
  }

  const jobSans = await attendre(page, sans.jobId);
  const jobAvec = await attendre(page, avec.jobId);
  console.log("statuts:", jobSans.status, jobAvec.status);

  const pngSans = await telecharger(page, sans.jobId);
  const pngAvec = await telecharger(page, avec.jobId);
  console.log("Taille PNG sans recadrage:", pngSans.length, "octets");
  console.log("Taille PNG avec recadrage:", pngAvec.length, "octets");
  console.log("Les deux PNG sont DIFFÉRENTS (le recadrage a un effet réel sur l'export) :", Buffer.compare(pngSans, pngAvec) !== 0);

  await browser.close();
}

main().catch((err) => { console.error("FATAL", err.message); process.exit(1); });
