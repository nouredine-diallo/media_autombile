import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = true;
env.useBrowserCache = false;

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const items: Record<number, { title: string; summary: string }> = {
  1884: { title: 'Aragon Sprint Race: New 2026 MotoGP World Championship standings', summary: "New 2026 MotoGP World Championship standings after Saturday's Aragon Sprint race at MotorLand, round 13 of 22." },
  4562: { title: 'Aragon: New 2026 MotoGP World Championship standings', summary: "New 2026 MotoGP World Championship standings after Sunday's Aragon Grand Prix at MotorLand, round 13 of 22." },
  5241: { title: '2026 Formula 1 world championship standings after the Italian Grand Prix', summary: 'Andrea Kimi Antonelli has extended his championship lead at Monza' },
  5964: { title: 'Prix Mercedes VLE (2026). Gamme et équipements du monospace électrique premium', summary: "En attendant les fourgons utilitaires, Mercedes inaugure sa nouvelle famille de vans électriques avec le monospace VLE, qui offre jusqu'à 415 ch et plus de 600 km WLTP." },
  4853: { title: 'Prix Opel Corsa (2026). La GSE est dispo, le bon plan sportif électrique ?', summary: "La version GSE de l'Opel Corsa est disponible au prix de 39 990 €. La citadine électrique sportive de 280 ch." },
  6218: { title: 'Journées portes ouvertes des 12 et 13 septembre 2026. Toutes les offres de rentrée des constructeurs', summary: "Les journées portes ouvertes de septembre donnent lieu à une nouvelle salve d'offres commerciales." },
  5966: { title: 'FFVE. Un forum de l’emploi dédié aux métiers de la voiture ancienne', summary: 'La Fédération française des véhicules d’époque (FFVE) lance un site destiné aux professionnels et aux amateurs de vieilles mécaniques.' },
};

async function main() {
  console.log('Chargement du modèle...');
  const extractor: any = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
  console.log('Modèle chargé.\n');

  async function embed(text: string): Promise<number[]> {
    const output = await extractor(text, { pooling: 'cls', normalize: true });
    return Array.from(output.data) as number[];
  }

  const noPrefix: Record<number, number[]> = {};
  const withPrefix: Record<number, number[]> = {};
  for (const [id, it] of Object.entries(items)) {
    const text = `${it.title} ${it.summary}`.trim();
    noPrefix[Number(id)] = await embed(text);
    withPrefix[Number(id)] = await embed(`query: ${text}`);
  }

  const pairs: [number, number, string][] = [
    [1884, 4562, 'VRAI POSITIF probable (même weekend MotoGP Aragon, sprint vs GP)'],
    [1884, 5241, 'FAUX POSITIF (MotoGP vs F1, sport différent)'],
    [5964, 4853, 'FAUX POSITIF (Mercedes VLE prix vs Opel Corsa prix, gabarit "Prix X (Year)." partagé)'],
    [6218, 5966, 'FAUX POSITIF (portes ouvertes commerciales vs forum emploi FFVE, aucun rapport)'],
  ];

  console.log('Paire'.padEnd(70), 'SANS préfixe'.padEnd(15), 'AVEC "query: "');
  for (const [a, b, label] of pairs) {
    const simNo = cosine(noPrefix[a], noPrefix[b]);
    const simYes = cosine(withPrefix[a], withPrefix[b]);
    console.log(label.padEnd(70), simNo.toFixed(4).padEnd(15), simYes.toFixed(4));
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error('FATAL', err); process.exit(1); });
