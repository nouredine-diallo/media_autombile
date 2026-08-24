#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Media Labs — SSL Let's Encrypt + conf Nginx finale
# À lancer APRÈS que le DNS pointe vers cette VM
# (idempotent — peut être relancé sans risque)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="media-labs.is-a.dev"
INSTALL_DIR="/opt/media-labs"
VM_IP=$(curl -s --max-time 10 ifconfig.me)

echo "═══════════════════════════════════════════════════"
echo "  SSL + Nginx Setup for $DOMAIN"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Check DNS ──
echo "Checking DNS..."
DNS_IP=$(dig +short "$DOMAIN" @8.8.8.8 2>/dev/null | head -1 || true)
if [ "$DNS_IP" != "$VM_IP" ]; then
    echo "  ⚠️  DNS pas encore à jour !"
    echo "  Attendu : $VM_IP"
    echo "  Trouvé  : ${DNS_IP:-non résolu}"
    echo ""
    echo "  Enregistrements nécessaires :"
    echo "    $DOMAIN        → A     → $VM_IP"
    echo "    radar.$DOMAIN  → CNAME → $DOMAIN"
    echo "    studio.$DOMAIN → CNAME → $DOMAIN"
    echo ""
    echo "  JSON prêts dans $INSTALL_DIR/is-a-dev/ (PR sur github.com/is-a-dev/register)."
    exit 1
fi
echo "  ✅ DNS résolu : $DOMAIN → $VM_IP"
echo ""

# ── Ports firewall locaux ──
for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || \
        sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
command -v netfilter-persistent &>/dev/null && sudo netfilter-persistent save >/dev/null

# ── Certificats (webroot, la conf bootstrap sert déjà /.well-known) ──
echo "Obtaining SSL certificates..."
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" -d "radar.$DOMAIN" -d "studio.$DOMAIN" \
    --non-interactive --agree-tos --email "admin@$DOMAIN" \
    --keep-until-expiring

# ── Conf finale (SSL) depuis le repo ──
echo "Installing final Nginx config..."
sudo cp "$INSTALL_DIR/nginx/media-labs.conf" /etc/nginx/sites-available/media-labs.conf
sudo ln -sf /etc/nginx/sites-available/media-labs.conf /etc/nginx/sites-enabled/media-labs.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
echo "  ✅ Nginx SSL configuré"
echo ""

echo "═══════════════════════════════════════════════════"
echo "  ✅ SSL configuré !"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  🌐 https://$DOMAIN          → Dashboard RADAR"
echo "  🌐 https://radar.$DOMAIN    → RADAR"
echo "  🌐 https://studio.$DOMAIN   → STUDIO"
echo ""
echo "  Renouvellement auto via systemd timer."
echo "  Test : sudo certbot renew --dry-run"
