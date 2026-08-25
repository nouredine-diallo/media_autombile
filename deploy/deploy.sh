#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Media Labs Deploy ==="

# 1. Pull latest code
echo "[1/5] Pulling code..."
cd "$REPO_DIR/RADAR" && git pull origin main
cd "$REPO_DIR/studio" && git pull origin main

# 2. Build
echo "[2/5] Building RADAR..."
cd "$REPO_DIR/RADAR" && npm run build 2>&1 | tail -5

echo "[2/5] Building STUDIO..."
cd "$REPO_DIR/studio" && npm run build 2>&1 | tail -5

# 3. Copy start scripts + nginx
echo "[3/5] Updating configs..."
cp "$REPO_DIR/deploy/start-radar.sh" /opt/media-labs/start-radar.sh
cp "$REPO_DIR/deploy/start-studio.sh" /opt/media-labs/start-studio.sh
chmod +x /opt/media-labs/start-radar.sh /opt/media-labs/start-studio.sh
sudo cp "$REPO_DIR/nginx/media-labs.conf" /etc/nginx/sites-available/media-labs.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 4. Restart PM2
echo "[4/5] Restarting PM2..."
pm2 delete all 2>/dev/null || true
pm2 start /opt/media-labs/start-radar.sh --name radar --cwd "$REPO_DIR/RADAR"
pm2 start /opt/media-labs/start-studio.sh --name studio --cwd "$REPO_DIR/studio"
pm2 save

# 5. Open firewall
echo "[5/5] Opening ports..."
sudo iptables -C INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 3002 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 3002 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

sleep 3
echo ""
echo "=== Verification ==="
curl -s -o /dev/null -w "RADAR (port 3000): HTTP %{http_code}\n" http://127.0.0.1:3000
curl -s -o /dev/null -w "STUDIO (port 3002): HTTP %{http_code}\n" http://127.0.0.1:3002
curl -s -o /dev/null -w "NGINX  (port 80):  HTTP %{http_code}\n" http://127.0.0.1:80
echo ""
echo "=== DONE ==="
echo "  http://89.168.53.133      → RADAR (via nginx)"
echo "  http://89.168.53.133:3000 → RADAR (direct)"
echo "  http://89.168.53.133:3002 → STUDIO"
