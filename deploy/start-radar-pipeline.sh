#!/bin/bash
# Process PM2 dédié au pipeline (ingestion RSS, embeddings, traduction,
# scoring, auto-génération) — séparé du serveur web `radar` depuis le 16
# sept. 2026 (TODO.md §3.3, voir RADAR/src/pipeline-worker.ts pour le détail
# du correctif). Même structure que start-radar.sh : `exec` direct sur le
# binaire, pas de couche `npm`/`sh` intermédiaire, pour que SIGTERM envoyé
# par PM2 atteigne directement le process qui gère l'arrêt propre (même
# leçon que finding E6, voir start-radar.sh).
set -a
source /opt/media-labs/.env
set +a
export DB_PATH=/opt/media-labs/data/radar.db
# Appel serveur-à-serveur uniquement (visualSearch.ts, auto-génération) —
# jamais une adresse cliquée par un navigateur, donc jamais STUDIO_URL ici.
export STUDIO_IMPORT_URL="http://127.0.0.1:3002"
export NODE_ENV=production
exec node dist-worker/pipeline-worker.js
