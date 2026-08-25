#!/bin/bash
set -a
source /opt/media-labs/.env
set +a
export DB_PATH=/opt/media-labs/data/radar.db
export STUDIO_URL="http://127.0.0.1:3002"
export NODE_ENV=production
PORT=3000 exec npm start
