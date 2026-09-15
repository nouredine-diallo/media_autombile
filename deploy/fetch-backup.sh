#!/bin/bash
# Copie la dernière sauvegarde radar.db de la VM prod vers la machine locale.
#
# Finding 2.1 (AUDIT-PRODUCTION-READINESS, 15 sept. 2026) : `backup.ts`
# (finding E1) écrit les sauvegardes sur le MÊME disque que radar.db en
# prod — une perte de VM/disque détruit le prod et les 7 jours de
# sauvegardes en même temps. Solution alternative à coût zéro (pas de
# nouveau scope OAuth Drive, pas de nouvelle dépendance, RADAR/CLAUDE.md §3) :
# le mécanisme SSH déjà utilisé pour l'administration de la VM (voir
# SESSION-START.md "Accès VM prod") suffit à rapatrier une copie hors-VM.
#
# Usage : ./deploy/fetch-backup.sh [répertoire de destination local]
# Par défaut, dépose dans ./backups-offsite/ (hors Git, voir .gitignore).
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/oracle-media-labs.key}"
VM_HOST="${VM_HOST:-ubuntu@89.168.53.133}"
VM_BACKUP_DIR="${VM_BACKUP_DIR:-/opt/media-labs/data/backups}"
DEST_DIR="${1:-$(dirname "$0")/../backups-offsite}"

mkdir -p "$DEST_DIR"

LATEST=$(ssh -i "$SSH_KEY" -o ConnectTimeout=8 "$VM_HOST" \
  "ls -t $VM_BACKUP_DIR/radar-*.db 2>/dev/null | head -1")

if [ -z "$LATEST" ]; then
  echo "Aucune sauvegarde trouvée sur $VM_HOST:$VM_BACKUP_DIR" >&2
  exit 1
fi

BASENAME=$(basename "$LATEST")
echo "Rapatriement de $BASENAME..."
scp -i "$SSH_KEY" "$VM_HOST:$LATEST" "$DEST_DIR/$BASENAME"

# Vérifie l'intégrité de la copie rapatriée avant de la déclarer bonne —
# une copie corrompue par le réseau ne doit jamais passer pour une
# sauvegarde valide (RADAR/CLAUDE.md §6, "aucune dégradation silencieuse").
node -e "
const Database = require('$(dirname "$0")/../RADAR/node_modules/better-sqlite3');
const db = new Database('$DEST_DIR/$BASENAME', { readonly: true });
const result = db.prepare('PRAGMA integrity_check').get();
if (result.integrity_check !== 'ok') {
  console.error('ÉCHEC intégrité:', JSON.stringify(result));
  process.exit(1);
}
console.log('Intégrité vérifiée: OK');
db.close();
"

echo "Sauvegarde hors-VM à jour : $DEST_DIR/$BASENAME"

# Purge locale : ne garder que les 7 dernières copies rapatriées, même
# politique de rétention que backup.ts côté VM.
cd "$DEST_DIR"
ls -t radar-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "Copies locales conservées : $(ls radar-*.db 2>/dev/null | wc -l)"
