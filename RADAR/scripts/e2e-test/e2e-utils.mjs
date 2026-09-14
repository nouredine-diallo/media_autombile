import { chromium } from 'playwright';

const SHOT_DIR = '/tmp/claude-1000/-home-land-media-autombile/4bd1e535-af39-49d4-93cc-4f46fe84475f/scratchpad/shots';
import fs from 'fs';
fs.mkdirSync(SHOT_DIR, { recursive: true });

export async function newSession() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text());
  });
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  return { browser, context, page };
}

export async function shot(page, name) {
  const path = `${SHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log('screenshot:', path);
}

export async function dumpButtons(page) {
  const buttons = await page.$$eval('button, a[href]', els =>
    els
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        tag: el.tagName,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        href: el.getAttribute('href') || undefined,
      }))
      .filter(b => b.text)
  );
  console.log(JSON.stringify(buttons, null, 1));
}

export async function loginRadar(page, baseUrl, password, name) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/select-name/, { timeout: 10000 });
  await page.selectOption('select[name="name"]', name);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('select-name') && !url.pathname.includes('login'), { timeout: 10000 });
}
