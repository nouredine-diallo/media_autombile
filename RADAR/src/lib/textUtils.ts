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
