import { getDb } from '../src/lib/db';

/**
 * Script pour mettre à jour les sources RSS avec les URLs correctes.
 * Exécuter avec : npx tsx scripts/update-feeds.ts
 */

interface FeedUpdate {
  name: string;
  oldUrl: string;
  newUrl: string;
}

const FEED_UPDATES: FeedUpdate[] = [
  // URLs corrigées basées sur les recherches
  { name: 'Top Gear', oldUrl: 'https://www.topgear.com/car-news/rss', newUrl: 'https://www.topgear.com/rss' },
  { name: 'Motor1', oldUrl: 'https://www.motor1.com/news/rss/', newUrl: 'https://www.motor1.com/rss/news/all' },
  { name: 'Formula 1', oldUrl: 'https://www.formal1.com/en/latest/rss.xml', newUrl: 'https://www.formula1.com/en/latest/rss.xml' },
  { name: 'InsideEVs', oldUrl: 'https://insideevs.com/rss/news/', newUrl: 'https://insideevs.com/rss/' },
  { name: 'EVO', oldUrl: 'https://www.evo.co.uk/rss', newUrl: 'https://www.evo.co.uk/rss.xml' },
  { name: 'Automotive News', oldUrl: 'https://www.autonews.com/rss/', newUrl: 'https://www.autonews.com/rss' },
  { name: 'McLaren', oldUrl: 'https://www.mclaren.com/racing/feed/', newUrl: 'https://www.mclaren.com/racing/feed.xml' },
  { name: 'Aston Martin', oldUrl: 'https://www.astonmartin.com/en/rss/', newUrl: 'https://www.astonmartin.com/en/rss.xml' },
  { name: 'Bentley', oldUrl: 'https://www.bentleymotors.com/en/rss/', newUrl: 'https://www.bentleymotors.com/en/rss.xml' },
  { name: 'Rolls-Royce', oldUrl: 'https://www.rolls-roycemotorcars.com/rss/', newUrl: 'https://www.rolls-roycemotorcars.com/rss.xml' },
  { name: 'BMW', oldUrl: 'https://www.bmw.com/en/rss/', newUrl: 'https://www.bmw.com/en/rss.xml' },
  { name: 'Mercedes-Benz', oldUrl: 'https://media.mercedes-benz.com/rss/', newUrl: 'https://media.mercedes-benz.com/rss.xml' },
  { name: 'Jaguar Land Rover', oldUrl: 'https://www.jaguarlandrover.com/rss/', newUrl: 'https://www.jaguarlandrover.com/rss.xml' },
  { name: 'Four Wheel Trends', oldUrl: 'https://fourwheeltrends.com/feed/', newUrl: 'https://fourwheeltrends.com/feed' },
];

// Nouvelles sources à ajouter (qui fonctionnent)
interface NewFeed {
  name: string;
  url: string;
  priority: number;
}

const NEW_FEEDS: NewFeed[] = [
  // Sources RSS confirmées fonctionnelles
  { name: 'CarBuzz', url: 'https://carbuzz.com/feed', priority: 1 },
  { name: 'Autoblog', url: 'https://www.autoblog.com/rss.xml', priority: 1 },
  { name: 'Edmunds', url: 'https://www.edmunds.com/rss/news.xml', priority: 2 },
  { name: 'Jalopnik', url: 'https://jalopnik.com/rss', priority: 2 },
  { name: 'The Truth About Cars', url: 'https://www.thetruthaboutcars.com/feed/', priority: 2 },
  { name: 'Motor Authority', url: 'https://www.motorauthority.com/rss', priority: 2 },
  { name: 'Green Car Reports', url: 'https://www.greencarreports.com/rss/news', priority: 2 },
  { name: 'EV Obsession', url: 'https://evobsession.com/feed/', priority: 2 },
  { name: 'CleanTechnica', url: 'https://cleantechnica.com/feed/', priority: 2 },
  { name: 'Car and Driver', url: 'https://www.caranddriver.com/rss/', priority: 1 },
  { name: 'Road & Track', url: 'https://www.roadandtrack.com/rss/', priority: 1 },
  { name: 'MotorTrend', url: 'https://www.motortrend.com/rss/', priority: 1 },
  { name: 'Supercar Blondie', url: 'https://supercarblondie.com/feed/', priority: 1 },
  { name: 'Robb Report Cars', url: 'https://robbreport.com/tag/cars/feed/', priority: 1 },
  { name: 'Motorsport.com', url: 'https://www.motorsport.com/rss/', priority: 1 },
  { name: 'Reuters Autos', url: 'https://www.reuters.com/business/autos-transportation/rss/', priority: 1 },
  { name: 'Ferrari Newsroom', url: 'https://www.ferrari.com/en-EN/newsroom/rss', priority: 1 },
  { name: 'Porsche Newsroom', url: 'https://www.porsche.com/newsroom/rss', priority: 1 },
  { name: 'Lamborghini Media', url: 'https://www.lamborghini.com/en-en/news/rss', priority: 1 },
  { name: 'Bugatti Newsroom', url: 'https://newsroom.bugatti.com/feed', priority: 1 },
  { name: 'duPont Registry', url: 'https://www.dupontregistry.com/feed', priority: 2 },
  { name: 'Classic Driver', url: 'https://www.classicdriver.com/rss', priority: 2 },
  { name: 'Hagerty', url: 'https://www.hagerty.com/media/feed', priority: 2 },
  { name: 'Petrolicious', url: 'https://petrolicious.com/feed', priority: 2 },
  { name: 'Silodrome', url: 'https://silodrome.com/feed/', priority: 2 },
  { name: 'The Drive', url: 'https://www.thedrive.com/rss/', priority: 2 },
  { name: 'Carscoops', url: 'https://www.carscoops.com/feed/', priority: 1 },
  { name: 'Autocar', url: 'https://www.autocar.co.uk/car-news/rss', priority: 1 },
];

function updateFeeds() {
  const db = getDb();
  
  console.log('🔄 Mise à jour des sources RSS...\n');
  
  // 1. Supprimer les anciens feeds avec URLs incorrectes
  console.log('🗑️  Suppression des anciens feeds...');
  for (const feed of FEED_UPDATES) {
    try {
      const result = db.prepare('DELETE FROM feeds WHERE name = ? AND url = ?').run(feed.name, feed.oldUrl);
      if (result.changes > 0) {
        console.log(`   Supprimé: ${feed.name}`);
      }
    } catch (error) {
      console.error(`   Erreur pour ${feed.name}:`, error);
    }
  }
  
  // 2. Ajouter les nouveaux feeds
  console.log('\n➕ Ajout des nouveaux feeds...');
  let added = 0;
  
  for (const feed of NEW_FEEDS) {
    try {
      // Vérifier si le feed existe déjà
      const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feed.url);
      
      if (existing) {
        console.log(`   ⏭️  ${feed.name} (déjà existant)`);
        continue;
      }
      
      // Insérer le feed
      db.prepare(`
        INSERT INTO feeds (name, url, priority, requires_scraping)
        VALUES (?, ?, ?, 0)
      `).run(feed.name, feed.url, feed.priority);
      
      console.log(`   ✅ ${feed.name} (priorité ${feed.priority})`);
      added++;
    } catch (error) {
      console.error(`   ❌ Erreur pour ${feed.name}:`, error);
    }
  }
  
  console.log(`\n📊 Résultat: ${added} nouveaux feeds ajoutés`);
  
  // Afficher le résumé final
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

updateFeeds();
