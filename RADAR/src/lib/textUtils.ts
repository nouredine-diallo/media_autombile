/**
 * Retire les balises HTML (et leurs attributs) d'un texte source RSS.
 * Trouvé le 2026-08-29 : un `<em data-start="407">...</em>` non nettoyé
 * dans `item.summary` traversait extractFacts() intact, et `verifyArticleAgainstBrief()`
 * extrayait `407` de l'attribut `data-start` comme si c'était un vrai chiffre
 * du brief — un article parfaitement correct se faisait alors signaler une
 * "anomalie" (chiffre manquant) qui n'était qu'un artefact de scraping.
 * Regex volontairement simple (pas de dépendance HTML parser — la stack est
 * figée, RADAR/CLAUDE.md §3) : supprime toute balise `<...>` en bloc, ce qui
 * élimine aussi bien la balise que les attributs qu'elle porte.
 *
 * Même bug, cause différente, trouvé le 17 sept. 2026 en analysant un vrai
 * run de pipeline (5 candidats du matin, 0 passé le contrôle qualité) :
 * `&#8217;` (apostrophe typographique encodée, très fréquente en RSS/
 * WordPress — "doesn&#8217;t") n'était pas dans la liste d'entités
 * ci-dessous. `extractNumbers()` lisait "8217" comme un vrai chiffre du
 * brief, absent de l'article généré (qui écrit normalement "doesn't"),
 * et déclenchait un faux rejet — confirmé sur 3 des 5 candidats de ce run.
 * Corrigé une fois pour toutes plutôt qu'entité par entité : décode toute
 * entité numérique HTML (`&#8217;` décimal, `&#x2019;` hexadécimal) vers
 * son caractère Unicode réel, en plus des entités nommées déjà gérées.
 *
 * Extraite de brief.ts (2026-09-17) vers ce module sans import — brief.ts
 * chaîne vers db.ts/llm.ts (imports relatifs sans extension), ce qui
 * empêche `node --experimental-strip-types` (le test runner du projet,
 * RADAR/CLAUDE.md §3 — pas de framework de test tiers) de résoudre le
 * module. Une fonction pure sans dépendance se teste sans ce problème.
 */
export function stripHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Trouvé le 17 sept. 2026 en analysant un vrai run de pipeline : les posts
 * "Green Deals" d'Electrek (compilations quotidiennes de bons plans —
 * powerstations, e-bikes, tondeuses robot, jamais des voitures) scoraient
 * régulièrement 40-48, dans la même fourchette que du vrai contenu auto,
 * et devenaient des candidats plausibles pour la génération automatique du
 * matin. Le flux RSS n'expose pas la vraie catégorie de l'article (le tag
 * `<category>` vaut toujours "News", vérifié par curl sur le flux réel —
 * la vraie catégorie "green-deals" n'existe que sur la page web elle-même,
 * pas dans le flux) : impossible de filtrer sur une métadonnée fiable.
 *
 * Signal trouvé à la place, mesuré sur 300 items réels d'Electrek : ces
 * compilations ont un format de titre reconnaissable — plusieurs produits
 * distincts énumérés, toujours terminé par ", more" — présent sur 23/300
 * items (7,7%), et sur AUCUN des 277 autres titres (vraie actu auto/EV,
 * y compris des articles parlant de remises/soldes légitimes comme
 * "Kia is offering big discounts on the EV9..." qui ne finit PAS par
 * ", more"). Zéro faux positif observé sur cet échantillon — pas une
 * garantie absolue, mais un signal net, pas un seuil inventé au hasard
 * (RADAR/CLAUDE.md §4.3).
 *
 * Ne couvre pas tout (ex. un post à un seul produit sans "more" final
 * passerait encore) — signalé explicitement plutôt que présenté comme un
 * filtre exhaustif de pertinence automobile, qui n'existe pas. Placée ici
 * (pas dans rss.ts) pour rester testable par `node --experimental-strip-types`
 * — même raison que stripHtml ci-dessus.
 */
export function isProductRoundup(title: string): boolean {
  return /,\s*more\.?$/i.test(title.trim());
}

/**
 * Nombres français écrits en toutes lettres (2 à 20) — trouvé en creusant un
 * échec réel de vérification (analyse "post garanti", 2026-09-09) : un
 * article correct disait « trois sources confirment » (convention
 * journalistique française usuelle pour les petits nombres), le brief
 * disait « 3 sources » en chiffre — deux formes du même fait, jamais
 * rapprochées par cette fonction, qui ne cherchait que des chiffres.
 * "un/une" et "neuf" volontairement exclus : le premier est l'article
 * indéfini le plus fréquent du français (faux positifs constants, "un SUV",
 * "une voiture"...), le second est l'adjectif "neuf/neuve" (véhicule neuf)
 * bien plus fréquent dans ce contexte automobile que le nombre neuf — deux
 * homographes trop risqués pour ce qu'ils apporteraient.
 */
const FRENCH_NUMBER_WORDS: Record<string, number> = {
  deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20,
};

/**
 * Trouvé le 17 sept. 2026 en analysant un vrai run de pipeline (candidat
 * McLaren, score 88 mais rejeté) : le brief dit "4000 emplois" (source
 * anglaise, pas de séparateur), l'article généré dit correctement "4 000
 * emplois" (convention typographique française — espace comme séparateur
 * de milliers). extractNumbers() lisait "4" et "000" comme deux nombres
 * séparés dans le texte de l'article (l'espace casse le motif `\d+`), donc
 * ni "4" ni "000" ne correspondait au "4000" du brief — faux rejet sur un
 * article par ailleurs exact. Normalise les groupes de milliers séparés
 * par une espace (normale, insécable, ou fine insécable — les trois formes
 * rencontrées en français) en un seul nombre avant toute extraction,
 * plutôt que de multiplier les motifs de regex un par un.
 */
function normalizeThousandsSeparators(text: string): string {
  return text.replace(/\d{1,3}(?:[   ]\d{3})+/g, (m) => m.replace(/[   ]/g, ''));
}

/**
 * Extrait tous les chiffres d'un texte (arabes, avec unité, ou écrits en
 * toutes lettres) — utilisée par le contrôle "le brief est la seule source
 * de vérité" (verification.ts). Placée ici (pas dans verification.ts, qui
 * chaîne vers db.ts/brief.ts) pour rester testable par
 * `node --experimental-strip-types` — même raison que stripHtml ci-dessus.
 */
export function extractNumbers(text: string): number[] {
  text = normalizeThousandsSeparators(text);
  const numbers: number[] = [];
  const patterns = [
    /\d+[\.,]?\d*/g,  // Basic numbers (e.g., 123, 12.5, 12,5)
    /\d+\s*%/g,       // Percentages
    /\d+\s*kWh/g,     // Battery capacity
    /\d+\s*km/g,      // Distance
    /\d+\s*ch(?:evaux)?/g,  // Horsepower
    /\d+\s*€/g,       // Prices in euros
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numStr = match[0].replace(/[^\d.,]/g, '').replace(',', '.');
      const num = parseFloat(numStr);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }

  const lower = text.toLowerCase();
  for (const [word, value] of Object.entries(FRENCH_NUMBER_WORDS)) {
    const wordPattern = new RegExp(`\\b${word}\\b`, 'g');
    if (wordPattern.test(lower)) {
      numbers.push(value);
    }
  }

  return [...new Set(numbers)];
}
