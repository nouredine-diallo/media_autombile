#!/bin/bash
# Restaure radar.db depuis une sauvegarde — À EXÉCUTER SUR LA VM PROD.
#
# Finding 2.1 (AUDIT-PRODUCTION-READINESS, 15 sept. 2026) : le mécanisme de
# sauvegarde (backup.ts, finding E1) n'avait jamais été accompagné d'une
# procédure de restauration réelle et testée. Ce script formalise la
# procédure vérifiée manuellement le 15 sept. 2026 (intégrité de
# radar-2026-09-15T03-00-00-357Z.db confirmée : `PRAGMA integrity_check` =
# "ok", 791 events / 837 items / 62 feeds / 89 pipeline_runs relus avec
# succès) — mais AUTOMATISE en plus les étapes d'arrêt/remplacement/
# redémarrage qui n'avaient été qu'analysées, pas exécutées, dans cette
# vérification.
#
# ⚠️ Action destructive sur radar.db en cours d'exécution — sauvegarde
# l'état actuel avant d'écraser quoi que ce soit (voir étape 2), mais reste
# une opération à ne lancer qu'en connaissance de cause, jamais en routine.
#
# Usage (sur la VM) : ./deploy/restore.sh <chemin-vers-backup.db>
#   ./deploy/restore.sh /opt/media-labs/data/backups/radar-2026-09-15T03-00-00-357Z.db
set -euo pipefail

BACKUP_FILE="${1:?Usage: ./deploy/restore.sh <chemin-vers-backup.db>}"
DATA_DIR="/opt/media-labs/data"
LIVE_DB="$DATA_DIR/radar.db"
PRE_RESTORE_SAFETY="$DATA_DIR/backups/pre-restore-safety-$(date -u +%Y-%m-%dT%H-%M-%S).db"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Fichier de sauvegarde introuvable : $BACKUP_FILE" >&2
  exit 1
fi

echo "=== 1/5 — Vérification d'intégrité de la sauvegarde à restaurer ==="
node -e "
const Database = require('/opt/media-labs/RADAR/node_modules/better-sqlite3');
const db = new Database('$BACKUP_FILE', { readonly: true });
const result = db.prepare('PRAGMA integrity_check').get();
if (result.integrity_check !== 'ok') {
  console.error('ÉCHEC — sauvegarde corrompue, restauration annulée:', JSON.stringify(result));
  process.exit(1);
}
console.log('Intégrité OK — poursuite de la restauration.');
db.close();
"

echo "=== 2/5 — Sauvegarde de sécurité de l'état actuel (avant écrasement) ==="
if [ -f "$LIVE_DB" ]; then
  cp "$LIVE_DB" "$PRE_RESTORE_SAFETY"
  echo "État actuel sauvegardé : $PRE_RESTORE_SAFETY (pour annuler cette restauration si besoin)"
else
  echo "Pas de radar.db actuel — première installation, rien à sauvegarder."
fi

echo "=== 3/5 — Arrêt de radar (pm2) ==="
pm2 stop radar

echo "=== 4/5 — Remplacement de radar.db ==="
cp "$BACKUP_FILE" "$LIVE_DB"
rm -f "$DATA_DIR/radar.db-shm" "$DATA_DIR/radar.db-wal"

echo "=== 5/5 — Redémarrage de radar et vérification de santé ==="
pm2 start radar --update-env
sleep 3
if curl -sf -o /dev/null http://127.0.0.1:3001/login; then
  echo "OK — radar répond après restauration."
else
  echo "ATTENTION — radar ne répond pas après restauration, vérifier 'pm2 logs radar'." >&2
  exit 1
fi

echo ""
echo "Restauration terminée. En cas de problème : cp '$PRE_RESTORE_SAFETY' '$LIVE_DB' && pm2 restart radar"
