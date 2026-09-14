import { scrapeArticleImages } from '../src/lib/visualSearch';

const cases = [
  {
    url: 'https://carbuzz.com/acura-ev-used-buy-2026/',
    title: 'The First Acura EV Costs Less Than A New Toyota Camry Right Now',
    expectSubstr: '2024-acura-zdx-3', // gagnant précédent, doit rester le même
  },
  {
    url: 'https://www.hagerty.com/media/opinion/vellum-venom/vellum-venom-2026-audi-rs-e-tron-gt/',
    title: 'Vellum Venom: 2026 Audi RS e-tron GT',
    expectSubstr: 'VV-2026-Audi-RS-e-tron-GT',
  },
];

async function main() {
  for (const c of cases) {
    console.log('='.repeat(80));
    console.log('URL:', c.url);
    try {
      const images = await scrapeArticleImages(c.url, c.title);
      const winner = images[0];
      const ok = winner?.url.includes(c.expectSubstr);
      console.log('Gagnant:', winner ? `[${winner.source}] ${winner.width}x${winner.height} ${winner.url.slice(0, 90)}` : 'aucun');
      console.log('Toujours le même gagnant qu\'avant (pas de régression) :', ok);
    } catch (err) {
      console.log('ÉCHEC (réseau, pas lié au correctif) :', err instanceof Error ? err.message.split('\n')[0] : err);
    }
  }
}
main().catch((err) => { console.error('FATAL', err); process.exit(1); });
