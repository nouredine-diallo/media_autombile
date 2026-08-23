/**
 * One-shot script: translate all existing events to French.
 * Run: npx tsx scripts/translate-events.ts
 */
import { getDb } from '../src/lib/db';
import { translateEvents } from '../src/lib/translate';

async function main() {
  const db = getDb();
  const events = db.prepare(
    'SELECT id, title, summary FROM events WHERE title_fr IS NULL'
  ).all() as { id: number; title: string; summary: string | null }[];

  if (events.length === 0) {
    console.log('All events already translated.');
    return;
  }

  console.log(`Translating ${events.length} events...`);
  const translations = await translateEvents(events);

  const update = db.prepare('UPDATE events SET title_fr = ?, summary_fr = ? WHERE id = ?');
  let count = 0;
  for (const event of events) {
    const t = translations.get(event.id);
    if (t) {
      update.run(t.titleFr, t.summaryFr, event.id);
      count++;
      console.log(`  ✓ ${event.title.slice(0, 50)} → ${t.titleFr.slice(0, 50)}`);
    }
  }

  console.log(`Done: ${count}/${events.length} events translated.`);
}

main().catch(console.error);
