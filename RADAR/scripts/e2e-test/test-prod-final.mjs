import { chromium, devices } from 'playwright';

const browser = await chromium.launch({ headless: true });

// 1) Vérifier qu'il y a du contenu dès l'arrivée
const desktop = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const p1 = await desktop.newPage();
await p1.goto('http://89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 20000 });
await p1.fill('input[type="password"]', 'work');
await p1.click('button[type="submit"]');
await p1.waitForTimeout(1200);
if (p1.url().includes('select-name')) { await p1.locator('button').first().click(); await p1.waitForTimeout(800); }
await p1.goto('http://89.168.53.133.nip.io/', { waitUntil: 'networkidle', timeout: 20000 });
await p1.waitForTimeout(500);
const text = await p1.locator('body').innerText();
console.log('--- accueil prod (extrait) ---');
console.log(text.slice(0, 250));
await p1.screenshot({ path: 'scripts/e2e-test/output-visuels/prod-final-desktop.png', fullPage: true });

// 2) Vérifier le mobile en prod
const iphone = devices['iPhone 13'];
const mobileCtx = await browser.newContext({ ...iphone });
const p2 = await mobileCtx.newPage();
await p2.goto('http://89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 20000 });
await p2.fill('input[type="password"]', 'work');
await p2.click('button[type="submit"]');
await p2.waitForTimeout(1200);
await p2.goto('http://89.168.53.133.nip.io/', { waitUntil: 'networkidle', timeout: 20000 });
await p2.waitForTimeout(500);
const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
console.log('mobile horizontal scroll (prod):', overflow);
await p2.screenshot({ path: 'scripts/e2e-test/output-visuels/prod-final-mobile.png', fullPage: true });

await browser.close();
