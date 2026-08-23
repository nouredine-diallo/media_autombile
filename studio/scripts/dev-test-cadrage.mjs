// Vérifie que le cadrage (zoom + recadrage dans la bulle) agit réellement et
// part au rendu — et surtout qu'il rend le débordement plus lisible, ce qui
// est la raison d'être du zoom.
import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:4100";
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
c.setDefaultTimeout(240_000); c.setDefaultNavigationTimeout(240_000);
const p = await c.newPage();
await p.goto(`${BASE}/login`); await p.fill("#password", process.env.AUTH_PASSWORD);
await p.click('button[type="submit"]'); await p.waitForURL(`${BASE}/`);
await p.goto(`${BASE}/titres`, { waitUntil: "networkidle" });
await p.setInputFiles('input[type="file"]', ["test33.jpeg", "test31.webp", "test32.webp"]);
await p.waitForSelector("text=/Fond compatible|laisse peu/", { timeout: 240_000 });

const ap = p.locator("div.relative.overflow-hidden.rounded-xl").first();
const bb = await ap.boundingBox();
const clip = { x: bb.x - 10, y: bb.y - 10, width: bb.width + 20, height: bb.height + 20 };

// Bulle droite : centre 68 % x 30,8 %
const bx = bb.x + bb.width * 0.68, by = bb.y + bb.height * 0.308;
await p.mouse.move(bx, by); await p.waitForTimeout(300);
await p.screenshot({ path: "test/cadrage-1-avant.png", clip });

// Zoom à la molette
for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
await p.waitForTimeout(300);
await p.screenshot({ path: "test/cadrage-2-zoom.png", clip });

// Le lien d'ajustement n'apparaît qu'une fois un titre choisi : on lit donc
// la transformation appliquée à l'image de la bulle, qui est la preuve
// directe que le cadrage agit sur le montage.
const transforms = await p.evaluate(() =>
  [...document.querySelectorAll('[data-gabarit] img')].map((n) => getComputedStyle(n).transform),
);
const zoomes = transforms.filter((t) => t !== "none" && !t.startsWith("matrix(1, 0, 0, 1"));
console.log(`images transformées par le cadrage : ${zoomes.length}`);
zoomes.forEach((t) => console.log("   " + t));
await b.close();
