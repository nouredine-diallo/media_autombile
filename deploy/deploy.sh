#!/bin/bash
# Audit du 2026-09-07 (findings F1-F4) — ce script masquait un build cassé
# (pipefail absent, `npm run build | tail -5` faisait retourner 0 même en
# cas d'échec) et écrasait le seul `.next` fonctionnel sans aucun filet.
# Corrigé : pipefail, vérification explicite du build, sauvegarde/retour
# arrière automatique si la vérification post-déploiement échoue.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Media Labs Deploy ==="

# 1. Pull latest code
echo "[1/6] Pulling code..."
cd "$REPO_DIR/RADAR" && git pull origin main
cd "$REPO_DIR/studio" && git pull origin main

# 2. Build — sauvegarde le .next précédent avant d'écraser, vérifie que le
#    build a réellement produit quelque chose d'exploitable avant de continuer
#    (BUILD_ID n'existe que si `next build` est allé au bout sans erreur).
build_app() {
    local app_dir="$1"
    local label="$2"
    shift 2

    cd "$app_dir"
    rm -rf .next.bak
    [ -d .next ] && mv .next .next.bak

    echo "[2/6] Building $label..."
    if ! "$@"; then
        echo "  ❌ Build $label a échoué (code de sortie non nul) — .next précédent conservé"
        [ -d .next.bak ] && mv .next.bak .next
        exit 1
    fi

    if [ ! -f .next/BUILD_ID ]; then
        echo "  ❌ Build $label incomplet (.next/BUILD_ID absent) — .next précédent restauré"
        rm -rf .next
        [ -d .next.bak ] && mv .next.bak .next
        exit 1
    fi

    echo "  ✅ Build $label OK ($(cat .next/BUILD_ID))"
}

# NEXT_PUBLIC_STUDIO_URL est inlinée dans le bundle CLIENT au build — c'est
# elle, pas la variable d'environnement runtime STUDIO_URL de start-radar.sh,
# qui détermine réellement les liens "Carrousel"/"Slide unique" cliqués
# depuis le navigateur (studio-prefill.ts:78, priorité NEXT_PUBLIC_* > runtime
# > fallback). Laissée en http:// après l'activation HTTPS du 14 sept. 2026
# aurait continué à générer des liens non sécurisés malgré le certificat
# actif, sans qu'aucune variable runtime ne puisse le corriger après coup.
build_app "$REPO_DIR/RADAR" "RADAR" env NEXT_PUBLIC_STUDIO_URL="https://studio.89.168.53.133.nip.io" npm run build
build_app "$REPO_DIR/studio" "STUDIO" npm run build

# 3. Copy start scripts + nginx
echo "[3/6] Updating configs..."
cp "$REPO_DIR/deploy/start-radar.sh" /opt/media-labs/start-radar.sh
cp "$REPO_DIR/deploy/start-studio.sh" /opt/media-labs/start-studio.sh
chmod +x /opt/media-labs/start-radar.sh /opt/media-labs/start-studio.sh
# Bug trouvé le 14 sept. 2026, une fois HTTPS activé pour de vrai (setup-ssl.sh) :
# ceci copiait toujours le bootstrap HTTP-only, même après activation de
# HTTPS — le déploiement suivant aurait silencieusement désactivé le SSL
# fraîchement obtenu. Copie la conf SSL finale si un certificat existe déjà
# pour ce domaine, sinon le bootstrap (premier déploiement, avant SSL).
if sudo test -d "/etc/letsencrypt/live/89.168.53.133.nip.io"; then
    sudo cp "$REPO_DIR/nginx/media-labs-ssl.conf" /etc/nginx/sites-available/media-labs.conf
else
    sudo cp "$REPO_DIR/nginx/media-labs.conf" /etc/nginx/sites-available/media-labs.conf
fi
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 4. Restart PM2 — plafond mémoire par process (finding F4) : sur une VM 2
#    cœurs déjà connue pour OOM au build, une fuite sur l'une des deux apps
#    ne doit plus jamais pouvoir affamer l'autre ni geler la VM entière.
#    400M est un point de départ prudent, pas une mesure — à ajuster si des
#    redémarrages intempestifs apparaissent en usage réel.
#
# Finding E4 (audit 2026-09-07) : aucune rotation des logs PM2 nulle part —
# ~/.pm2/logs/*.log grossissait pour toujours tant que le process tourne,
# sur une VM ARM gratuite au disque limité. `pm2 install pm2-logrotate` est
# idempotent (no-op si déjà installé) — vérifié via la commande elle-même,
# pas de flag `--force` nécessaire.
echo "[4/6] Restarting PM2..."
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 delete all 2>/dev/null || true
# Finding E6 (audit 2026-09-07) : PM2 envoie SIGKILL 1600ms (défaut) après
# SIGTERM si le process ne s'est pas arrêté seul — trop court pour laisser
# le handler de startup.ts (MAX_SHUTDOWN_WAIT_MS = 8000ms) finir un cycle
# d'ingestion en cours. Relevé à 10s, seule RADAR a ce handler (STUDIO n'a
# ni cron de fond ni connexion SQLite persistante à fermer proprement — pas
# le même risque, valeur par défaut PM2 conservée).
#
# 400M (14 sept. 2026, ce commit) confirmé beaucoup trop bas en usage réel :
# pm2.log montre `current_memory=939458560` puis `1005432832` octets (~900
# Mo-1 Go) au chargement du modèle d'embeddings (`@xenova/transformers`,
# scoring.ts) — PM2 SIGKILL le process à chaque fois avant la fin du
# clustering, 3 pipeline runs consécutifs tués le même jour
# (pipeline_runs.id 83, 84, 85, tous "Processus interrompu avant la fin").
#
# 1500M (même jour, quelques minutes plus tard) ENCORE insuffisant : le
# pipeline charge un DEUXIÈME modèle (traduction FR, ~300 Mo) juste après
# l'embedding, cumul mesuré à 1634156544 octets (~1558 Mo) — PM2 a re-tué le
# process (run 86) au même endroit. 3000M laisse une marge large au-dessus
# du pic réel observé, sur une VM à 11 Go (10 Go dispo, `free -h` vérifié).
pm2 start /opt/media-labs/start-radar.sh --name radar --cwd "$REPO_DIR/RADAR" --max-memory-restart 3000M --kill-timeout 10000
pm2 start /opt/media-labs/start-studio.sh --name studio --cwd "$REPO_DIR/studio" --max-memory-restart 400M
# Trouvé le 15 sept. 2026, en vérifiant un déploiement réel : `pm2 start
# --max-memory-restart 3000M` juste au-dessus n'applique PAS la limite sur
# ce process precis — `pm2 describe radar` affichait encore 419430400 (400M,
# la valeur de STUDIO) après ce même déploiement, alors que `--kill-timeout`
# de la même commande, lui, était bien appliqué (10000 confirmé). Reproduit
# la régression déjà documentée plus haut (pic mesuré ~1.5-1.6 Go, 400M tue
# le process en pleine ingestion) sans qu'aucune ligne de ce script n'ait
# changé — cause exacte non identifiée (PM2 semble parfois ignorer ce flag
# précis sur un `start` frais après `delete all`), mais `pm2 restart
# --update-env` avec le même flag corrige la valeur de façon vérifiée à
# chaque fois. Filet de sécurité explicite plutôt que de faire confiance au
# flag de la commande `start` ci-dessus.
pm2 restart radar --update-env --max-memory-restart 3000M
pm2 save

# 5. Open firewall
echo "[5/6] Opening ports..."
sudo iptables -C INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 3002 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 3002 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
# 443 géré à l'origine par setup-ssl.sh (une fois HTTPS activé) — ajouté ici
# aussi en idempotent, pour qu'un futur déploiement ne dépende pas d'une
# règle iptables déjà posée ailleurs sans jamais la reposer lui-même.
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

# 6. Vérification post-déploiement — BLOQUANTE (finding F3). L'ancien script
#    utilisait `curl -s` sans `-f` : un 500/502 renvoyait quand même un code
#    de sortie 0, donc `set -e` ne se déclenchait jamais et le script
#    affichait "DONE" avec une app cassée. `-f --max-time` + plusieurs
#    tentatives (le process vient de redémarrer, laisser le temps de
#    bind) + retour arrière automatique si ça ne passe toujours pas.
echo "[6/6] Verification..."
check_url() {
    local url="$1"
    local tries=6
    for i in $(seq 1 $tries); do
        if curl -sf --max-time 5 -o /dev/null "$url"; then
            echo "  ✅ $url"
            return 0
        fi
        sleep 2
    done
    echo "  ❌ $url ne répond pas correctement après ${tries} tentatives"
    return 1
}

if ! check_url "http://127.0.0.1:3000" || ! check_url "http://127.0.0.1:3002"; then
    echo ""
    echo "=== ÉCHEC — retour arrière automatique ==="
    for app in RADAR:radar studio:studio; do
        dir="${app%%:*}"; name="${app##*:}"
        cd "$REPO_DIR/$dir"
        if [ -d .next.bak ]; then
            rm -rf .next
            mv .next.bak .next
            echo "  ↩ $name : .next précédent restauré"
        fi
    done
    pm2 restart radar studio 2>/dev/null || true
    echo "  Les apps tournent sur le dernier build qui fonctionnait — le nouveau code n'a PAS été mis en ligne."
    exit 1
fi

echo ""
echo "=== DONE ==="
echo "  https://89.168.53.133.nip.io/        → RADAR  (via nginx, HTTPS)"
echo "  https://studio.89.168.53.133.nip.io/ → STUDIO (via nginx, HTTPS)"
echo "  http://89.168.53.133:3000 → RADAR direct (debug uniquement)"
echo "  http://89.168.53.133:3002 → bloqué par la Security List Oracle Cloud, ne pas utiliser publiquement"
