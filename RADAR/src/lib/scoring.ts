import { getDb, Item, Event } from './db';
import { getEmbedding, cosineSimilarity, serializeEmbedding, deserializeEmbedding } from './embeddings';
import { autoTagEvent } from './auto-tag';
import { translateEvents } from './translate';

const SIMILARITY_THRESHOLD = 0.88;

// Hybrid clustering: embedding similarity + title word overlap
// Prevents all articles from the same feed collapsing into one event
/**
 * Ponctuation retirée avant comparaison (2026-08-28) — trouvé en réutilisant
 * cette fonction pour trier les images de carrousel par pertinence
 * (carousel-package/route.ts, Bug B) : un titre d'article corrompu en JSON
 * brut (`{"titre": "1968 Ford Mustang GT...`, bug de parsing antérieur à
 * cette session) faisait échouer le rapprochement "1968" à cause du guillemet
 * collé (`"1968` ≠ `1968`) — un même mot ignoré par une simple différence de
 * ponctuation. Re-vérifié sur les 13 titres réels ayant servi à calibrer
 * TITLE_OVERLAP_THRESHOLD (event 1919) : le score légitime max reste 0.429
 * et le score de faux positif max reste 0.333 après ce changement — le seuil
 * de 0.35 sépare toujours proprement les deux groupes, pas de recalibrage
 * nécessaire.
 */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(w => w.length > 3);
}

export function titleOverlap(a: string, b: string): number {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  for (const w of wordsA) { if (wordsB.has(w)) common++; }
  return common / Math.max(wordsA.size, wordsB.size);
}

/**
 * TODO: seuil provisoire (RADAR/CLAUDE.md §4.3 — à calibrer sur plus de
 * données réelles). Relevé de 0.15 à 0.35 le 2026-08-28 : un event réel
 * ("1968 Ford Mustang GT") avait fusionné 13 items totalement différents
 * (Cadillac, moteur détaché, 4 générations de Mustang distinctes, Ford
 * Bronco, un article sur un film...) — mesuré empiriquement sur ces 13
 * titres réels : le seul cas légitime (même sujet, même année, formulé
 * différemment) donne 0.429 ; tous les faux positifs se regroupent entre
 * 0.167 et 0.333 (le simple mot "Ford" commun suffisait à dépasser 0.15
 * sur des titres courts). 0.35 sépare proprement les deux groupes sur cet
 * échantillon, mais reste un seul point de données — à re-vérifier si de
 * vrais doublons formulés très différemment se retrouvent exclus à tort.
 */
const TITLE_OVERLAP_THRESHOLD = 0.35;

function shouldCluster(a: { embedding: number[]; title: string }, b: { embedding: number[]; title: string }): boolean {
  const sim = cosineSimilarity(a.embedding, b.embedding);
  const title = titleOverlap(a.title, b.title);
  // Both high → cluster. High embedding + low title → don't cluster (different topics, same source)
  return sim >= SIMILARITY_THRESHOLD && title >= TITLE_OVERLAP_THRESHOLD;
}

export async function embedUnprocessedItems(): Promise<number> {
  const db = getDb();
  const items = db.prepare('SELECT * FROM items WHERE embedding IS NULL AND is_duplicate = 0').all() as Item[];
  
  let embedded = 0;
  for (const item of items) {
    const text = `${item.title} ${item.summary || ''}`.trim();
    if (!text) continue;
    
    try {
      const embedding = await getEmbedding(text);
      if (!embedding) continue;
      db.prepare('UPDATE items SET embedding = ? WHERE id = ?').run(serializeEmbedding(embedding), item.id);
      embedded++;
    } catch (error) {
      console.error(`Error embedding item ${item.id}:`, error);
    }
  }
  
  return embedded;
}

export async function clusterItemsIntoEvents(): Promise<number> {
  const db = getDb();
  
  const itemsWithEmbeddings = db.prepare(
    'SELECT * FROM items WHERE embedding IS NOT NULL AND is_duplicate = 0 ORDER BY fetched_at DESC'
  ).all() as (Item & { embedding: string })[];
  
  if (itemsWithEmbeddings.length === 0) return 0;

  /**
   * Bug trouvé le 2026-08-28 : ce DELETE était inconditionnel — à CHAQUE
   * cycle de cron (toutes les 4h), TOUS les events étaient supprimés puis
   * reconstruits avec de nouveaux IDs, cassant le lien FK de tout article
   * ou brief déjà rattaché à un event (FK désactivées de force pour
   * contourner la protection). Confirmé en local : un event créé à 22h
   * (ID 729) n'existait plus après le cycle de minuit (nouvelle plage
   * 1118-1514) — le titre_fr traduit avec le correctif reasoning_effort
   * disparaissait donc aussi à chaque cycle. Zéro article orphelin trouvé
   * en prod au moment du diagnostic, mais uniquement par chance de timing
   * — le risque était réel pour le prochain cycle.
   *
   * Correctif : les events déjà rattachés à un article ou un brief ne sont
   * jamais supprimés ni reclusterisés ; seuls les items pas encore couverts
   * par un event protégé participent au (re)clustering.
   */
  const protectedEventIds = (db.prepare(`
    SELECT id FROM events
    WHERE id IN (SELECT event_id FROM articles)
       OR id IN (SELECT event_id FROM briefs)
  `).all() as { id: number }[]).map(r => r.id);

  const protectedItemIds = new Set<number>(
    protectedEventIds.length > 0
      ? (db.prepare(
          `SELECT item_id FROM event_items WHERE event_id IN (${protectedEventIds.map(() => '?').join(',')})`
        ).all(...protectedEventIds) as { item_id: number }[]).map(r => r.item_id)
      : []
  );

  const clusterableItems = itemsWithEmbeddings.filter(item => !protectedItemIds.has(item.id));
  if (clusterableItems.length === 0) return 0;

  // Ne supprime que les events NON protégés. FK désactivées le temps du
  // DELETE (comportement d'origine conservé) — stats_imports n'a en réalité
  // qu'un content_id texte informel, pas de vraie colonne event_id/FK
  // (vérifié sur le schéma, RADAR/src/lib/db.ts) : l'erreur "foreign key
  // mismatch" vue dans les logs vient d'ailleurs, pas de cette table.
  db.pragma('foreign_keys = OFF');
  if (protectedEventIds.length > 0) {
    const placeholders = protectedEventIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM event_items WHERE event_id NOT IN (${placeholders})`).run(...protectedEventIds);
    db.prepare(`DELETE FROM events WHERE id NOT IN (${placeholders})`).run(...protectedEventIds);
  } else {
    db.exec('DELETE FROM event_items');
    db.exec('DELETE FROM events');
  }
  db.pragma('foreign_keys = ON');

  const events: { title: string; summary: string; itemIds: number[]; score: number }[] = [];
  const assigned = new Set<number>();

  for (const item of clusterableItems) {
    if (assigned.has(item.id)) continue;
    
    const itemEmbedding = deserializeEmbedding(item.embedding);
    const cluster = { title: item.title, summary: item.summary || '', itemIds: [item.id], score: 0 };
    assigned.add(item.id);
    
    for (const other of clusterableItems) {
      if (assigned.has(other.id)) continue;
      
      const otherEmbedding = deserializeEmbedding(other.embedding);
      if (shouldCluster(
        { embedding: itemEmbedding, title: item.title },
        { embedding: otherEmbedding, title: other.title }
      )) {
        cluster.itemIds.push(other.id);
        assigned.add(other.id);
      }
    }
    
    events.push(cluster);
  }
  
  // Store events and associations
  const insertEvent = db.prepare(
    'INSERT INTO events (content_id, title, summary, source_count, score) VALUES (?, ?, ?, ?, ?)'
  );
  const insertEventItem = db.prepare(
    'INSERT INTO event_items (event_id, item_id) VALUES (?, ?)'
  );
  
  let eventCounter = 0;
  const storeEvents = db.transaction(() => {
    for (const event of events) {
      eventCounter++;
      const contentId = `LMA-EVT-${Date.now()}-${eventCounter}`;
      const result = insertEvent.run(
        contentId,
        event.title,
        event.summary,
        event.itemIds.length,
        0
      );
      const eventId = result.lastInsertRowid;
      for (const itemId of event.itemIds) {
        insertEventItem.run(eventId, itemId);
      }
    }
  });
  
  storeEvents();

  // Auto-tag all new events
  const allEvents = db.prepare('SELECT * FROM events').all() as Event[];
  for (const event of allEvents) {
    autoTagEvent(event.id, event.title, event.summary);
  }

  /**
   * Plafond par run (2026-08-30) — trouvé en prod : un backlog jamais
   * traduit (848 événements) a fait durer un seul cycle "toutes les 4h"
   * plus de 6h (04:00 → 10:05, mesuré dans pipeline_runs), faisant
   * manquer le déclenchement suivant (node-cron : "missed execution...
   * Possible blocking IO"). La traduction locale (CPU pur, pas de GPU sur
   * cette VM) est le vrai goulot, pas un bug ponctuel à corriger — chaque
   * run ne traite plus qu'un lot borné, le reste du backlog se rattrape
   * sur les cycles suivants au lieu de bloquer tout le pipeline d'un coup.
   * Les événements les plus récents (id décroissant) passent en premier :
   * `events.score` n'est pas encore calculé à ce stade du pipeline
   * (calculateScores() tourne après), la fraîcheur est le seul signal
   * disponible ici — cohérent avec RADAR/CLAUDE.md §11 (fraîcheur du flux
   * avant tout). TODO : valeur provisoire, jamais mesurée sur un vrai
   * historique de plusieurs jours (CLAUDE.md §4.3).
   */
  const TRANSLATE_BATCH_LIMIT = 100;

  // Translate event titles/summaries to French
  const untranslatedAll = allEvents.filter(e => !e.title_fr).sort((a, b) => b.id - a.id);
  const untranslated = untranslatedAll.slice(0, TRANSLATE_BATCH_LIMIT);
  if (untranslated.length > 0) {
    const remaining = untranslatedAll.length - untranslated.length;
    console.log(
      `Translating ${untranslated.length} events to French` +
      (remaining > 0 ? ` (${remaining} restants, prochains cycles)` : '') + '...'
    );
    const translations = await translateEvents(
      untranslated.map(e => ({ id: e.id, title: e.title, summary: e.summary }))
    );
    const updateFr = db.prepare('UPDATE events SET title_fr = ?, summary_fr = ? WHERE id = ?');
    for (const event of untranslated) {
      const t = translations.get(event.id);
      if (t) {
        updateFr.run(t.titleFr, t.summaryFr, event.id);
      }
    }
    console.log(`Translated ${translations.size} events`);
  }

  return events.length;
}

export function calculateScores(): void {
  const db = getDb();
  const events = db.prepare('SELECT * FROM events').all() as Event[];
  
  const updateScore = db.prepare('UPDATE events SET score = ? WHERE id = ?');
  
  for (const event of events) {
    const items = db.prepare(
      'SELECT i.* FROM items i JOIN event_items ei ON i.id = ei.item_id WHERE ei.event_id = ?'
    ).all(event.id) as Item[];
    
    const score = computeCompositeScore(items);
    updateScore.run(score, event.id);
  }
}

function computeCompositeScore(items: Item[]): number {
  const now = Date.now();
  let score = 0;
  
  // 1. Density: number of sources covering the event (0-35 points)
  const sourceCount = items.length;
  score += Math.min(sourceCount * 8, 35);
  
  // 2. Velocity: items published in last 24h (0-20 points)
  const recentItems = items.filter(item => {
    if (!item.published_at) return false;
    const pubDate = new Date(item.published_at).getTime();
    return (now - pubDate) < 24 * 60 * 60 * 1000;
  });
  score += Math.min(recentItems.length * 5, 20);
  
  // 3. Freshness: most recent item age (0-15 points)
  const mostRecent = items.reduce((latest, item) => {
    if (!item.published_at) return latest;
    const pubDate = new Date(item.published_at).getTime();
    return pubDate > latest ? pubDate : latest;
  }, 0);
  
  if (mostRecent > 0) {
    const hoursOld = (now - mostRecent) / (60 * 60 * 1000);
    if (hoursOld < 1) score += 15;
    else if (hoursOld < 6) score += 12;
    else if (hoursOld < 24) score += 8;
    else if (hoursOld < 72) score += 4;
  }
  
  // 4. Brand prestige: luxury/supercar/exclusive brands get higher bonus (0-20 points)
  const brandKeywords: { [key: string]: number } = {
    // Mass market (1 point each)
    'peugeot': 1, 'citroën': 1, 'ds': 1, 'renault': 1, 'toyota': 1, 'volkswagen': 1,
    'vw': 1, 'ford': 1, 'stellantis': 1, 'hyundai': 1, 'kia': 1, 'volvo': 1,
    'honda': 1, 'nissan': 1, 'opel': 1, 'fiat': 1, 'jeep': 1, 'skoda': 1,
    'seat': 1, 'cupra': 1, 'suzuki': 1, 'mazda': 1, 'subaru': 1, 'mitsubishi': 1,
    // Premium (2 points each)
    'bmw': 2, 'mercedes': 2, 'audi': 2, 'lexus': 2, 'acura': 2, 'infiniti': 2,
    'genesis': 2, 'porsche': 2, 'tesla': 2,
    // Luxury (3 points each)
    'maserati': 3, 'alfa romeo': 3, 'bentley': 3, 'rolls-royce': 3, 'aston martin': 3,
    'mclaren': 3, 'ferrari': 3, 'lamborghini': 3, 'bugatti': 3, 'pagani': 3,
    'koenigsegg': 3, 'rimac': 3, 'pininfarina': 3,
    // Electric startups (2 points each)
    'rivian': 2, 'lucid': 2, 'nio': 2, 'xpeng': 2, 'byd': 2, 'polestar': 2,
    'lotus': 2,
  };
  
  const combinedText = items.map(i => `${i.title} ${i.summary || ''}`).join(' ').toLowerCase();
  let brandScore = 0;
  for (const [brand, weight] of Object.entries(brandKeywords)) {
    if (combinedText.includes(brand)) {
      brandScore += weight;
    }
  }
  score += Math.min(brandScore, 20);
  
  // 5. Interest keywords: unusual/exclusive/rare content gets bonus (0-15 points)
  const interestKeywords = [
    'exclusive', 'first look', 'unveiled', 'debut', 'world premiere', 'prototype',
    'concept', 'one-off', 'limited edition', 'hypercar', 'supercar', 'electric',
    'autonomous', 'record', 'fastest', 'most powerful', 'most expensive',
    'rare', 'classic', 'vintage', 'heritage', 'anniversary',
  ];
  
  const interestMatches = interestKeywords.filter(kw => combinedText.includes(kw));
  score += Math.min(interestMatches.length * 3, 15);
  
  // 6. Source diversity: multiple different feed sources = more interesting (0-10 points)
  const uniqueFeeds = new Set(items.map(i => i.feed_id));
  score += Math.min(uniqueFeeds.size * 3, 10);
  
  return Math.min(score, 100);
}

export interface EventWithItems extends Event {
  items: Item[];
  feed_names: string[];
  tags: string[];
}

export function getEventsWithItems(limit: number = 50): EventWithItems[] {
  const db = getDb();
  const events = db.prepare(
    'SELECT * FROM events ORDER BY score DESC, last_updated_at DESC LIMIT ?'
  ).all(limit) as Event[];

  // Tags de tous les événements en un seul aller-retour, plutôt qu'un par
  // événement côté client (c'était 50 requêtes HTTP séquentielles sur la
  // page Veille — le vrai coût n'était pas la BDD mais le nombre d'allers-
  // retours réseau).
  const eventIds = events.map(e => e.id);
  const tagsByEvent: Record<number, string[]> = {};
  if (eventIds.length > 0) {
    const placeholders = eventIds.map(() => '?').join(',');
    const tagRows = db.prepare(
      `SELECT event_id, tag FROM event_tags WHERE event_id IN (${placeholders}) ORDER BY tag`
    ).all(...eventIds) as { event_id: number; tag: string }[];
    for (const row of tagRows) {
      (tagsByEvent[row.event_id] ??= []).push(row.tag);
    }
  }

  return events.map(event => {
    const items = db.prepare(
      'SELECT i.*, f.name as feed_name FROM items i JOIN event_items ei ON i.id = ei.item_id JOIN feeds f ON i.feed_id = f.id WHERE ei.event_id = ?'
    ).all(event.id) as (Item & { feed_name: string })[];

    const feedNames = [...new Set(items.map(i => i.feed_name))];

    return {
      ...event,
      items,
      feed_names: feedNames,
      tags: tagsByEvent[event.id] || [],
    };
  });
}
