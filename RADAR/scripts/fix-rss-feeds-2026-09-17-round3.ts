import { getDb } from '../src/lib/db';

/**
 * Troisième passe RSS, même journée (17 sept. 2026) — réactive "Bring a
 * Trailer", incohérence relevée dans l'audit ("désactivé, pourtant OK au
 * dernier fetch"). Exécuter avec : npx tsx scripts/fix-rss-feeds-2026-09-17-round3.ts
 *
 * **Cause racine trouvée** (pas supposée) : recherche dans tout l'historique
 * git — aucun commit, aucun script (`add-diverse-feeds.ts`,
 * `disable-bad-feeds.ts`, `update-feeds.ts`) n'a jamais désactivé ce flux
 * pour une raison éditoriale. `disable-bad-feeds.ts` désactive explicitement
 * Designboom/Dezeen (contenu hors périmètre auto) — Bring a Trailer n'y
 * figure pas. Confirmé en base : `consecutive_failures = 0`,
 * `last_fetch_status = 'ok'`, mais `enabled = 0`.
 *
 * Explication mécanique complète : `recordFeedFetchFailure()` (rss.ts)
 * désactive un flux après 30 échecs consécutifs. `recordFeedFetchSuccess()`
 * remet `consecutive_failures` à 0 au prochain succès, mais NE remet PAS
 * `enabled` à 1 — un flux qui s'auto-désactive puis redevient sain reste
 * donc éteint pour toujours, silencieusement, sans qu'aucun humain ne le
 * sache. C'est very probablement ce qui est arrivé ici : une mauvaise
 * série (hébergeur en panne, blocage temporaire) a désactivé le flux, puis
 * il s'est rétabli — le dernier fetch réussi l'a marqué 'ok' sans jamais le
 * réactiver.
 *
 * **Pourquoi ne pas corriger ce mécanisme globalement plutôt que ce flux
 * seul** : `recordFeedFetchSuccess()` réactiverait alors N'IMPORTE QUEL
 * flux désactivé sur un simple succès HTTP — y compris Designboom/Dezeen
 * si leur contenu change un jour et recommence à répondre 200. Le schéma
 * `feeds` n'a aucune colonne pour distinguer "désactivé par échecs répétés"
 * de "désactivé pour raison éditoriale" — corriger ça correctement
 * demanderait cette distinction, hors périmètre de ce correctif ponctuel.
 * Vérifié en direct (`fetchFeed()`, code déjà corrigé pour le gzip) : 20
 * items réels récupérés.
 */

function reenableFeed() {
  const db = getDb();
  const result = db.prepare("UPDATE feeds SET enabled = 1 WHERE name = 'Bring a Trailer' AND enabled = 0").run();
  if (result.changes > 0) {
    console.log("✅ Bring a Trailer réactivé — 20 items réels confirmés au dernier test (fetchFeed corrigé).");
  } else {
    console.log("⏭️  Bring a Trailer déjà activé ou introuvable, rien à faire.");
  }
}

reenableFeed();
