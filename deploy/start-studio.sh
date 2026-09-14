#!/bin/bash
set -a
source /opt/media-labs/.env
set +a
export RADAR_URL="http://127.0.0.1:3000"
export NODE_ENV=production
# Finding E6 (audit 2026-09-07) : voir start-radar.sh pour le détail vérifié
# (`npm start` interpose un `sh -c` enfant qui ne reçoit/relaie jamais
# SIGTERM). Même correctif ici par cohérence, même si STUDIO n'a pas encore
# de handler SIGTERM propre (pas de cron de fond à attendre) — au moins le
# process réel devient joignable par PM2 au lieu de rester orphelin.
PORT=3002 exec ./node_modules/.bin/next start
