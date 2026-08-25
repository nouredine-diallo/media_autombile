#!/bin/bash
set -a
source /opt/media-labs/.env
set +a
export RADAR_URL="http://127.0.0.1:3000"
export NODE_ENV=production
PORT=3002 exec npm start
