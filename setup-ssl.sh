#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Media Labs — SSL + Nginx Setup
# Run AFTER DNS records are configured for media-labs.is-a.dev
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="media-labs.is-a.dev"
VM_IP=$(curl -s ifconfig.me)

echo "═══════════════════════════════════════════════════"
echo "  SSL + Nginx Setup for $DOMAIN"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Check DNS ──
echo "Checking DNS..."
DNS_IP=$(dig +short $DOMAIN @8.8.8.8 2>/dev/null | head -1)
if [ "$DNS_IP" != "$VM_IP" ]; then
    echo "  ⚠️  DNS not configured yet!"
    echo "  Expected: $VM_IP"
    echo "  Found:    ${DNS_IP:-not resolved}"
    echo ""
    echo "  Add these DNS records first:"
    echo "    $DOMAIN       → A → $VM_IP"
    echo "    radar.$DOMAIN → A → $VM_IP"
    echo "    studio.$DOMAIN → A → $VM_IP"
    echo ""
    echo "  If using is-a.dev, submit a PR to github.com/is-a-dev/register"
    echo "  with these JSON files (already in your repo under is-a-dev/)."
    echo ""
    echo "  After DNS propagates, run this script again."
    exit 1
fi

echo "  ✅ DNS resolved: $DOMAIN → $VM_IP"
echo ""

# ── Copy Nginx config ──
echo "Configuring Nginx..."
INSTALL_DIR="/opt/media-labs"
sudo cp "$INSTALL_DIR/nginx/media-labs.conf" /etc/nginx/sites-available/media-labs.conf
sudo ln -sf /etc/nginx/sites-available/media-labs.conf /etc/nginx/sites-enabled/media-labs.conf

# Remove default config
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
sudo nginx -t
sudo systemctl reload nginx
echo "  ✅ Nginx configured"
echo ""

# ── Get SSL certificates ──
echo "Obtaining SSL certificates..."
sudo certbot --nginx \
    -d "$DOMAIN" \
    -d "radar.$DOMAIN" \
    -d "studio.$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "admin@$DOMAIN" \
    --redirect

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ SSL configured!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  🌐 https://$DOMAIN          → Landing page"
echo "  🌐 https://radar.$DOMAIN    → RADAR"
echo "  🌐 https://studio.$DOMAIN   → STUDIO"
echo ""
echo "  Certbot auto-renewal is configured via systemd timer."
echo "  Test renewal: sudo certbot renew --dry-run"
