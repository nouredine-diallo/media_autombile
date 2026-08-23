import { generate } from './llm';

/**
 * Translate an event title and summary from English to French.
 * Uses the LLM for natural journalistic translation (not word-for-word).
 */
export async function translateToFrench(
  title: string,
  summary: string | null
): Promise<{ titleFr: string; summaryFr: string }> {
  // If already mostly French, skip translation
  if (isMostlyFrench(title)) {
    return { titleFr: title, summaryFr: summary ?? '' };
  }

  const prompt = `Tu es un rédacteur automobile francophone expert. Traduis ce titre et ce résumé d'actualité automobile en français journalistique.

RÈGLES :
- Traduction naturelle, PAS mot à mot
- Conserve les noms propres (Toyota, WEC, Le Mans, etc.)
- Conserve les termes techniques anglais courants en automobile (restylage, facelift, drift)
- Le titre doit être accrocheur et concis (max 120 caractères)
- Le résumé doit être factuel et complet
- Vouvoiement

TITRE EN ANGLAIS :
${title}

RÉSUMÉ EN ANGLAIS :
${summary || '(pas de résumé)'}

Réponds UNIQUEMENT avec le format :
TITRE: [titre en français]
RÉSUMÉ: [résumé en français]`;

  try {
    const response = await generate({
      prompt,
      maxTokens: 500,
      temperature: 0.2,
    });

    const content = response.content;
    const titleMatch = content.match(/TITRE:\s*(.+)/i);
    const summaryMatch = content.match(/RÉSUMÉ:\s*(.+)/i);

    const titleFr = titleMatch?.[1]?.trim() || title;
    const summaryFr = summaryMatch?.[1]?.trim() || summary || '';

    // If title wasn't translated (still same as input), retry once
    if (titleFr === title && !isMostlyFrench(title)) {
      return translateToFrench(title, summary);
    }

    return { titleFr, summaryFr };
  } catch (error: unknown) {
    // Retry on rate limit
    if (error instanceof Error && error.message.includes('429')) {
      console.log('  Rate limited, waiting 10s and retrying...');
      await new Promise(r => setTimeout(r, 10000));
      return translateToFrench(title, summary);
    }
    console.error('Translation error:', error);
    return { titleFr: title, summaryFr: summary ?? '' };
  }
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
