#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Media Labs — SSL Let's Encrypt + conf Nginx finale
# Cible les domaines nip.io RÉELLEMENT en prod aujourd'hui
# (89.168.53.133.nip.io / studio.89.168.53.133.nip.io) — pas
# media-labs.is-a.dev, dont le DNS n'a jamais été activé (audit du
# 2026-09-07, finding F5 : aucune trace de PR fusionnée sur
# is-a-dev/register, is-a-dev/*.json ne sont que des brouillons).
# nip.io est un vrai domaine public (résolution DNS wildcard vers
# l'IP qu'il encode) : Let's Encrypt le valide comme n'importe quel
# domaine, sans dépendre d'un DNS propre.
#
# À lancer depuis la VM (SSH), après un accès réseau qui l'autorise.
# Idempotent — peut être relancé sans risque (certbot --keep-until-expiring).
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

VM_IP="89.168.53.133"
DOMAIN="${VM_IP}.nip.io"
STUDIO_DOMAIN="studio.${VM_IP}.nip.io"
INSTALL_DIR="/opt/media-labs"

echo "═══════════════════════════════════════════════════"
echo "  SSL + Nginx Setup pour $DOMAIN / $STUDIO_DOMAIN"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Ports firewall locaux (443 en plus de 80/3000/3002 déjà ouverts par deploy.sh) ──
for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || \
        sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
command -v netfilter-persistent &>/dev/null && sudo netfilter-persistent save >/dev/null

# ⚠️  Rappel infra (audit finding F7, firewall à deux niveaux) : le port 443
# doit AUSSI être ouvert dans la Security List Oracle Cloud (console web,
# niveau VCN) — iptables seul ne suffit pas, comme documenté pour 80/3000/3002
# dans deploy.sh et nginx/media-labs.conf.

# ── Certificats (webroot — la conf bootstrap déjà en place sert /.well-known) ──
echo "Obtaining SSL certificates for $DOMAIN + $STUDIO_DOMAIN..."
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" -d "$STUDIO_DOMAIN" \
    --non-interactive --agree-tos --email "admin@${DOMAIN}" \
    --keep-until-expiring

# ── Conf finale (SSL) depuis le repo — PAS le fichier bootstrap ──
# (nginx/media-labs.conf reste le bootstrap HTTP tel quel ; la conf SSL vit
# dans un fichier séparé pour ne jamais confondre les deux — finding A1)
echo "Installing final Nginx SSL config..."
sudo cp "$INSTALL_DIR/nginx/media-labs-ssl.conf" /etc/nginx/sites-available/media-labs.conf
sudo ln -sf /etc/nginx/sites-available/media-labs.conf /etc/nginx/sites-enabled/media-labs.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
echo "  ✅ Nginx SSL configuré"
echo ""

# ── Renouvellement auto — vérifié explicitement, pas supposé (finding F6) ──
echo "Checking certbot auto-renewal timer..."
if sudo systemctl is-active --quiet certbot.timer; then
    echo "  ✅ certbot.timer déjà actif"
else
    sudo systemctl enable --now certbot.timer
    echo "  ✅ certbot.timer activé"
fi
echo ""

echo "═══════════════════════════════════════════════════"
echo "  ✅ SSL configuré !"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  🌐 https://$DOMAIN          → RADAR"
echo "  🌐 https://$STUDIO_DOMAIN   → STUDIO"
echo ""
echo "  Une fois vérifié en HTTPS, définir dans /opt/media-labs/.env :"
echo "    SESSION_COOKIE_SECURE=true"
echo "    SESSION_COOKIE_DOMAIN=.${VM_IP}.nip.io"
echo "  puis redémarrer les deux apps (pm2 restart radar studio) — la"
echo "  session sera alors réellement partagée entre RADAR et STUDIO,"
echo "  cookie jamais envoyé en clair (audit findings A1/A2)."
echo ""
echo "  Test renouvellement : sudo certbot renew --dry-run"
