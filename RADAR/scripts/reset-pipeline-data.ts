/**
 * Réinitialisation complète demandée par l'utilisateur (2026-08-27, élargie
 * le 2026-08-28) : la première version ne vidait que le contenu du pipeline
 * d'ingestion. Nouvelle demande explicite — "réinitialise TOUTES les
 * données, événement, partenaire, ..." — pour repartir sur un outil neuf
 * avant présentation à la direction. Vide donc aussi partenaires,
 * calendrier, corrections/guide de style, stats et décisions d'articles.
 *
 * Conservé volontairement (configuration, pas du contenu) :
 * - `feeds` — sources RSS choisies par la rédaction (RADAR/CLAUDE.md §8),
 *   les revider casserait l'ingestion au prochain cron.
 * - `google_tokens`, `drive_files` — déjà vides (Drive non configuré) ; pas
 *   de config à perdre.
 *
 * Usage : npx tsx scripts/reset-pipeline-data.ts
 */
import { getDb } from '../src/lib/db';

const db = getDb();
const TABLES_TO_RESET = [
  'article_decisions',
  'articles',
  'briefs',
  'calendar_events',
  'corrections',
  'drive_files',
  'event_items',
  'event_tags',
  'events',
  'item_images',
  'items',
  'partner_posts',
  'partners',
  'pipeline_runs',
  'stats',
  'stats_imports',
  'style_rules',
];

db.pragma('foreign_keys = OFF');
for (const table of TABLES_TO_RESET) {
  const before = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;
  db.prepare(`DELETE FROM ${table}`).run();
  db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
  console.log(`${table}: ${before} -> 0`);
}
db.pragma('foreign_keys = ON');

const feedsCount = (db.prepare('SELECT COUNT(*) as c FROM feeds').get() as { c: number }).c;
console.log(`feeds conservés (configuration, pas du contenu): ${feedsCount}`);
