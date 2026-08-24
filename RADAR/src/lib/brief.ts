import { getDb, Item, Event } from './db';

export interface Fact {
  text: string;
  source_url: string | null;
  source_title: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface Brief {
  id: number;
  event_id: number;
  headline: string;
  lede: string;
  body: string;
  facts: Fact[];
  angle_suggestion: string;
  generated_at?: string;
}

export function generateBrief(eventId: number): Brief | null {
  const db = getDb();
  
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Event | undefined;
  if (!event) return null;
  
  const items = db.prepare(
    'SELECT i.*, f.name as feed_name FROM items i JOIN event_items ei ON i.id = ei.item_id JOIN feeds f ON i.feed_id = f.id WHERE ei.event_id = ? ORDER BY i.published_at DESC'
  ).all(eventId) as (Item & { feed_name: string })[];
  
  if (items.length === 0) return null;
  
  // Extract facts from items
  const facts = extractFacts(items);
  
  // Generate headline from event title
  const headline = generateHeadline(event, items);
  
  // Generate lede (first paragraph)
  const lede = generateLede(event, items, facts);
  
  // Generate body
  const body = generateBody(event, items, facts);
  
  // Suggest angle
  const angle_suggestion = suggestAngle(event, items, facts);
  
  const brief: Brief = {
    id: 0,
    event_id: eventId,
    headline,
    lede,
    body,
    facts,
    angle_suggestion,
  };

  // Store brief in database
  brief.id = storeBrief(brief);

  return brief;
}

function extractFacts(items: Item[]): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  
  for (const item of items) {
    const text = `${item.title || ''} ${item.summary || ''} ${item.content || ''}`.trim();
    
    // Extract sentences that contain key information
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      
      // Skip if too short or already seen
      if (trimmed.length < 15 || seen.has(trimmed.toLowerCase())) continue;
      
      // Check if sentence contains verifiable information
      if (containsVerifiableInfo(trimmed)) {
        seen.add(trimmed.toLowerCase());
        facts.push({
          text: trimmed,
          source_url: item.url,
          source_title: item.title,
          confidence: assessConfidence(trimmed, item),
        });
      }
    }
  }
  
  return facts.slice(0, 10); // Limit to 10 facts
}

function containsVerifiableInfo(sentence: string): boolean {
  const patterns = [
    /\d+/, // Numbers
    /lance|annonce|introduit|dévoile|présente/i, // Launch words
    /prix|tarif|coût/i, // Price words
    /km|kilomètre|miles/i, // Distance
    /kW|chevaux|hp|cv/i, // Power
    / batteries?|électrique|hybride/i, // Powertrain
    /sécurité|ncap|crash/i, // Safety
    /vendu|vente|chiffre/i, // Sales
  ];
  
  return patterns.some(pattern => pattern.test(sentence));
}

function assessConfidence(sentence: string, item: Item): 'high' | 'medium' | 'low' {
  // Higher confidence for official sources and specific data
  if (item.feed_name && (item.feed_name.includes('Corporate') || item.feed_name.includes('Official'))) {
    return 'high';
  }
  
  if (/\d+/.test(sentence) && /annonce|lance|introduit/i.test(sentence)) {
    return 'high';
  }
  
  if (/selon|d'après|source/i.test(sentence)) {
    return 'medium';
  }
  
  return 'medium';
}

function generateHeadline(event: Event, items: Item[]): string {
  // Use event title as base, clean it up
  let headline = event.title;
  
  // If multiple sources, mention it
  if (event.source_count > 1) {
    headline = `${headline} — ${event.source_count} sources confirment`;
  }
  
  return headline;
}

function generateLede(event: Event, items: Item[], facts: Fact[]): string {
  const mostRecent = items[0];
  const publishDate = mostRecent.published_at 
    ? new Date(mostRecent.published_at).toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      })
    : 'récemment';
  
  const sources = [...new Set(items.map(i => i.feed_name))];
  const sourceText = sources.length > 1 
    ? `${sources.length} sources` 
    : sources[0];
  
  // Utiliser le titre français si disponible
  const titleFr = event.title_fr || event.title;
  
  return `${titleFr}. Cette information, rapportée par ${sourceText}, a été confirmée le ${publishDate}.`;
}

function generateBody(event: Event, items: Item[], facts: Fact[]): string {
  const paragraphs: string[] = [];
  
  const summaries = items
    .filter(i => i.summary && i.summary.length > 20)
    .map(i => i.summary)
    .slice(0, 2);
  
  // Premier paragraphe : faits principaux (en français)
  if (facts.length > 0) {
    const mainFacts = facts.slice(0, 3).map(f => f.text).join('. ');
    paragraphs.push(mainFacts + '.');
  }
  
  // Deuxième paragraphe : contexte des sources
  if (summaries.length > 0) {
    paragraphs.push(summaries.join(' '));
  }
  
  // Troisième paragraphe : détails supplémentaires
  if (facts.length > 3) {
    const additionalFacts = facts.slice(3, 6).map(f => f.text).join('. ');
    paragraphs.push(additionalFacts + '.');
  }
  
  return paragraphs.join('\n\n');
}

function suggestAngle(event: Event, items: Item[], facts: Fact[]): string {
  const angles: string[] = [];
  
  // Check for new product launches
  if (facts.some(f => /lance|introduit|dévoile|nouveau/i.test(f.text))) {
    angles.push('Focus sur les caractéristiques techniques et le positionnement marché');
  }
  
  // Check for price information
  if (facts.some(f => /prix|tarif|€|euros/i.test(f.text))) {
    angles.push('Mise en avant du positionnement tarifaire et de la concurrence');
  }
  
  // Check for sales/market data
  if (facts.some(f => /vente|chiffre|marché|part/i.test(f.text))) {
    angles.push('Analyse de l\'impact sur le marché automobile');
  }
  
  // Check for technology/innovation
  if (facts.some(f => /technologie|innovation|électrique|autonome/i.test(f.text))) {
    angles.push('Focus sur l\'innovation technologique');
  }
  
  if (angles.length === 0) {
    angles.push('Article d\'information générale sur l\'événement');
  }
  
  return angles[0];
}

function storeBrief(brief: Brief): number {
  const db = getDb();

  const result = db.prepare(`
    INSERT OR REPLACE INTO briefs (event_id, headline, lede, body, facts, angle_suggestion)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    brief.event_id,
    brief.headline,
    brief.lede,
    brief.body,
    JSON.stringify(brief.facts),
    brief.angle_suggestion
  );

  return Number(result.lastInsertRowid);
}

export function getBrief(eventId: number): Brief | null {
  const db = getDb();

  const row = db.prepare('SELECT * FROM briefs WHERE event_id = ?').get(eventId) as any;
  if (!row) return null;

  return {
    id: row.id,
    event_id: row.event_id,
    headline: row.headline,
    lede: row.lede,
    body: row.body,
    facts: JSON.parse(row.facts || '[]'),
    angle_suggestion: row.angle_suggestion,
    generated_at: row.generated_at,
  };
}
