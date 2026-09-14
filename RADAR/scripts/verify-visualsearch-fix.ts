/**
 * Vérifie le vrai code de production (scrapeArticleImages, pas une copie de
 * simulation) sur le cas réel A35 AMG — confirme que le correctif 1
 * (résolution réelle og:image) fonctionne bien une fois appliqué au fichier
 * réel, pas juste dans le script de simulation.
 */
import { scrapeArticleImages } from '../src/lib/visualSearch';

async function main() {
  const url = 'https://carbuzz.com/a35-amg-used-bargain-september-2026/';
  const title = 'A35 AMG: The Compact AMG Sedan You Can Buy For Less Than A New Toyota Camry';

  console.log('Scraping (vrai code de production)...');
  const images = await scrapeArticleImages(url, title);
  console.log(`\n${images.length} images retournées, triées par score décroissant.`);
  console.log('\nTop 3 :');
  for (const img of images.slice(0, 3)) {
    console.log(`  [${img.source}] ${img.width}x${img.height} ${img.url.slice(0, 90)}`);
  }

  const winner = images[0];
  const isCorrect = winner?.url.includes('19c0171_062');
  const isBmw = winner?.url.includes('bmw-m235i');
  console.log('\n=== VERDICT ===');
  console.log('Image choisie contient "19c0171_062" (vraie A35 AMG) :', isCorrect);
  console.log('Image choisie contient "bmw-m235i" (bug) :', isBmw);
  process.exit(isCorrect && !isBmw ? 0 : 1);
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
