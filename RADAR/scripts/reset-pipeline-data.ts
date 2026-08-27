/**
 * Réinitialisation demandée par l'utilisateur (2026-08-27) : vider les
 * actualités/articles accumulés pendant les tests de cette session pour
 * repartir sur des données propres avant une démonstration. Garde la
 * configuration (feeds, partenaires, calendrier, corrections/guide de style,
 * connexions Drive) — seul le contenu du pipeline d'ingestion est vidé.
 *
 * Usage : npx tsx scripts/reset-pipeline-data.ts
 */
import { getDb } from '../src/lib/db';

const db = getDb();
const TABLES_TO_RESET = ['articles', 'briefs', 'event_items', 'events', 'item_images', 'items', 'pipeline_runs'];

db.pragma('foreign_keys = OFF');
for (const table of TABLES_TO_RESET) {
  const before = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;
  db.prepare(`DELETE FROM ${table}`).run();
  db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
  console.log(`${table}: ${before} -> 0`);
}
db.pragma('foreign_keys = ON');

const feedsCount = (db.prepare('SELECT COUNT(*) as c FROM feeds').get() as { c: number }).c;
const partnersCount = (db.prepare('SELECT COUNT(*) as c FROM partners').get() as { c: number }).c;
console.log(`feeds conservés: ${feedsCount}`);
console.log(`partenaires conservés: ${partnersCount}`);
