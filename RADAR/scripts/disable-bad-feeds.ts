import { getDb } from '../src/lib/db';

/**
 * Désactiver les flux RSS non-automobiles.
 * Exécuter avec : npx tsx scripts/disable-bad-feeds.ts
 *
 * Ces flux retournnent du contenu général (design, architecture, tech)
 * au lieu de contenu automobile. Ils polluent le pipeline.
 */

const BAD_FEED_PATTERNS = [
  { pattern: 'designboom.com', reason: 'Feed général design/architecture, pas auto' },
  { pattern: 'dezeen.com', reason: 'Feed général architecture/design, pas auto' },
];

function disableBadFeeds() {
  const db = getDb();

  console.log('🔍 Recherche de flux non-automobiles...\n');

  let disabled = 0;

  for (const { pattern, reason } of BAD_FEED_PATTERNS) {
    const feeds = db.prepare(
      'SELECT id, name, url, enabled FROM feeds WHERE url LIKE ?'
    ).all(`%${pattern}%`) as { id: number; name: string; url: string; enabled: number }[];

    for (const feed of feeds) {
      if (feed.enabled === 0) {
        console.log(`   ⏭️  ${feed.name} ( déjà désactivé)`);
        continue;
      }

      db.prepare('UPDATE feeds SET enabled = 0 WHERE id = ?').run(feed.id);
      console.log(`   ❌ ${feed.name} — ${feed.url}`);
      console.log(`      Raison: ${reason}`);
      disabled++;
    }
  }

  console.log(`\n📊 Résultat: ${disabled} flux désactivés`);

  // Afficher les flux actifs restants
  const active = db.prepare(
    'SELECT name, priority, enabled FROM feeds ORDER BY priority, name'
  ).all() as { name: string; priority: number; enabled: number }[];

  console.log('\n📋 Flux actifs:');
  for (const feed of active) {
    const status = feed.enabled === 1 ? '✅' : '❌';
    console.log(`   ${status} ${feed.name} (p${feed.priority})`);
  }
}

disableBadFeeds();
