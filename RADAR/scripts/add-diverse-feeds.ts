import { getDb } from '../src/lib/db';

/**
 * Script pour ajouter des feeds diversifiés.
 * Exécuter avec : npx tsx scripts/add-diverse-feeds.ts
 */

interface NewFeed {
  name: string;
  url: string;
  priority: number;
  category: string;
}

const DIVERSE_FEEDS: NewFeed[] = [
  // === LUXURY / SUPERCARS ===
  { name: 'CarNewsChina', url: 'https://carnewschina.com/feed/', priority: 1, category: 'luxury' },
  { name: 'Top Gear', url: 'https://www.topgear.com/rss', priority: 1, category: 'luxury' },
  { name: 'Autocar UK', url: 'https://www.autocar.co.uk/car-news/rss', priority: 1, category: 'luxury' },

  // === ELECTRIC VEHICLES ===
  { name: 'InsideEVs All', url: 'https://insideevs.com/rss/', priority: 2, category: 'ev' },
  { name: 'Green Car Reports', url: 'https://www.greencarreports.com/rss/news', priority: 2, category: 'ev' },
  { name: 'CarNewsChina EV', url: 'https://carnewschina.com/category/electric-vehicles/feed/', priority: 2, category: 'ev' },
  { name: 'Charged EVs', url: 'https://chargedevs.com/feed/', priority: 2, category: 'ev' },
  { name: 'Electrek', url: 'https://electrek.co/feed/', priority: 1, category: 'ev' },
  { name: 'CleanTechnica', url: 'https://cleantechnica.com/feed/', priority: 2, category: 'ev' },

  // === MOTORSPORT ===
  { name: 'Autosport', url: 'https://www.autosport.com/rss/feed/', priority: 2, category: 'motorsport' },
  { name: 'Crash.net MotoGP', url: 'https://www.crash.net/rss/motogp', priority: 2, category: 'motorsport' },
  { name: 'Crash.net F1', url: 'https://www.crash.net/rss/f1', priority: 2, category: 'motorsport' },
  { name: 'Motorsport Tribune', url: 'https://motorsportstribune.com/feed/', priority: 2, category: 'motorsport' },
  { name: 'Motorsport.com F1', url: 'https://www.motorsport.com/rss/f1/', priority: 1, category: 'motorsport' },
  { name: 'Motorsport.com WEC', url: 'https://www.motorsport.com/rss/wec/', priority: 2, category: 'motorsport' },

  // === INDUSTRY / BUSINESS ===
  { name: 'Automotive News Europe', url: 'https://europe.autonews.com/rss', priority: 2, category: 'industry' },
  { name: 'Just Auto', url: 'https://www.just-auto.com/feed/', priority: 2, category: 'industry' },
  { name: 'The Car Connection', url: 'https://www.thecarconnection.com/feed/', priority: 2, category: 'industry' },

  // === CLASSICS / CULTURE ===
  { name: 'Hemmings', url: 'https://www.hemmings.com/rss/', priority: 2, category: 'classics' },
  { name: 'Bring a Trailer', url: 'https://bringatrailer.com/feed/', priority: 2, category: 'classics' },
  { name: 'Speedhunters', url: 'https://speedhunters.com/feed/', priority: 2, category: 'classics' },

  // === DESIGN / LIFESTYLE ===
  // ⚠️ designboom et Dezeen retournent du contenu général (design, architecture, tech)
  // Ils ont été désactivés via scripts/disable-bad-feeds.ts
  // Ne pas les ré-ajouter ici.
];

function addDiverseFeeds() {
  const db = getDb();
  
  console.log('🔄 Ajout de feeds diversifiés...\n');
  
  let added = 0;
  let skipped = 0;
  
  for (const feed of DIVERSE_FEEDS) {
    try {
      // Vérifier si le feed existe déjà
      const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feed.url);
      
      if (existing) {
        console.log(`   ⏭️  ${feed.name} (déjà existant)`);
        skipped++;
        continue;
      }
      
      // Insérer le feed
      db.prepare(`
        INSERT INTO feeds (name, url, priority, requires_scraping)
        VALUES (?, ?, ?, 0)
      `).run(feed.name, feed.url, feed.priority);
      
      console.log(`   ✅ ${feed.name} [${feed.category}] (priorité ${feed.priority})`);
      added++;
    } catch (error) {
      console.error(`   ❌ Erreur pour ${feed.name}:`, error);
    }
  }
  
  console.log(`\n📊 Résultat: ${added} nouveaux feeds ajoutés, ${skipped} déjà existants`);
  
  // Afficher le résumé par catégorie
  const feeds = db.prepare('SELECT name, priority FROM feeds ORDER BY priority, name').all() as { name: string; priority: number }[];
  
  console.log('\n📋 Liste finale des feeds:');
  let currentPriority = 0;
  for (const feed of feeds) {
    if (feed.priority !== currentPriority) {
      console.log(`\n   Priorité ${feed.priority}:`);
      currentPriority = feed.priority;
    }
    console.log(`   - ${feed.name}`);
  }
}

addDiverseFeeds();
