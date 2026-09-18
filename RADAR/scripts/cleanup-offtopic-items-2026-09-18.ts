import { getDb } from '../src/lib/db';
import { isProductRoundup, isWebinarAnnouncement } from '../src/lib/textUtils';

/**
 * Nettoyage rétroactif (18 sept. 2026) — les 2 filtres non-automobile
 * (Electrek "Green Deals" + Charged EVs "webinaires") n'existaient pas
 * quand ces items ont été ingérés. Ils sont toujours en base, forment des
 * events, et au moins un a produit un article réel (event 120867, brouillon
 * score 53). Exécuter avec : npx tsx scripts/cleanup-offtopic-items-2026-09-18.ts
 *
 * Convention réutilisée (cacheCleanup.ts) : jamais de suppression physique
 * d'un item — `is_duplicate = 1` (traçabilité, RADAR/CLAUDE.md §6). Un event
 * n'est supprimé que s'il est backé à 100% par des items hors-sujet ET n'a
 * ni article ni brief — mêmes conditions que `cleanupOldEvents()`. Un event
 * qui a déjà un article/brief réel n'est jamais supprimé automatiquement :
 * affiché en fin de script pour décision humaine explicite (RADAR/CLAUDE.md
 * §10 — pas de suppression de contenu généré sans validation).
 */

interface ItemRow { id: number; title: string; }
interface EventRow { id: number; title: string; score: number; }

function main() {
  const db = getDb();

  const allItems = db.prepare('SELECT id, title FROM items WHERE is_duplicate = 0').all() as ItemRow[];
  const offTopicItems = allItems.filter((i) => isProductRoundup(i.title) || isWebinarAnnouncement(i.title));
  console.log(`Items hors-sujet trouvés (non déjà archivés) : ${offTopicItems.length} / ${allItems.length}`);

  if (offTopicItems.length === 0) {
    console.log('Rien à nettoyer.');
    db.close();
    return;
  }

  const offTopicIds = offTopicItems.map((i) => i.id);
  const placeholders = offTopicIds.map(() => '?').join(',');

  // 1) Archive les items (jamais de DELETE, cf. convention cacheCleanup.ts).
  const archiveResult = db.prepare(
    `UPDATE items SET is_duplicate = 1 WHERE id IN (${placeholders})`
  ).run(...offTopicIds);
  console.log(`Items archivés (is_duplicate = 1) : ${archiveResult.changes}`);

  // 2) Événements entièrement backés par ces items.
  const linkedEventIds = (db.prepare(
    `SELECT DISTINCT event_id FROM event_items WHERE item_id IN (${placeholders})`
  ).all(...offTopicIds) as { event_id: number }[]).map((r) => r.event_id);

  const safeToDelete: number[] = [];
  const needsHumanDecision: { event: EventRow; hasArticle: boolean; hasBrief: boolean }[] = [];

  for (const eventId of linkedEventIds) {
    const itemIds = (db.prepare('SELECT item_id FROM event_items WHERE event_id = ?').all(eventId) as { item_id: number }[])
      .map((r) => r.item_id);
    const allOffTopic = itemIds.every((id) => offTopicIds.includes(id));
    if (!allOffTopic) continue; // event mixte (au moins un item légitime) — on ne touche jamais à ça ici.

    const hasArticle = (db.prepare('SELECT COUNT(*) as c FROM articles WHERE event_id = ?').get(eventId) as { c: number }).c > 0;
    const hasBrief = (db.prepare('SELECT COUNT(*) as c FROM briefs WHERE event_id = ?').get(eventId) as { c: number }).c > 0;
    const event = db.prepare('SELECT id, title, score FROM events WHERE id = ?').get(eventId) as EventRow;

    if (hasArticle || hasBrief) {
      needsHumanDecision.push({ event, hasArticle, hasBrief });
    } else {
      safeToDelete.push(eventId);
    }
  }

  // 3) Supprime les events sûrs (100% hors-sujet, aucun article/brief) — même
  // contournement FK que cleanupOldEvents() (foreign key mismatch connu sur
  // ce schéma).
  db.pragma('foreign_keys = OFF');
  let eventsDeleted = 0;
  try {
    for (const eventId of safeToDelete) {
      db.prepare('DELETE FROM event_items WHERE event_id = ?').run(eventId);
      const result = db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
      eventsDeleted += result.changes;
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
  console.log(`Événements hors-sujet supprimés (0 article, 0 brief) : ${eventsDeleted}`);

  if (needsHumanDecision.length > 0) {
    console.log(`\n⚠️  ${needsHumanDecision.length} événement(s) hors-sujet ont déjà un article et/ou un brief réel — NON supprimés automatiquement, décision humaine requise :`);
    for (const { event, hasArticle, hasBrief } of needsHumanDecision) {
      console.log(` - event ${event.id} "${event.title}" (score ${event.score}) — article=${hasArticle} brief=${hasBrief}`);
    }
  }

  db.close();
}

main();
