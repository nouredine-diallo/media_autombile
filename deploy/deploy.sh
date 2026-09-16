#!/bin/bash
# Audit du 2026-09-07 (findings F1-F4) — ce script masquait un build cassé
# (pipefail absent, `npm run build | tail -5` faisait retourner 0 même en
# cas d'échec) et écrasait le seul `.next` fonctionnel sans aucun filet.
# Corrigé : pipefail, vérification explicite du build, sauvegarde/retour
# arrière automatique si la vérification post-déploiement échoue.
set -euo pipefail

# Trouvé le 15 sept. 2026 (Partie 2 de AUDIT-PRODUCTION-READINESS) en
# vérifiant un déploiement RÉEL : ce script fait `git pull` sur lui-même à
# l'étape [1/6], en pleine exécution. Constaté concrètement — la nouvelle
# étape de vérification PM2 ajoutée plus bas (§4) ne s'est PAS affichée dans
# la sortie du déploiement qui a introduit ce correctif, alors que le
# fichier sur disque contenait déjà le nouveau code (`git pull` avait bien
# réussi). Cause : `git pull` remplace le fichier par un nouvel inode
# (rename), mais bash garde son descripteur ouvert sur l'ANCIEN inode,
# désormais orphelin — toute la suite du script continue silencieusement à
# exécuter l'ancien contenu déjà en mémoire. Corrigé en se ré-exécutant
# depuis une copie figée avant même de commencer, pour que le `git pull` de
# l'étape suivante ne puisse plus jamais affecter le processus en cours.
#
# `$0` devient le chemin de la copie temporaire après le ré-exec — donc
# SCRIPT_DIR/REPO_DIR doivent être calculés une seule fois, ICI, avant le
# ré-exec, puis transmis par variable d'environnement plutôt que recalculés
# depuis `$0` après coup (ce qui pointerait vers /tmp).
SCRIPT_DIR="${DEPLOY_SH_SCRIPT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "${DEPLOY_SH_SELF_COPY:-}" ]; then
    TMP_SELF="$(mktemp /tmp/deploy-sh-run.XXXXXX)"
    cp "$0" "$TMP_SELF"
    chmod +x "$TMP_SELF"
    trap 'rm -f "$TMP_SELF"' EXIT
    DEPLOY_SH_SELF_COPY=1 DEPLOY_SH_SCRIPT_DIR="$SCRIPT_DIR" exec "$TMP_SELF" "$@"
fi

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

    # Trouvé le 15 sept. 2026 (Partie 2, même session que le correctif
    # d'auto-modification ci-dessus) : ce script n'a JAMAIS lancé `npm
    # install` avant de builder. `git pull` met à jour package.json/
    # package-lock.json, mais node_modules reste figé sur ce qui était
    # installé au tout premier déploiement — vérifié concrètement sur la VM
    # après le tout premier déploiement du correctif Next.js critique de
    # cette session : `node_modules/next/package.json` affichait encore
    # 16.3.1 alors que `package.json` avait bien 16.3.5 et que le build/
    # déploiement s'étaient "réussis" sans aucune erreur. Toute mise à jour
    # de dépendance de tout ce projet, y compris de sécurité critique,
    # n'avait donc jamais réellement atteint la prod tant que personne ne
    # lançait `npm install` à la main sur la VM.
    echo "[2/6] Installation des dépendances $label..."
    if ! npm install; then
        echo "  ❌ npm install $label a échoué — build annulé, .next précédent conservé"
        exit 1
    fi

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

# Finding "pipeline bloque le serveur web" (TODO.md §3.3, résolu le 16 sept.
# 2026) : le pipeline (cron, ingestion, embeddings, traduction) tourne
# maintenant dans son propre process PM2 (radar-pipeline), un script Node
# autonome — PAS une route Next.js — compilé séparément en CommonJS
# (tsconfig.worker.json, voir src/pipeline-worker.ts pour le détail complet
# du pourquoi). Même filet de sécurité que build_app() : sauvegarde avant
# d'écraser, échec bloquant si la compilation ne produit rien d'exploitable.
build_worker() {
    cd "$REPO_DIR/RADAR"
    rm -rf dist-worker.bak
    [ -d dist-worker ] && mv dist-worker dist-worker.bak

    echo "[2/6] Compilation du pipeline worker..."
    # Trouvé lors du premier déploiement réel de ce correctif : contrairement
    # à `next build` (typescript.ignoreBuildErrors: true dans next.config.ts,
    # donc son code de sortie ne reflète QUE les vrais échecs), `tsc` seul
    # sort en erreur dès qu'il y a une erreur de type — même quand il émet
    # quand même le JS (comportement par défaut sans `noEmitOnError`). Ce
    # projet tolère déjà ce même relâchement de typage ailleurs (le build
    # Next principal l'ignore explicitement) — même tolérance ici,
    # `|| true` pour ne pas déclencher `set -e` sur un exit non-zéro qui ne
    # veut pas dire "rien n'a été produit". Le vrai critère de succès reste
    # le fichier de sortie, vérifié juste après.
    npx tsc -p tsconfig.worker.json || true

    if [ ! -f dist-worker/pipeline-worker.js ]; then
        echo "  ❌ Compilation du worker incomplète (pipeline-worker.js absent) — dist-worker précédent restauré"
        rm -rf dist-worker
        [ -d dist-worker.bak ] && mv dist-worker.bak dist-worker
        exit 1
    fi

    echo "  ✅ Worker compilé OK"
}
build_worker

# 3. Copy start scripts + nginx
echo "[3/6] Updating configs..."
cp "$REPO_DIR/deploy/start-radar.sh" /opt/media-labs/start-radar.sh
cp "$REPO_DIR/deploy/start-studio.sh" /opt/media-labs/start-studio.sh
cp "$REPO_DIR/deploy/start-radar-pipeline.sh" /opt/media-labs/start-radar-pipeline.sh
chmod +x /opt/media-labs/start-radar.sh /opt/media-labs/start-studio.sh /opt/media-labs/start-radar-pipeline.sh
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
# Finding P2-bis (15 sept. 2026, test réel de vérification du correctif P2) :
# 400M n'a jamais été mesuré pour STUDIO, seulement un "point de départ
# prudent" comme RADAR l'était avant sa propre mesure réelle. Exactement le
# même piège reproduit : un export réel (gabarit simple, 1 image, sans
# bulles/détourage/upscale) mesuré à 1052 Mo en pic (`pm2 jlist` interrogé
# toutes les 1,5s pendant l'export, RADAR/CLAUDE.md §4.1 — mesuré, pas
# supposé), soit 2,6× la limite. Conséquence vérifiée : le process crashait
# et PM2 le redémarrait (`restart_time` passé de 3 à 4 pendant un seul test),
# provoquant un vrai 502 nginx côté utilisateur au milieu d'un export — la
# mémoire retombe à ~139 Mo une fois l'export terminé (pas une fuite, un pic
# transitoire de rendu Playwright/Chromium). Un gabarit à 3 bulles avec
# détourage (u2net) et upscale (realesrgan) sollicite forcément plus que ce
# cas simple. 2000M laisse une marge large au-dessus du pic mesuré, sur la
# même VM à 11 Go déjà validée pour RADAR (10 Go dispo, `free -h` vérifié) —
# 3000M (radar) + 2000M (studio) = 5000M, largement sous la capacité même si
# les deux pics se produisent simultanément.
pm2 start /opt/media-labs/start-studio.sh --name studio --cwd "$REPO_DIR/studio" --max-memory-restart 2000M
# Finding "pipeline bloque le serveur web" (TODO.md §3.3, résolu le 16 sept.
# 2026) : même charge que radar avant la séparation (mêmes modèles
# embeddings+traduction chargés dans ce process désormais), donc même
# plafond mémoire mesuré (3000M). `--kill-timeout` bien plus généreux que
# radar/studio (60s contre 10s) : vérifié réellement qu'un SIGTERM envoyé
# en pleine traduction ONNX n'est traité par Node qu'une fois le calcul
# natif en cours terminé — observé jusqu'à 35s d'attente sur un test réel
# avant que le process ne réagisse au signal. Sans coût pour la
# disponibilité perçue : contrairement à radar/studio, aucune requête
# utilisateur ne dépend de ce process pour répondre — le laisser prendre
# son temps pour s'arrêter proprement (fermeture SQLite, cf.
# pipeline-worker.ts) ne retarde jamais un déploiement visible.
pm2 start /opt/media-labs/start-radar-pipeline.sh --name radar-pipeline --cwd "$REPO_DIR/RADAR" --max-memory-restart 3000M --kill-timeout 60000
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
# Même filet de sécurité pour studio (finding P2-bis, 15 sept. 2026) —
# le piège PM2 documenté ci-dessus n'a jamais été observé spécifiquement
# sur studio, mais rien ne garantit qu'il en soit à l'abri : même classe de
# bug (flag ignoré sur un `start` frais), même correctif préventif.
pm2 restart studio --update-env --max-memory-restart 2000M
pm2 restart radar-pipeline --update-env --max-memory-restart 3000M
pm2 save

# Finding 3.2 (AUDIT-PRODUCTION-READINESS, 15 sept. 2026) : ce script
# affirmait déjà que le filet de sécurité ci-dessus "corrige la valeur de
# façon vérifiée à chaque fois" — mais ne le vérifiait plus jamais lui-même
# après ce premier constat manuel. Un déploiement où PM2 ignorerait le flag
# une troisième fois serait passé inaperçu jusqu'au prochain OOM en pleine
# ingestion. Vérification bloquante plutôt qu'une confiance renouvelée à
# chaque déploiement. Étendue à studio (finding P2-bis) pour la même raison.
echo "  Vérification des plafonds mémoire radar/studio/radar-pipeline..."
MEM_LIMITS=$(pm2 jlist | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    const procs = JSON.parse(data);
    const radar = procs.find(p => p.name === 'radar');
    const studio = procs.find(p => p.name === 'studio');
    const worker = procs.find(p => p.name === 'radar-pipeline');
    console.log((radar ? radar.pm2_env.max_memory_restart : '0') + ' ' + (studio ? studio.pm2_env.max_memory_restart : '0') + ' ' + (worker ? worker.pm2_env.max_memory_restart : '0'));
  });
")
RADAR_MEM_LIMIT=$(echo "$MEM_LIMITS" | cut -d' ' -f1)
STUDIO_MEM_LIMIT=$(echo "$MEM_LIMITS" | cut -d' ' -f2)
WORKER_MEM_LIMIT=$(echo "$MEM_LIMITS" | cut -d' ' -f3)
if [ "$RADAR_MEM_LIMIT" != "3145728000" ]; then
    echo "  ❌ Plafond mémoire radar incorrect après redémarrage : $RADAR_MEM_LIMIT (attendu 3145728000 = 3000M)"
    echo "     PM2 a de nouveau ignoré --max-memory-restart — voir SESSION-START.md, 'Piège PM2'."
    exit 1
fi
if [ "$STUDIO_MEM_LIMIT" != "2097152000" ]; then
    echo "  ❌ Plafond mémoire studio incorrect après redémarrage : $STUDIO_MEM_LIMIT (attendu 2097152000 = 2000M)"
    echo "     PM2 a ignoré --max-memory-restart sur studio — même piège que radar, voir SESSION-START.md."
    exit 1
fi
if [ "$WORKER_MEM_LIMIT" != "3145728000" ]; then
    echo "  ❌ Plafond mémoire radar-pipeline incorrect après redémarrage : $WORKER_MEM_LIMIT (attendu 3145728000 = 3000M)"
    echo "     PM2 a ignoré --max-memory-restart sur radar-pipeline — même piège que radar, voir SESSION-START.md."
    exit 1
fi
echo "  ✅ Plafonds mémoire confirmés : radar 3000M, studio 2000M, radar-pipeline 3000M"

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

# Le worker pipeline vient de redémarrer sans avoir encore déclenché de
# cycle (déclenchement immédiat uniquement si la base est vide, cron.ts) —
# son endpoint /health répond donc rapidement ici, dans le cas normal d'un
# déploiement. Un worker qui ne répond même pas à ça est un vrai échec de
# déploiement (dist-worker cassé, dépendance manquante) — bloquant comme
# radar/studio, pas juste informatif.
if ! check_url "http://127.0.0.1:3000" || ! check_url "http://127.0.0.1:3002" || ! check_url "http://127.0.0.1:3010/health"; then
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
    cd "$REPO_DIR/RADAR"
    if [ -d dist-worker.bak ]; then
        rm -rf dist-worker
        mv dist-worker.bak dist-worker
        echo "  ↩ radar-pipeline : dist-worker précédent restauré"
    fi
    pm2 restart radar studio radar-pipeline 2>/dev/null || true
    echo "  Les apps tournent sur le dernier build qui fonctionnait — le nouveau code n'a PAS été mis en ligne."
    exit 1
fi

echo ""
echo "=== DONE ==="
echo "  https://89.168.53.133.nip.io/        → RADAR  (via nginx, HTTPS)"
echo "  https://studio.89.168.53.133.nip.io/ → STUDIO (via nginx, HTTPS)"
echo "  http://89.168.53.133:3000 → RADAR direct (debug uniquement)"
echo "  http://89.168.53.133:3002 → bloqué par la Security List Oracle Cloud, ne pas utiliser publiquement"
echo "  radar-pipeline (127.0.0.1:3010, interne) → pipeline RSS/embeddings/traduction, séparé du serveur web depuis le 16 sept. 2026"
