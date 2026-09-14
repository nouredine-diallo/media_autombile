import { getDb } from '../src/lib/db';
import { clusterItemsIntoEvents } from '../src/lib/scoring';

// Événements identifiés comme faux positifs de clustering (analyse 2026-09-14,
// avant le relèvement de SIMILARITY_THRESHOLD 0.88 -> 0.955) : sujets réellement
// différents fusionnés à tort dans un seul "événement".
const UNPROTECTED_POLLUTED = [110758, 110731, 111068, 110980, 110991, 110676, 110597];
// Protégé par un brief déjà généré (jamais retraité automatiquement par le
// cron) : décontaminé chirurgicalement au lieu d'être détruit.
const PROTECTED_EVENT_ID = 107658;
const PROTECTED_BAD_ITEM_IDS = [135, 3535]; // Kia EV1, VW California — hors sujet VW ID. Polo

async function main() {
  const db = getDb();

  console.log('=== AVANT ===');
  for (const id of [...UNPROTECTED_POLLUTED, PROTECTED_EVENT_ID]) {
    const ev = db.prepare('SELECT id, title, source_count FROM events WHERE id=?').get(id);
    console.log(id, ev);
  }

  // Même contournement que clusterItemsIntoEvents() (scoring.ts) : le
  // "foreign key mismatch" sur stats_imports (content_id -> events.content_id,
  // colonne non indexée UNIQUE) n'est pas une vraie contrainte de données —
  // table vide en prod, vérifié avant d'écrire ce script.
  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    // 1) Supprime les événements non protégés (le prochain cycle de
    // clustering les aurait de toute façon reconstruits correctement —
    // fait ici tout de suite à la demande explicite).
    for (const id of UNPROTECTED_POLLUTED) {
      db.prepare('DELETE FROM event_items WHERE event_id = ?').run(id);
      db.prepare('DELETE FROM events WHERE id = ?').run(id);
    }

    // 2) Décontamine l'événement protégé (garde le brief réel, retire
    // seulement les 2 items hors sujet).
    for (const itemId of PROTECTED_BAD_ITEM_IDS) {
      db.prepare('DELETE FROM event_items WHERE event_id = ? AND item_id = ?').run(PROTECTED_EVENT_ID, itemId);
    }
    const remaining = db.prepare('SELECT COUNT(*) as c FROM event_items WHERE event_id = ?').get(PROTECTED_EVENT_ID) as { c: number };
    db.prepare('UPDATE events SET source_count = ? WHERE id = ?').run(remaining.c, PROTECTED_EVENT_ID);
    db.prepare(`UPDATE briefs SET headline = REPLACE(headline, '5 sources confirment', ? || ' sources confirment') WHERE event_id = ?`)
      .run(String(remaining.c), PROTECTED_EVENT_ID);
  });
  tx();
  db.pragma('foreign_keys = ON');

  console.log('\n=== NETTOYAGE APPLIQUÉ ===');
  const ev107658 = db.prepare('SELECT id, title, source_count FROM events WHERE id=?').get(PROTECTED_EVENT_ID);
  console.log('107658 après décontamination:', ev107658);
  const brief = db.prepare('SELECT headline FROM briefs WHERE event_id=?').get(PROTECTED_EVENT_ID);
  console.log('brief headline:', brief);

  // 3) Relance le vrai clustering (pas une simulation) avec le nouveau
  // seuil 0.955 pour re-regrouper correctement les items libérés.
  console.log('\n=== RE-CLUSTERING RÉEL (seuil 0.955) ===');
  const created = await clusterItemsIntoEvents();
  console.log('Nouveaux événements créés:', created);

  // Vérifie que les items précédemment mélangés forment maintenant des
  // événements séparés.
  const checkIds = [1884, 5241, 4834, 136, 180, 672];
  console.log('\n=== VÉRIFICATION : items auparavant mélangés, maintenant séparés ? ===');
  for (const id of checkIds) {
    const row = db.prepare(`
      SELECT ei.event_id, e.title, e.source_count
      FROM event_items ei JOIN events e ON e.id = ei.event_id
      WHERE ei.item_id = ?
    `).get(id);
    console.log('item', id, '->', row);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
