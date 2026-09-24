import { getDb, Item, Event } from './db';
import { getEmbedding, cosineSimilarity, serializeEmbedding, deserializeEmbedding } from './embeddings';
import { autoTagEvent } from './auto-tag';
import { translateEventsIsolated as translateEvents } from './translateEventsIsolated';

/**
 * Recalibré 0.88 → 0.955 le 2026-09-14 (analyse "clustering — vraie source du
 * problème") : 0.88 n'avait jamais été recalibré sur données réelles depuis le
 * tout premier commit (`git log -S SIMILARITY_THRESHOLD`, un seul résultat) —
 * un seuil "par défaut" jamais vérifié, exactement ce que CLAUDE.md §4.3
 * interdit.
 *
 * Cause racine identifiée (pas supposée) : `Xenova/multilingual-e5-small` sur
 * du texte court, même domaine (actu auto/moto), même langue, produit une
 * similarité cosinus compressée dans une plage haute — même DEUX sujets sans
 * aucun rapport (ex. offres portes-ouvertes vs forum emploi FFVE) obtiennent
 * ~0.90-0.92. 0.88 se situe DANS ce plancher de bruit, donc ne filtre
 * quasiment rien — vérifié sur des faux positifs réels déjà fusionnés en
 * base : deals gadgets (event 110597, tondeuse robot + batteries + vélo
 * électrique), MotoGP fusionné avec F1 (events 110758/110731), listicles
 * "voitures marquantes de tel salon" fusionnant des enchères différentes
 * (event 110980) — un problème bien plus large que les 2 flux (Bring a
 * Trailer, L'Argus) documentés lors de la précédente analyse.
 *
 * Hypothèse testée et INFIRMÉE (`scripts/test-e5-prefix.ts`, jamais présumée
 * vraie) : la fiche officielle du modèle (huggingface.co/intfloat/
 * multilingual-e5-small) exige un préfixe "query: "/"passage: " sur le texte
 * — absent ici. Réappliqué et re-testé sur 4 paires réelles : la similarité
 * des faux positifs augmente LÉGÈREMENT avec le préfixe (ex. 0.8959→0.9130),
 * ne resserre pas l'écart. Le préfixe n'est donc pas la cause — pas appliqué.
 *
 * Calibré sur 19 paires réelles tirées de la base de production (9 vrais
 * positifs confirmés manuellement — même sujet, sources différentes — et 10
 * faux positifs déjà fusionnés à tort) : vrais positifs 0.9621-0.9904, faux
 * positifs 0.8947-0.9483. Écart net et sans chevauchement sur cet
 * échantillon → seuil posé au milieu (0.955). TODO: seuil provisoire
 * (CLAUDE.md §4.3) — 19 paires, pas des centaines ; à resurveiller sur les
 * prochains cycles réels. Un flux au gabarit très répétitif et proche du
 * plancher de faux positifs (Bring a Trailer, mesuré à 0.978 en interne, soit
 * AU-DESSUS de ce nouveau seuil) resterait mal filtré par ce changement seul —
 * désactivé séparément (feeds.enabled=0), ne pas réactiver sur la seule foi
 * de ce correctif.
 */
const SIMILARITY_THRESHOLD = 0.955;

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

/**
 * `excludeWords` (optionnel, vide par défaut — aucun changement de
 * comportement pour les appelants existants comme `carousel-package/route.ts`) :
 * mots à retirer avant de comparer, voir `computeFeedTemplateWords()`
 * ci-dessous pour le cas d'usage (gabarit de titre répété au sein d'un même
 * flux).
 */
export function titleOverlap(a: string, b: string, excludeWords: ReadonlySet<string> = EMPTY_WORD_SET): number {
  const wordsA = new Set(tokenize(a).filter(w => !excludeWords.has(w)));
  const wordsB = new Set(tokenize(b).filter(w => !excludeWords.has(w)));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  for (const w of wordsA) { if (wordsB.has(w)) common++; }
  return common / Math.max(wordsA.size, wordsB.size);
}

const EMPTY_WORD_SET: ReadonlySet<string> = new Set();

/**
 * Finding "post garanti" (analyse 2026-09-09) : les deux événements aux
 * meilleurs scores du jour (72 et 67, les deux seuls candidats testés par
 * l'auto-génération matinale) se sont révélés être des faux positifs de
 * clustering, vérifiés sur les vraies données — pas une supposition :
 * - Flux Pebble Beach (WordPress) : 10 annonces de voitures DIFFÉRENTES
 *   (Aston Martin, Acura, Audi, Bentley, BMW ×2, Bugatti, Eccentrica, Karma,
 *   Ken Okuyama) fusionnées en un seul "événement", uniquement parce que
 *   chaque titre suit le gabarit "<Marque> – <Modèle>: See it on our 2026
 *   Concept Lawn" — "2026", "Concept", "Lawn" passent le seuil de
 *   chevauchement (0.35) alors qu'ils ne distinguent RIEN entre les items.
 * - Flux Bring a Trailer (annonces de vente aux enchères, pas des news) : 5
 *   Corvette de DIFFÉRENTES années (1964/1993/1967/1996/1966) fusionnées en
 *   un seul "événement" pour la même raison structurelle (gabarit d'annonce
 *   répété : "This <year> Chevrolet Corvette convertible...").
 *
 * Conséquence directe mesurée : les 2 événements aux scores artificiellement
 * gonflés (nombre de sources trompeur) sont systématiquement les 2 candidats
 * choisis par `runMorningAutoGeneration()` (top score), avec un brief
 * incohérent (plusieurs sujets mélangés) qui ne peut satisfaire le contrôle
 * qualité — d'où l'échec systématique observé, sans lien avec la traduction
 * ni avec un manque d'actualité intéressante.
 *
 * Correctif : les mots présents dans une grande part des titres d'UN MÊME
 * flux, dans le même cycle, sont un gabarit de ce flux — pas un sujet
 * distinctif — et sont retirés du calcul de chevauchement UNIQUEMENT entre
 * items du même flux (le rapprochement inter-flux, qui capture la vraie
 * corroboration multi-source, garde son comportement actuel inchangé).
 * TODO: seuil provisoire (RADAR/CLAUDE.md §4.3) — 40% choisi par analogie
 * avec la marge déjà mesurée pour TITLE_OVERLAP_THRESHOLD (écart net entre
 * les gabarits confirmés ci-dessus, à ~90-100% de récurrence dans leur
 * flux, et un mot réellement distinctif qui ne devrait apparaître que dans
 * une minorité des titres d'un flux) ; à recalibrer si un vrai flux à
 * faible volume se retrouve sur-filtré.
 */
const FEED_TEMPLATE_WORD_RATIO = 0.4;
const MIN_ITEMS_FOR_TEMPLATE_DETECTION = 3;

function computeFeedTemplateWords(items: { feed_id: number; title: string }[]): Map<number, Set<string>> {
  const byFeed = new Map<number, string[]>();
  for (const item of items) {
    if (!byFeed.has(item.feed_id)) byFeed.set(item.feed_id, []);
    byFeed.get(item.feed_id)!.push(item.title);
  }

  const templateWordsByFeed = new Map<number, Set<string>>();
  for (const [feedId, titles] of byFeed) {
    if (titles.length < MIN_ITEMS_FOR_TEMPLATE_DETECTION) continue;

    const docFrequency = new Map<string, number>();
    for (const title of titles) {
      for (const word of new Set(tokenize(title))) {
        docFrequency.set(word, (docFrequency.get(word) || 0) + 1);
      }
    }

    const templateWords = new Set<string>();
    for (const [word, count] of docFrequency) {
      if (count / titles.length >= FEED_TEMPLATE_WORD_RATIO) templateWords.add(word);
    }
    if (templateWords.size > 0) templateWordsByFeed.set(feedId, templateWords);
  }
  return templateWordsByFeed;
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

function shouldCluster(
  a: { embedding: number[]; title: string; feed_id: number },
  b: { embedding: number[]; title: string; feed_id: number },
  templateWordsByFeed: Map<number, Set<string>>,
): boolean {
  const sim = cosineSimilarity(a.embedding, b.embedding);
  // Le gabarit d'un flux (ex. Pebble Beach : "... : See it on our 2026
  // Concept Lawn") n'a de sens à retirer QUE lorsqu'on compare deux items du
  // MÊME flux — c'est précisément là qu'il pollue le chevauchement sans
  // rien distinguer. Entre deux flux différents, un mot commun reste un
  // signal valide (corroboration multi-source), comportement inchangé.
  const excludeWords = a.feed_id === b.feed_id ? (templateWordsByFeed.get(a.feed_id) ?? EMPTY_WORD_SET) : EMPTY_WORD_SET;
  const title = titleOverlap(a.title, b.title, excludeWords);
  // Both high → cluster. High embedding + low title → don't cluster (different topics, same source)
  return sim >= SIMILARITY_THRESHOLD && title >= TITLE_OVERLAP_THRESHOLD;
}

/**
 * Nombre d'items non embeddés au dernier appel de `embedUnprocessedItems()`
 * faute de modèle disponible — lu par cron.ts pour remonter un signal
 * visible dans `pipeline_runs.error` (finding D1) SANS bloquer le
 * clustering/scoring des items déjà embeddés lors de cycles précédents :
 * un throw ici arrêterait aussi `clusterItemsIntoEvents()` pour le cycle en
 * cours même si la grande majorité des items ont un embedding valide —
 * remplacerait une dégradation silencieuse par une régression différente.
 */
let lastEmbeddingSkipCount = 0;

export function getLastEmbeddingSkipCount(): number {
  return lastEmbeddingSkipCount;
}

export async function embedUnprocessedItems(): Promise<number> {
  const db = getDb();
  const items = db.prepare('SELECT * FROM items WHERE embedding IS NULL AND is_duplicate = 0').all() as Item[];

  let embedded = 0;
  let skipped = 0;
  for (const item of items) {
    const text = `${item.title} ${item.summary || ''}`.trim();
    if (!text) continue;

    try {
      const embedding = await getEmbedding(text);
      if (!embedding) {
        skipped++;
        continue;
      }
      db.prepare('UPDATE items SET embedding = ? WHERE id = ?').run(serializeEmbedding(embedding), item.id);
      embedded++;
    } catch (error) {
      console.error(`Error embedding item ${item.id}:`, error);
    }
  }

  lastEmbeddingSkipCount = skipped;
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
  //
  // Trouvé le 24 sept. 2026 (audit robustesse) : ce DELETE tournait hors
  // transaction, séparé de la réinsertion (`clearAndStoreEvents`, plus bas) par tout
  // le calcul de clustering. Un crash pile entre les deux (le scénario OOM
  // killer déjà documenté ailleurs dans ce projet, studio/CLAUDE.md) vidait
  // la table events jusqu'au prochain cycle (4-12h) sans que rien ne le
  // signale comme un état anormal. `foreign_keys` ne peut pas être changé
  // DANS une transaction SQLite active (restriction du moteur, pas un choix)
  // — la pragma reste donc hors transaction, mais le DELETE et la
  // réinsertion sont maintenant dans la MÊME transaction (voir plus bas) :
  // soit les deux réussissent, soit aucun n'est appliqué.
  db.pragma('foreign_keys = OFF');

  // Calcul de clustering pur (aucune écriture DB) — ne lit que
  // `clusterableItems`, déjà chargé en mémoire, jamais la table `events`
  // elle-même. Peut donc se faire avant le DELETE sans risque : le DELETE et
  // la réinsertion qui suivent n'ont plus qu'à s'exécuter, dans la même
  // transaction, sans calcul entre les deux qui pourrait laisser la fenêtre
  // de crash ouverte.
  const templateWordsByFeed = computeFeedTemplateWords(clusterableItems);

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
        { embedding: itemEmbedding, title: item.title, feed_id: item.feed_id },
        { embedding: otherEmbedding, title: other.title, feed_id: other.feed_id },
        templateWordsByFeed,
      )) {
        cluster.itemIds.push(other.id);
        assigned.add(other.id);
      }
    }

    events.push(cluster);
  }

  // Nettoyage + réinsertion dans UNE SEULE transaction (voir note plus haut
  // sur la pragma foreign_keys, qui reste volontairement hors transaction) :
  // soit le nettoyage et la réinsertion réussissent tous les deux, soit
  // aucun n'est appliqué — plus jamais de fenêtre où la table events peut
  // rester vidée par un crash entre les deux.
  const insertEvent = db.prepare(
    'INSERT INTO events (content_id, title, summary, source_count, score) VALUES (?, ?, ?, ?, ?)'
  );
  const insertEventItem = db.prepare(
    'INSERT INTO event_items (event_id, item_id) VALUES (?, ?)'
  );

  let eventCounter = 0;
  const clearAndStoreEvents = db.transaction(() => {
    if (protectedEventIds.length > 0) {
      const placeholders = protectedEventIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM event_items WHERE event_id NOT IN (${placeholders})`).run(...protectedEventIds);
      db.prepare(`DELETE FROM events WHERE id NOT IN (${placeholders})`).run(...protectedEventIds);
    } else {
      db.exec('DELETE FROM event_items');
      db.exec('DELETE FROM events');
    }

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

  clearAndStoreEvents();
  db.pragma('foreign_keys = ON');

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
   *
   * Famine trouvée le 23 sept. 2026 (retour utilisateur réel, event 185475
   * toujours en anglais 4 jours après sa création) : le tri "plus récents
   * (id décroissant) d'abord" ne garantissait AUCUNE progression sur le
   * backlog — chaque cycle qui ingère plus de 100 nouveaux événements fait
   * repasser les anciens derrière les nouveaux, indéfiniment (constaté :
   * 2195/2296 événements non traduits, 2176 avec un id plus récent que
   * l'événement bloqué). Corrigé en réservant une moitié du plafond aux plus
   * récents (fraîcheur du flux, RADAR/CLAUDE.md §11) et l'autre moitié aux
   * plus anciens du backlog (garantit une progression bornée et déterministe
   * quel que soit le rythme d'ingestion — plus jamais de famine permanente).
   * TODO : plafond total toujours provisoire, jamais mesuré sur un vrai
   * historique de plusieurs jours (CLAUDE.md §4.3).
   */
  const TRANSLATE_BATCH_LIMIT = 100;
  const TRANSLATE_NEWEST_SHARE = Math.floor(TRANSLATE_BATCH_LIMIT / 2);

  // Translate event titles/summaries to French
  const untranslatedAll = allEvents.filter(e => !e.title_fr).sort((a, b) => b.id - a.id);
  const newestBatch = untranslatedAll.slice(0, TRANSLATE_NEWEST_SHARE);
  const oldestBatch = untranslatedAll
    .slice(TRANSLATE_NEWEST_SHARE)
    .sort((a, b) => a.id - b.id)
    .slice(0, TRANSLATE_BATCH_LIMIT - newestBatch.length);
  const untranslated = [...newestBatch, ...oldestBatch];
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

/**
 * Trouvé le 23 sept. 2026 (retour utilisateur réel, 6 événements urgents en
 * erreur "Événement non trouvé" en prod) : la fiche événement cherchait l'id
 * dans les 50 meilleurs événements (`getEventsWithItems`, trié par score) —
 * un événement urgent (article en draft depuis longtemps) n'a aucune raison
 * d'être dans ce top 50 par score. Lookup direct par id, sans filtre de score
 * ni limite, pour que toute fiche événement existante reste accessible.
 */
export function getEventWithItemsById(id: number): EventWithItems | null {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Event | undefined;
  if (!event) return null;

  const items = db.prepare(
    'SELECT i.*, f.name as feed_name FROM items i JOIN event_items ei ON i.id = ei.item_id JOIN feeds f ON i.feed_id = f.id WHERE ei.event_id = ?'
  ).all(event.id) as (Item & { feed_name: string })[];

  const feedNames = [...new Set(items.map(i => i.feed_name))];

  const tags = db.prepare('SELECT tag FROM event_tags WHERE event_id = ? ORDER BY tag').all(event.id) as { tag: string }[];

  return {
    ...event,
    items,
    feed_names: feedNames,
    tags: tags.map(t => t.tag),
  };
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
