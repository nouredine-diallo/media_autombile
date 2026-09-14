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
# Finding E6 (audit 2026-09-07) : `exec npm start` remplaçait bien ce script
# par `npm`, mais `npm` lui-même lance `next start` dans un `sh -c` enfant
# séparé (pas un `exec` interne à npm) — vérifié réellement : SIGTERM envoyé
# au PID `npm` (exactement ce que fait PM2) tuait `npm` et `sh`, mais le
# vrai process Node (`next-server`, où vit le handler SIGTERM de
# startup.ts) restait en vie, orphelin, sans jamais recevoir le signal.
# `exec` direct sur le binaire `next` : plus aucune couche intermédiaire,
# ce script devient lui-même le process Next.js, SIGTERM PM2 l'atteint
# directement.
#
# NEXT_MANUAL_SIG_HANDLE : vérifié dans le code source de Next.js lui-même
# (node_modules/next/dist/server/lib/start-server.js) — sans ce flag, Next
# installe SON PROPRE handler SIGTERM/SIGINT qui appelle process.exit(143)
# après son propre nettoyage interne, en pure course avec celui de
# startup.ts. Testé réellement : sans le flag, un cycle d'ingestion en
# cours était coupé après ~300ms au lieu d'attendre — le handler de
# startup.ts perdait toujours la course dès qu'il devait patienter (son
# setTimeout cède la main, celui de Next s'exécute avant). Avec le flag,
# Next ne s'enregistre plus du tout sur ces signaux (source ci-dessus :
# `if (!process.env.NEXT_MANUAL_SIG_HANDLE) { process.on(...) }`) — c'est
# le mécanisme officiel documenté par Next.js pour ce cas précis
# ("Manual Graceful Shutdowns", self-hosting.md, mentionné pour Pages
# Router dans la doc mais le code source montre qu'il s'applique avant
# tout routage, donc aussi valable ici avec App Router + instrumentation.ts).
export NEXT_MANUAL_SIG_HANDLE=true
PORT=3000 exec ./node_modules/.bin/next start
