import { getDb, Item, Event } from './db';
import { generateCarouselParagraphs } from './llm';
import { translateTextLocal } from './translateLocal';

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
 */
function stripHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

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

/**
 * Traduit et met en cache une fois par item (title_fr/summary_fr/content_fr,
 * colonnes nullable — voir migration db.ts). extractFacts()/generateBody()
 * recopiaient ces champs RSS bruts tels quels, jamais traduits : seul le
 * titre/résumé de l'EVENT passait par translateToFrench() — trouvé le
 * 2026-08-29 ("le brief est à moitié en anglais"). Paresseux : appelé
 * uniquement quand un humain ouvre réellement une fiche événement
 * (generateBrief n'est jamais appelé en masse pendant le cron), donc le
 * coût (quelques secondes par item, modèle local) reste borné à ce qui est
 * vraiment consulté, jamais à tous les événements ingérés.
 */
async function ensureItemTranslated(db: ReturnType<typeof getDb>, item: Item): Promise<Item> {
  if (item.title_fr && item.summary_fr !== undefined && item.content_fr !== undefined) {
    return item;
  }

  const [titleFr, summaryFr, contentFr] = await Promise.all([
    item.title_fr ?? translateTextLocal(item.title),
    item.summary_fr ?? (item.summary ? translateTextLocal(item.summary) : Promise.resolve(null)),
    item.content_fr ?? (item.content ? translateTextLocal(item.content) : Promise.resolve(null)),
  ]);

  db.prepare('UPDATE items SET title_fr = ?, summary_fr = ?, content_fr = ? WHERE id = ?')
    .run(titleFr, summaryFr, contentFr, item.id);

  return { ...item, title_fr: titleFr, summary_fr: summaryFr, content_fr: contentFr };
}

export async function generateBrief(eventId: number): Promise<Brief | null> {
  const db = getDb();

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Event | undefined;
  if (!event) return null;

  const rawItems = db.prepare(
    'SELECT i.*, f.name as feed_name FROM items i JOIN event_items ei ON i.id = ei.item_id JOIN feeds f ON i.feed_id = f.id WHERE ei.event_id = ? ORDER BY i.published_at DESC'
  ).all(eventId) as (Item & { feed_name: string })[];

  if (rawItems.length === 0) return null;

  // Traduction paresseuse, une fois par item (voir ensureItemTranslated) —
  // faite ici, pas dans extractFacts/generateBody, pour rester la seule
  // frontière async de tout le module (le reste demeure la composition
  // synchrone par assemblage de texte voulue à l'origine, RADAR/CLAUDE.md
  // "le brief est bâti sur les faits, pas généré par IA").
  const translatedItems = await Promise.all(rawItems.map((item) => ensureItemTranslated(db, item))) as (Item & { feed_name: string })[];

  // Nettoyage HTML — une seule fois ici, avant toute construction du brief
  // (extractFacts/generateHeadline/generateLede/generateBody en dépendent
  // tous) plutôt que dans chaque fonction séparément.
  const items = translatedItems.map((item) => ({
    ...item,
    title: stripHtml(item.title),
    title_fr: item.title_fr ? stripHtml(item.title_fr) : item.title_fr,
    summary: item.summary ? stripHtml(item.summary) : item.summary,
    summary_fr: item.summary_fr ? stripHtml(item.summary_fr) : item.summary_fr,
    content: item.content ? stripHtml(item.content) : item.content,
    content_fr: item.content_fr ? stripHtml(item.content_fr) : item.content_fr,
  }));

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
    // *_fr : traduction locale mise en cache par ensureItemTranslated().
    // Repli sur le texte anglais brut si la traduction n'est pas encore
    // disponible (modèle en cours de chargement, ou échec) — jamais un
    // brief vide plutôt qu'un brief encore partiellement en anglais.
    const text = `${item.title_fr || item.title || ''} ${item.summary_fr || item.summary || ''} ${item.content_fr || item.content || ''}`.trim();
    
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
  // Titre français si disponible — bug trouvé le 2026-08-29 en testant
  // réellement un brief : cette fonction gardait event.title (anglais) même
  // quand event.title_fr existait déjà (generateLede(), juste plus bas,
  // faisait bien ce choix — incohérence entre les deux, pas un oubli général).
  let headline = event.title_fr || event.title;
  
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
    .map(i => i.summary_fr || i.summary)
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

/**
 * TODO: seuil provisoire (RADAR/CLAUDE.md §4.3 — jamais un seuil métier définitif
 * sans données réelles). Mesuré sur la distribution réelle de `events.score` au
 * 2026-08-27 (565 événements, une fois le bug de scoring silencieux corrigé —
 * voir plan §"chantier 3") : min 11, médiane 17, p25 28, top 10% 50, top 5 80.
 * 40 se situe nettement au-dessus de la médiane (donc ne développe pas un
 * événement banal en plusieurs slides) sans exiger le niveau des 2 auto-générés
 * du matin (~74+, réservé au tout meilleur du jour) — à recalibrer une fois des
 * retours éditoriaux réels disponibles sur ce qui "mérite" plusieurs slides.
 */
export const DEV_SLIDE_PERTINENCE_THRESHOLD = 40;

export interface BriefSlides {
  /** Paragraphes courts (1-3) générés par LLM pour les slides 1B — jamais le brief brut. */
  dev: string[];
  /** false si l'événement n'a pas atteint le seuil de pertinence — le carrousel reste hook + CTA. */
  pertinent: boolean;
}

/**
 * Retourne les slides de développement (gabarit 1B) d'un carrousel, mais
 * seulement si l'événement est assez pertinent pour mériter d'être développé
 * — pas uniquement s'il y a du texte à disposition. Sous le seuil, retourne
 * `{ dev: [], pertinent: false }` sans jamais appeler le LLM (coût nul).
 *
 * Décision 2026-08-27 : `brief.body` n'est pas un texte de post (concaténation
 * déterministe de faits/résumés, voir `generateBody()`, jamais réécrite par
 * un LLM) — l'afficher tel quel sur un carrousel afficherait du texte de
 * brief brut, dense. Le texte réellement montré vient de
 * `generateCarouselParagraphs()` (1 appel LLM, court par construction — voir
 * `lib/llm.ts`), mis en cache dans `briefs.carousel_text` pour qu'une
 * relecture de la même actu ne repaie jamais un second appel.
 */
export async function getCarouselSlides(eventId: number): Promise<BriefSlides | null> {
  const db = getDb();

  const event = db.prepare('SELECT score FROM events WHERE id = ?').get(eventId) as { score: number } | undefined;
  const brief = getBrief(eventId);
  if (!event || !brief) return null;

  const pertinent = event.score >= DEV_SLIDE_PERTINENCE_THRESHOLD;
  if (!pertinent) return { dev: [], pertinent: false };

  const cached = db.prepare('SELECT carousel_text FROM briefs WHERE event_id = ?').get(eventId) as { carousel_text: string | null } | undefined;
  if (cached?.carousel_text) {
    return { dev: JSON.parse(cached.carousel_text), pertinent: true };
  }

  const dev = await generateCarouselParagraphs(brief);
  db.prepare('UPDATE briefs SET carousel_text = ? WHERE event_id = ?').run(JSON.stringify(dev), eventId);

  return { dev, pertinent: true };
}
