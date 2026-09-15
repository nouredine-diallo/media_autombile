# Prompt de début de session — à coller tel quel

Reprends le projet media_autombile (RADAR + STUDIO). Avant toute action, lis
`ONBOARDING.md` (point d'entrée, procédure de déploiement, ce qui a été tenté et
a échoué), `ECOSYSTEM.md` (comportement réel vérifié), et `TODO.md` (tâches et
blocages, §3.3 en particulier).

**Ne re-fais pas ce qui est déjà fait** (vérifié en prod réelle le 15 sept.
2026, pas supposé) :
- HTTPS actif, session partagée RADAR↔STUDIO fonctionnelle, base prod nettoyée.
- Limites mémoire PM2 (radar à 3000M) — **corrigées deux fois** : une première
  fois le 14 sept., une régression trouvée et re-corrigée le 15 sept. (voir
  "Piège PM2" ci-dessous, à surveiller à chaque déploiement).
- Cron réduit à 2x/jour (6h/18h Paris).
- **Faux timeout + doublons LLM sur la génération de brief/article (RADAR)** :
  `apiFetch` avait un timeout client (15s) plus court que ce que le serveur
  peut légitimement prendre (30s-2min) ; corrigé (timeouts alignés,
  `generationLock.ts` empêche un doublon de calcul si l'utilisateur réessaie
  après un faux timeout). Vérifié en prod par requêtes concurrentes réelles :
  `[409, 200]`, aucun redémarrage du process.
- **Tous les exports STUDIO étaient cassés en prod** (`ERR_SSL_PROTOCOL_ERROR`
  — le rendu Playwright interne appelait sa propre origine en HTTPS alors que
  le process Next ne sert que du HTTP en clair sur son port loopback, séquelle
  de l'activation HTTPS du 14 sept.). Corrigé (`getInternalRenderOrigin()`,
  toujours `http://127.0.0.1:$PORT` pour les appels serveur-à-serveur).
  Vérifié en prod : export réel réussi, PNG téléchargé.
- **STUDIO (thème seul) pouvait halluciner des chiffres techniques** — aucune
  donnée réelle ne soutenait la consigne "chiffres concrets". Corrigé :
  `GET /api/facts-lookup` (RADAR, lecture seule, pas d'auth — appel
  serveur-à-serveur STUDIO→RADAR) cherche un event déjà ingéré et renvoie de
  vrais faits (phrases entières, jamais des chiffres isolés) ; prompt STUDIO
  interdit d'inventer un chiffre en leur absence. Vérifié en prod avec un seul
  appel Groq (thème "Nissan Pixo" → le vrai fait "slot beneath the Micra"
  ressort correctement en français).
- Chatbot (RADAR + STUDIO) déplaçable par glisser-déposer, position mémorisée
  par appareil — corrige la gêne signalée sur mobile.
- Logo STUDIO (en-tête) : badge "SA" remplacé par le logo Média Automobile +
  lien retour accueil (`BrandHomeLink.tsx`).
- Titre et texte CTA (fin de carrousel) : recadrage/zoom/déplacement manuel,
  même mécanisme que les images (`RecadrageFond`, réutilisé tel quel).
- Icône ✨ (Sparkles) retirée de toute l'UI (RADAR + STUDIO) ; labels de
  section ("En production", "Articles validés"...) en casse normale au lieu
  d'ALL-CAPS trackées — les deux étaient des signatures visuelles "IA
  générique" reconnues.

**Piège PM2 à surveiller** (trouvé le 15 sept., cause exacte côté PM2 non
identifiée) : `pm2 start ... --max-memory-restart 3000M` n'applique pas
toujours la limite sur `radar` (reste silencieusement à 400M, la valeur de
STUDIO) — alors que `--kill-timeout` de la même commande, lui, s'applique
correctement. `deploy.sh` a maintenant un `pm2 restart radar --update-env
--max-memory-restart 3000M` explicite juste après, vérifié fiable. **Après
tout déploiement, vérifier `pm2 jlist` → `pm2_env.max_memory_restart` pour
`radar` doit afficher `3145728000`, pas `419430400`** — si jamais le filet de
sécurité cesse de suffire, creuser pourquoi PM2 ignore le flag sur `start`.

**Ne re-tente pas ce qui a déjà échoué** (détail dans `ONBOARDING.md` §3) :
contrôle d'un navigateur visible en local (pas de Chrome/sudo — utiliser
Playwright headless, ça marche directement depuis ce réseau contre les URLs
publiques HTTPS, pas besoin d'être sur la VM), timeout JS pour interrompre un
calcul de traduction bloquant (ne marche pas, Node ne peut pas interrompre un
calcul natif en cours).

**Limite connue, pas résolue** : le pipeline RADAR tourne dans le même process
que le serveur web — le site est inaccessible pendant chaque cycle (30-50 min).
La solution (process PM2 séparé) est analysée en détail dans `TODO.md` §3.3,
prête à implémenter, mais pas faite — À FAIRE si le temps le permet cette
session, sinon la garder pour une session dédiée plutôt que la bâcler.

**Accès VM prod** : `ssh -i ~/.ssh/oracle-media-labs.key ubuntu@89.168.53.133`
— si ça timeout, c'est probablement le réseau local qui bloque le port 22 (déjà
vu plusieurs fois), pas la VM : vérifier `curl https://89.168.53.133.nip.io/`
d'abord avant de conclure à une panne. Le 15 sept., SSH a été indisponible une
bonne partie de la session puis à nouveau accessible sans changement de réseau
identifié — retester avant de conclure au blocage.

**Quota LLM (Groq, partagé par toute l'équipe)** : lors de tests/vérifications,
préférer les chemins à coût nul (endpoints purement SQL comme
`/api/facts-lookup`, tests directs du code sans passer par un vrai appel
LLM, requêtes GET) et limiter les vrais appels Groq au strict nécessaire (1-2
par vérification). Documenté ici parce que c'est devenu une contrainte
explicite de l'utilisateur, pas juste une bonne pratique générale.

**Règles non négociables** : jamais de commit/push/déploiement en prod sans
demande explicite ; jamais d'action destructive sur la base prod sans backup
préalable et confirmation ; vérifier chaque affirmation technique contre le
code ou un test réel, jamais une supposition présentée comme un fait
(`RADAR/CLAUDE.md` §4).

Contexte de cette tâche précise : [DÉCRIRE ICI CE QUE VOUS VOULEZ FAIRE
AUJOURD'HUI]
