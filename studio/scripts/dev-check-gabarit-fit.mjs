import { chromium } from "playwright";
const BASE="http://localhost:3000";
const browser=await chromium.launch();
const ctx=await browser.newContext(); ctx.setDefaultTimeout(180000); ctx.setDefaultNavigationTimeout(240000);
const page=await ctx.newPage();
await page.goto(`${BASE}/login`); await page.fill("#password", process.env.AUTH_PASSWORD);
await page.click('button[type="submit"]'); await page.waitForURL(`${BASE}/`);
const CAS = process.env.CAS ? JSON.parse(process.env.CAS) : [["test33 (bon fond)","18eca05f-4828-4168-a264-121bcb75de80"],["test1 (mauvais fond)","d091d713-d54d-4c9f-9a5d-450cb97d7fe9"]];
for (const [nom,id] of CAS) {
  const r=await page.request.get(`${BASE}/api/images/${id}/gabarit-fit?gabarit=3a`);
  const b=await r.json();
  console.log(`\n--- ${nom} ---\n  ok=${b.ok}  ratios=${(b.ratios||[]).map(v=>(v*100).toFixed(1)+'%').join(', ')}`);
  console.log('  '+b.message);
}
await browser.close();
