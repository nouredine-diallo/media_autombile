import { getDb } from '../src/lib/db';

/**
 * Correction des 30 flux RSS en échec identifiés le 17 sept. 2026
 * (audit + vérification manuelle par curl, hors quota LLM).
 * Exécuter avec : npx tsx scripts/fix-rss-feeds-2026-09-17.ts
 *
 * Vérification réelle par flux (curl -sL avec User-Agent navigateur,
 * détail complet dans la session du 17 sept.) :
 * - URL corrigée : le flux existe toujours, sous une autre URL (vérifié
 *   par un vrai `curl` renvoyant du XML valide sur la nouvelle URL).
 * - Désactivé : plus aucun flux RSS public trouvé (404 confirmé sur
 *   l'ancienne URL, aucune balise <link rel="alternate" type="application/
 *   rss+xml"> ni chemin RSS connu trouvé sur le site actuel).
 *
 * Volontairement NON touchés dans ce script (voir rapport de session) :
 * - Flux qui répondent 200 avec un User-Agent navigateur (Road & Track,
 *   MotorTrend, Motorsport.com, Porsche Newsroom, duPont Registry,
 *   Petrolicious, InsideEVs All) : rss.ts envoie déjà un UA Chrome
 *   (ligne 8) — `recordFeedFetchSuccess` remet `consecutive_failures` à 0
 *   automatiquement au prochain cycle réussi, aucune correction nécessaire.
 * - Flux bloqués par un pare-feu anti-bot dédié (DataDome sur Autoblog,
 *   Akamai sur Edmunds, Cloudflare sur Classic Driver/Automotive News
 *   Europe, même blocage 403 template sur tout le réseau Internet Brands :
 *   Motor Authority, Green Car Reports, The Car Connection, Hemmings, Just
 *   Auto) : le flux existe réellement, le blocage est basé sur la
 *   réputation IP (datacenter), pas sur l'URL — aucun changement d'URL ne
 *   corrige ça, et je n'ai pas pu vérifier si la VM Oracle Cloud passe ce
 *   blocage différemment de ce réseau local. À revérifier depuis la VM
 *   avant de désactiver.
 * - Speedhunters : HTTPS ne répond pas du tout depuis ce réseau (timeout,
 *   y compris en IP directe), mais HTTP + DNS fonctionnent — inconclusif,
 *   à revérifier depuis la VM plutôt que de deviner.
 */

interface FeedUrlFix {
  name: string;
  oldUrl: string;
  newUrl: string;
}

const URL_FIXES: FeedUrlFix[] = [
  { name: 'Autocar', oldUrl: 'https://www.autocar.co.uk/car-news/rss', newUrl: 'https://www.autocar.co.uk/rss' },
  { name: 'Car and Driver', oldUrl: 'https://www.caranddriver.com/rss/', newUrl: 'https://www.caranddriver.com/rss/all.xml/' },
];

const DEAD_FEEDS: { name: string; reason: string }[] = [
  { name: 'Ferrari Newsroom', reason: '404, aucun flux RSS trouvé sur le newsroom actuel' },
  { name: 'Lamborghini Media', reason: '404, aucun flux RSS trouvé sur la page news actuelle' },
  { name: 'Bugatti Newsroom', reason: '404, aucun flux RSS trouvé sur le newsroom actuel' },
  { name: 'FIA WEC', reason: '404, aucun flux RSS trouvé sur le site actuel' },
  { name: '24 Heures du Mans', reason: '404, aucun flux RSS trouvé sur le site actuel' },
  { name: 'Goodwood', reason: '404, aucun flux RSS trouvé sur le site actuel' },
  { name: 'Top Gear', reason: '404 sur /rss, aucun flux de remplacement trouvé' },
  { name: 'Motorsport.com F1', reason: '404 — seul le flux "toutes actualités" (/rss/google/) existe encore, déjà couvert par le flux "Motorsport.com"' },
  { name: 'Motorsport.com WEC', reason: '404 — même raison que Motorsport.com F1, redondant avec "Motorsport.com"' },
  { name: 'Reuters Autos', reason: 'Reuters a retiré ses flux RSS publics (redirige vers un flux corporate qui renvoie 403)' },
];

function fixFeeds() {
  const db = getDb();

  console.log('🔧 Correction des URLs de flux...\n');
  for (const fix of URL_FIXES) {
    const result = db.prepare('UPDATE feeds SET url = ?, consecutive_failures = 0, last_fetch_status = NULL, last_fetch_error = NULL WHERE name = ? AND url = ?')
      .run(fix.newUrl, fix.name, fix.oldUrl);
    if (result.changes > 0) {
      console.log(`   ✅ ${fix.name} — ${fix.oldUrl} → ${fix.newUrl}`);
    } else {
      console.log(`   ⏭️  ${fix.name} (URL déjà différente en base, rien à faire)`);
    }
  }

  console.log('\n🗑️  Désactivation des flux sans remplacement public...\n');
  for (const feed of DEAD_FEEDS) {
    const existing = db.prepare('SELECT id, enabled FROM feeds WHERE name = ?').get(feed.name) as { id: number; enabled: number } | undefined;
    if (!existing) {
      console.log(`   ⏭️  ${feed.name} (introuvable en base)`);
      continue;
    }
    if (existing.enabled === 0) {
      console.log(`   ⏭️  ${feed.name} (déjà désactivé)`);
      continue;
    }
    db.prepare('UPDATE feeds SET enabled = 0 WHERE id = ?').run(existing.id);
    console.log(`   ❌ ${feed.name} — ${feed.reason}`);
  }

  console.log('\n📊 Terminé.');
}

fixFeeds();
