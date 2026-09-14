import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('http://studio.89.168.53.133.nip.io/login', { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('input[type="password"]', 'work');
await page.click('button[type="submit"]');
await page.waitForTimeout(1000);

const filePath = '/home/land/media_autombile/studio/public/test/fixtures/A_fond_voiture.jpg';
const buffer = fs.readFileSync(filePath);

const resp = await page.request.post('http://studio.89.168.53.133.nip.io/api/images/upload', {
  multipart: {
    image: { name: 'A_fond_voiture.jpg', mimeType: 'image/jpeg', buffer },
  },
});
console.log('status:', resp.status());
const json = await resp.json();
console.log(JSON.stringify(json.crop, null, 2));
await browser.close();
