import { translateTextLocal } from './translateLocal';

/**
 * Translate an event title and summary from English to French.
 *
 * Bascule sur le modèle de traduction local (2026-08-29) — c'était le
 * dernier appel LLM (Groq) restant pour de la traduction pure. Avantages
 * vérifiés : plus de risque de dérive/résumé inventé propre à un LLM
 * généraliste, plus de dépendance au quota Groq partagé (déjà épuisé une
 * fois pendant cette session), et une traduction dédiée est simplement
 * plus fiable pour cette tâche précise. Signature et comportement de repli
 * inchangés — aucun appelant à modifier.
 */
export async function translateToFrench(
  title: string,
  summary: string | null,
): Promise<{ titleFr: string; summaryFr: string }> {
  // If already mostly French, skip translation
  if (isMostlyFrench(title)) {
    return { titleFr: title, summaryFr: summary ?? '' };
  }

  const [titleFr, summaryFr] = await Promise.all([
    translateTextLocal(title),
    summary ? translateTextLocal(summary) : Promise.resolve(null),
  ]);

  // Jamais une dégradation silencieuse : si le modèle local échoue
  // (indisponible, erreur), on garde le texte anglais tel quel plutôt que
  // de produire une chaîne vide ou un faux résultat français.
  return {
    titleFr: titleFr ?? title,
    summaryFr: summaryFr ?? summary ?? '',
  };
}

/**
 * Quick check if a string is mostly French (heuristic).
 */
function isMostlyFrench(text: string): boolean {
  const frenchIndicators = [
    /\b(le|la|les|un|une|des|du|de|et|en|est|pour|avec|sur|pas|plus|cette|ces|aux|par|qui|que|dans|fait|mais|tout|être|avoir|son|ses|leur|leurs|nous|vous|ils|elles|on|se|ne|je|tu|il|elle|nous|vous|ils|elles)\b/gi,
  ];
  const englishIndicators = [
    /\b(the|is|are|was|were|has|have|had|will|would|could|should|may|might|can|shall|must|not|and|but|or|for|with|from|by|at|to|in|on|of|an|a|this|that|these|those|its|our|their|his|her|you|they|we|he|she|it)\b/gi,
  ];

  let frenchCount = 0;
  let englishCount = 0;

  for (const regex of frenchIndicators) {
    const matches = text.match(regex);
    if (matches) frenchCount += matches.length;
  }
  for (const regex of englishIndicators) {
    const matches = text.match(regex);
    if (matches) englishCount += matches.length;
  }

  // If more French words than English, probably already French
  return frenchCount > englishCount * 1.5;
}

/**
 * Batch-translate multiple events.
 * Returns a map of eventId → { titleFr, summaryFr }.
 */
export async function translateEvents(
  events: { id: number; title: string; summary: string | null }[]
): Promise<Map<number, { titleFr: string; summaryFr: string }>> {
  const results = new Map<number, { titleFr: string; summaryFr: string }>();

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < events.length; i += 5) {
    const batch = events.slice(i, i + 5);
    const translations = await Promise.all(
      batch.map(event => translateToFrench(event.title, event.summary))
    );

    for (let j = 0; j < batch.length; j++) {
      results.set(batch[j].id, translations[j]);
    }
  }

  return results;
}
