import { getDb } from '../src/lib/db';

/**
 * Script pour ajouter les sources RSS prioritaires à RADAR.
 * Exécuter avec : npx tsx scripts/add-feeds.ts
 */

interface FeedInput {
  name: string;
  url: string;
  priority: number;
  requires_scraping?: number;
}

const FEEDS: FeedInput[] = [
  // 🎯 TOP 15 PRIORITAIRES (mandat utilisateur)
  { name: 'Top Gear', url: 'https://www.topgear.com/car-news/rss', priority: 1 },
  { name: 'Motor1', url: 'https://www.motor1.com/news/rss/', priority: 1 },
  { name: 'Carscoops', url: 'https://www.carscoops.com/feed/', priority: 1 },
  { name: 'Autocar', url: 'https://www.autocar.co.uk/car-news/rss', priority: 1 },
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

  // 💎 LUXE / SUPERCARS
  { name: 'duPont Registry', url: 'https://www.dupontregistry.com/feed', priority: 2 },
  { name: 'Classic Driver', url: 'https://www.classicdriver.com/rss', priority: 2 },
  { name: 'Hagerty', url: 'https://www.hagerty.com/media/feed', priority: 2 },
  { name: 'Petrolicious', url: 'https://petrolicious.com/feed', priority: 2 },
  { name: 'Silodrome', url: 'https://silodrome.com/feed/', priority: 2 },

  // 🏎️ COMPÉTITION / PERFORMANCE
  { name: 'Formula 1', url: 'https://www.formal1.com/en/latest/rss.xml', priority: 2 },
  { name: 'FIA WEC', url: 'https://www.fiawec.com/en/news/rss', priority: 2 },
  { name: '24 Heures du Mans', url: 'https://www.lemans.org/en/rss.xml', priority: 2 },
  { name: 'Goodwood', url: 'https://www.goodwood.com/grr/feed/', priority: 2 },

  // 🏭 INDUSTRIE / BUSINESS
  { name: 'Automotive News', url: 'https://www.autonews.com/rss/', priority: 2 },
  { name: 'The Drive', url: 'https://www.thedrive.com/rss/', priority: 2 },

  // 🧮 TECHNOLOGIE / EV
  { name: 'InsideEVs', url: 'https://insideevs.com/rss/news/', priority: 2 },
  { name: 'Electrek', url: 'https://electrek.co/feed/', priority: 2 },

  // 📰 SOURCES GÉNÉRALES AUTOMOBILE
  { name: 'Four Wheel Trends', url: 'https://fourwheeltrends.com/feed/', priority: 3 },
  { name: 'EVO', url: 'https://www.evo.co.uk/rss', priority: 3 },
  { name: 'Mondial Paris', url: 'https://mondial.paris/feed/', priority: 3 },
  { name: 'Pebble Beach', url: 'https://www.pebblebeachconcours.net/feed/', priority: 3 },

  // 🏭 CONSTRUCTEURS SUPPLÉMENTAIRES
  { name: 'McLaren', url: 'https://www.mclaren.com/racing/feed/', priority: 3 },
  { name: 'Aston Martin', url: 'https://www.astonmartin.com/en/rss/', priority: 3 },
  { name: 'Bentley', url: 'https://www.bentleymotors.com/en/rss/', priority: 3 },
  { name: 'Rolls-Royce', url: 'https://www.rolls-roycemotorcars.com/rss/', priority: 3 },
  { name: 'BMW', url: 'https://www.bmw.com/en/rss/', priority: 3 },
  { name: 'Mercedes-Benz', url: 'https://media.mercedes-benz.com/rss/', priority: 3 },
  { name: 'Jaguar Land Rover', url: 'https://www.jaguarlandrover.com/rss/', priority: 3 },
];

function addFeeds() {
  const db = getDb();
  
  console.log('🔄 Ajout des sources RSS...\n');
  
  let added = 0;
  let skipped = 0;
  
  for (const feed of FEEDS) {
    try {
      // Vérifier si le feed existe déjà
      const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feed.url);
      
      if (existing) {
        console.log(`⏭️  ${feed.name} (déjà existant)`);
        skipped++;
        continue;
      }
      
      // Insérer le feed
      db.prepare(`
        INSERT INTO feeds (name, url, priority, requires_scraping)
        VALUES (?, ?, ?, ?)
      `).run(feed.name, feed.url, feed.priority, feed.requires_scraping || 0);
      
      console.log(`✅ ${feed.name} (priorité ${feed.priority})`);
      added++;
    } catch (error) {
      console.error(`❌ Erreur pour ${feed.name}:`, error);
    }
  }
  
  console.log(`\n📊 Résultat : ${added} ajoutés, ${skipped} ignorés, ${FEEDS.length} total`);
  
  // Afficher le résumé par priorité
  const counts = db.prepare(`
    SELECT priority, COUNT(*) as count 
    FROM feeds 
    GROUP BY priority 
    ORDER BY priority
  `).all() as { priority: number; count: number }[];
  
  console.log('\n📈 Résumé par priorité :');
  for (const row of counts) {
    console.log(`   Priorité ${row.priority}: ${row.count} sources`);
  }
}

addFeeds();
