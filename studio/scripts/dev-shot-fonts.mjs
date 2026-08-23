import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD;
if (!PASSWORD) { console.error("no password"); process.exit(1); }

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/`);
await page.goto(`${BASE}/dev-font-compare`, { waitUntil: "networkidle" });
await page.screenshot({ path: "test/font-compare.png", fullPage: true });
await browser.close();
