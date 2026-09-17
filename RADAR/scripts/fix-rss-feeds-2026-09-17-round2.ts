import { getDb } from '../src/lib/db';

/**
 * Deuxième passe sur les flux RSS, même journée (17 sept. 2026), après un
 * vrai test de bout en bout des 44 flux actifs via `fetchFeed()` (pas du
 * curl isolé) une fois le bug de décompression gzip corrigé (rss.ts).
 * Exécuter avec : npx tsx scripts/fix-rss-feeds-2026-09-17-round2.ts
 *
 * **Correction d'une affirmation fausse du script du même jour, plus tôt**
 * (`fix-rss-feeds-2026-09-17.ts`) : celui-ci affirmait que Road & Track,
 * MotorTrend, Motorsport.com, Porsche Newsroom, duPont Registry,
 * Petrolicious et InsideEVs All étaient "déjà fonctionnels avec l'UA
 * navigateur, aucune correction nécessaire" — basé sur un test `curl`
 * isolé, plus tôt dans la journée. **Retesté maintenant avec le code réel
 * (`fetchFeed()`), ce n'est plus vrai** : les 6 premiers renvoient
 * désormais une page HTML (pages de renvoi/anti-bot) là où `curl` avait vu
 * du XML quelques heures plus tôt — signe que le blocage réseau contre
 * cette machine s'est durci au fil de la journée (beaucoup de requêtes
 * automatisées envoyées depuis cette même IP), pas que le flux ait changé.
 * Aucun des deux tests n'était faux au moment où il a été fait — c'est la
 * situation réseau qui a changé entre les deux. Documenté ici plutôt que
 * silencieusement remplacé, pour ne pas donner l'impression que la
 * première conclusion était une erreur d'analyse.
 *
 * **Cause racine réelle trouvée pour InsideEVs** (et corrigée dans
 * `rss.ts`, pas seulement ici) : `rss-parser` appelle `https.get` en
 * interne, jamais `fetch` — il ne décompresse jamais un contenu
 * `content-encoding: gzip`. Les octets gzip bruts (magic number `1f8b`)
 * atterrissaient dans le parseur XML, d'où "Non-whitespace before first
 * tag, Char: \\u001f" (0x1f = premier octet gzip). `fetchFeed()` utilise
 * maintenant `fetch` (décompression automatique) puis `parser.parseString()`
 * — corrige potentiellement d'autres flux gzippés à l'avenir, pas seulement
 * ceux listés ici.
 *
 * **Après ce correctif de décompression, retestés réellement** (script
 * `scripts/` temporaire, 44 flux actifs, résultat : 26 OK / 18 échec) :
 * - InsideEVs All : l'ancienne URL (`/rss/`) est en réalité une page
 *   d'index HTML listant les flux par catégorie/langue, pas un flux — même
 *   décompressée, ce n'est pas du XML. Vraie URL trouvée dans cette page
 *   (`href="/rss/news/all/"`) et vérifiée : 20 items réels.
 * - Autosport : la correction trouvée plus tôt dans la journée
 *   (`/rss/google/`, jamais appliquée en base par erreur) reste valide,
 *   reconfirmée : 20 items réels.
 *
 * **Volontairement non touchés, avec le détail de ce qui a changé** :
 * - Road & Track, MotorTrend, Motorsport.com, Porsche Newsroom, duPont
 *   Registry, Petrolicious : servent une page HTML (pas du XML) depuis ce
 *   réseau EN CE MOMENT — ni la décompression ni l'URL n'expliquent ça, et
 *   je n'ai aucune preuve qu'un remplacement d'URL réglerait un blocage
 *   réseau. À revérifier depuis la VM de prod (IP différente), pas à
 *   deviner une nouvelle URL sur la base d'un symptôme réseau.
 * - Edmunds (403→404) et Automotive News Europe (403→404) : le code
 *   d'erreur a changé depuis la première passe de la journée — signe
 *   supplémentaire que ce réseau n'est pas fiable pour juger ces flux.
 * - Speedhunters : "fetch failed" à nouveau, cohérent avec le blocage
 *   HTTPS déjà noté dans la première passe.
 */

const URL_FIXES: { name: string; oldUrl: string; newUrl: string }[] = [
  { name: 'InsideEVs All', oldUrl: 'https://insideevs.com/rss/', newUrl: 'https://insideevs.com/rss/news/all/' },
  { name: 'Autosport', oldUrl: 'https://www.autosport.com/rss/feed/', newUrl: 'https://www.autosport.com/rss/google/' },
];

function fixFeeds() {
  const db = getDb();
  console.log('🔧 Correction des URLs de flux (round 2)...\n');
  for (const fix of URL_FIXES) {
    const result = db.prepare('UPDATE feeds SET url = ?, consecutive_failures = 0, last_fetch_status = NULL, last_fetch_error = NULL WHERE name = ? AND url = ?')
      .run(fix.newUrl, fix.name, fix.oldUrl);
    if (result.changes > 0) {
      console.log(`   ✅ ${fix.name} — ${fix.oldUrl} → ${fix.newUrl}`);
    } else {
      console.log(`   ⏭️  ${fix.name} (URL déjà différente en base, rien à faire)`);
    }
  }
  console.log('\n📊 Terminé.');
}

fixFeeds();
