import { getDb } from '../src/lib/db';

/**
 * Ajoute les vraies sources françaises confirmées (2026-08-27) — la config
 * précédente n'avait aucune source francophone alignée sur la ligne
 * éditoriale du Média Automobile (Société/Fait-divers, Sport/Business,
 * Industrie/Tech, Gaming/Pop-culture), seulement des sites anglophones
 * "enthusiast". Voir docs/superpowers/plans/2026-08-26-ecosystem-editorial-v2.md.
 *
 * URLs vérifiées manuellement (curl) avant ajout, conformément à
 * RADAR/CLAUDE.md §8 — les URLs "vitrine" données initialement n'étaient pas
 * des flux RSS ; les vraies URLs de flux ont été retrouvées via
 * <link rel="alternate" type="application/rss+xml"> sur chaque page d'accueil.
 *
 * Exécuter avec : npx tsx scripts/add-french-feeds.ts
 */

interface NewFeed {
  name: string;
  url: string;
  priority: number;
  note: string;
}

const FRENCH_FEEDS: NewFeed[] = [
  {
    name: 'Caradisiac',
    url: 'https://www.caradisiac.com/rss.xml',
    priority: 1,
    note: 'FR, vérifié 2026-08-27 : 200, 10 items, enclosure image, pubDate à jour',
  },
  {
    name: "L'Argus",
    url: 'https://www.largus.fr/RSS',
    priority: 1,
    note: 'FR, vérifié 2026-08-27 : 200, 30 items, enclosure image, pubDate à jour',
  },
  {
    name: 'LeBlogAuto',
    url: 'https://www.leblogauto.com/feed/',
    priority: 1,
    note: "FR, vérifié 2026-08-27 : 200 (l'URL sans slash finale redirige ici)",
  },
];

function addFrenchFeeds() {
  const db = getDb();

  console.log('🔄 Ajout des sources françaises confirmées...\n');

  let added = 0;
  let skipped = 0;

  for (const feed of FRENCH_FEEDS) {
    try {
      const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feed.url);

      if (existing) {
        console.log(`   ⏭️  ${feed.name} (déjà existant)`);
        skipped++;
        continue;
      }

      db.prepare(`
        INSERT INTO feeds (name, url, priority, requires_scraping)
        VALUES (?, ?, ?, 0)
      `).run(feed.name, feed.url, feed.priority);

      console.log(`   ✅ ${feed.name} — ${feed.note}`);
      added++;
    } catch (error) {
      console.error(`   ❌ Erreur pour ${feed.name}:`, error);
    }
  }

  console.log(`\n📊 Résultat: ${added} nouveaux feeds ajoutés, ${skipped} déjà existants`);
}

addFrenchFeeds();
