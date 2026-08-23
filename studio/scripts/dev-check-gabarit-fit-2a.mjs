import { chromium } from "playwright";
const BASE="http://localhost:3000";
const browser=await chromium.launch();
const ctx=await browser.newContext(); ctx.setDefaultTimeout(180000); ctx.setDefaultNavigationTimeout(240000);
const page=await ctx.newPage();
await page.goto(`${BASE}/login`); await page.fill("#password", process.env.AUTH_PASSWORD);
await page.click('button[type="submit"]'); await page.waitForURL(`${BASE}/`);
for (const g of ["3a","2a","2b"]) {
  const r=await page.request.get(`${BASE}/api/images/cfaafbb2-339a-4173-aaa2-60fd3b115455/gabarit-fit?gabarit=${g}`);
  const b=await r.json();
  console.log(`${g.toUpperCase()} : ok=${b.ok}  ratios=${(b.ratios||[]).map(v=>(v*100).toFixed(1)+'%').join(', ')}`);
}
await browser.close();
