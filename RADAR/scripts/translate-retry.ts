#!/usr/bin/env node
import { getDb } from '../src/lib/db';
import { translateToFrench } from '../src/lib/translate';

async function main() {
  const db = getDb();
  const rows = db.prepare('SELECT id, title, summary, title_fr FROM events ORDER BY id').all() as {
    id: number;
    title: string;
    summary: string | null;
    title_fr: string | null;
  }[];

  const untranslated = rows.filter(r => !r.title_fr || r.title_fr === r.title);
  console.log(`Found ${untranslated.length} untranslated events`);

  let translated = 0;
  const update = db.prepare('UPDATE events SET title_fr = ?, summary_fr = ? WHERE id = ?');

  for (const row of untranslated) {
    console.log(`\n[${row.id}] Translating: ${row.title.substring(0, 60)}...`);
    try {
      const result = await translateToFrench(row.title, row.summary);
      console.log(`  FR title: ${result.titleFr.substring(0, 70)}`);
      update.run(result.titleFr, result.summaryFr, row.id);
      translated++;
    } catch (err: unknown) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise(r => setTimeout(r, 12000));
  }

  console.log(`\nDone! Translated ${translated}/${untranslated.length} events`);
}

main().catch(console.error);
