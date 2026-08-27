#!/bin/bash
set -a
source /opt/media-labs/.env
set +a
export DB_PATH=/opt/media-labs/data/radar.db
# STUDIO_URL alimente les liens cliqués par le navigateur (buildStudioLink(),
# RADAR/CLAUDE.md §9b) — doit être une adresse publique, jamais 127.0.0.1.
# STUDIO_IMPORT_URL reste local pour l'appel serveur-à-serveur (visualSearch.ts:11-12).
# Bug corrigé le 2026-08-27 : cette ligne écrasait STUDIO_URL avec 127.0.0.1,
# ce qui aurait cassé "Créer un post" pour tout utilisateur distant en prod.
export STUDIO_URL="http://studio.89.168.53.133.nip.io"
export STUDIO_IMPORT_URL="http://127.0.0.1:3002"
export NODE_ENV=production
PORT=3000 exec npm start
