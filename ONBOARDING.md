# ONBOARDING — Session de travail

> **Fichier d'entrée pour toute nouvelle session.** Lis ce fichier AVANT de commencer.
> Il te donne l'état complet du projet, la procédure de déploiement, ce qui a été
> tenté et ce qui n'a pas marché, et les fichiers à consulter.
>
> **Mis à jour le 2026-09-15**, après une session de déploiement/durcissement
> complet en prod (migration HTTPS, correctifs mémoire/blocage, reset de la base
> de test). Avant cette date, ce fichier décrivait un état de dev pré-prod —
> remplacé, ne pas s'y fier.

---

## 1. État actuel du projet (2026-09-15)

### C'est en prod, réel, accessible à l'équipe
- **RADAR** : `https://89.168.53.133.nip.io/` — veille auto, événements, articles, pipeline RSS.
- **STUDIO** : `https://studio.89.168.53.133.nip.io/` — création de posts (6 gabarits), export Google Drive.
- **HTTPS actif** (Let's Encrypt) sur les deux, avec redirection automatique depuis HTTP.
- **Session partagée réelle** : se connecter sur RADAR suffit pour STUDIO (et inversement) — cookie `secure`, domaine partagé `.89.168.53.133.nip.io`, testé en conditions réelles.
- **Mot de passe équipe** : `AUTH_PASSWORD` dans `/opt/media-labs/.env` sur la VM (valeur par défaut historique : `work`, à vérifier/changer avant diffusion large à l'équipe).
- Workflow complet testé : login → dashboard → événement → génération brief/article → rejet/remplacement d'image → validation → génération post carrousel → ouverture STUDIO pré-rempli.

### Ajouté/corrigé le 15 sept. 2026 (après-midi), déployé et vérifié en prod réelle
- **Tous les exports STUDIO étaient cassés** (`ERR_SSL_PROTOCOL_ERROR`, séquelle
  de l'activation HTTPS du matin même) — corrigé, export réel testé et PNG
  téléchargé en prod.
- Faux timeout + doublons de génération LLM sur RADAR (brief/article) —
  corrigé, verrou anti-doublon vérifié par requêtes concurrentes réelles.
- STUDIO (mode thème seul) ancré sur de vrais faits RADAR quand disponibles
  (`/api/facts-lookup`), au lieu de pouvoir halluciner des chiffres.
- Chatbot déplaçable (glisser-déposer), logo STUDIO + retour accueil,
  recadrage manuel du titre/CTA, icône Sparkles retirée, labels ALL-CAPS →
  casse normale.
- **Piège trouvé pendant ce déploiement** : `pm2 start --max-memory-restart
  3000M` n'appliquait pas toujours la limite sur `radar` (silencieusement
  400M) — `deploy/deploy.sh` a maintenant un `pm2 restart --update-env`
  explicite juste après en filet de sécurité. Vérifier après chaque
  déploiement (`pm2 jlist`, champ `max_memory_restart` doit valoir
  `3145728000` pour radar).

### Ce qui NE fonctionne PAS encore (vérifié, pas supposé)
- **Upscale HD (STUDIO)** : le binaire `realesrgan-ncnn-vulkan` démarre, mais ses poids modèle (`.param`/`.bin`) n'ont **jamais été acquis** (`studio/CLAUDE.md` §3.2). Échec propre (503), pas un crash, mais fonctionnalité absente.
- **Guide de style éditorial** : n'existe toujours pas (`RADAR/CLAUDE.md` §2). Bloque la calibration fine de la rédaction LLM et de l'anti-plagiat. C'est humain, pas technique — nécessite le rédacteur en chef.
- **Scoring et anti-plagiat** : valeurs provisoires, jamais calibrées sur des vraies décisions humaines (pas assez de volume encore).
- **`GOOGLE_REDIRECT_URI`** (OAuth Drive) pointe vers un domaine jamais activé (`radar.media-labs.is-a.dev`) — trouvé dans le `.env` prod, pas corrigé.

### Limite d'architecture connue, non résolue
Le pipeline (ingestion RSS + embeddings + traduction locale, calcul CPU intensif) tourne **dans le même process Node que le serveur web** de RADAR. Pendant un cycle (30-50 min), **le site RADAR devient totalement inaccessible** pour tout le monde — pas une lenteur, aucune réponse HTTP. Mitigé le 14 sept. en réduisant le cron à 2 exécutions/jour hors heures de bureau (6h/18h Paris, `0 4,16 * * *`) au lieu de toutes les 4h — **mitigation, pas une solution**. La vraie solution (process PM2 séparé pour le pipeline) est documentée en détail dans `TODO.md` §3.3 mais **pas implémentée** — analyse complète, plan d'implémentation étape par étape, décision explicite de l'utilisateur de la reporter à une session dédiée plutôt que la faire à la hâte.

---

## 2. Procédure de déploiement (vérifiée, utilisée toute la session du 14 sept.)

### Accès à la VM prod
```bash
ssh -i ~/.ssh/oracle-media-labs.key ubuntu@89.168.53.133
```
**Attention réseau** : le port SSH (22) est bloqué par la Security List Oracle Cloud
depuis certains réseaux/proxys (observé plusieurs fois en session avec des
changements de connexion locale) — HTTPS (443) reste accessible même quand SSH
ne passe pas. Si SSH timeout : ce n'est pas la VM qui est down (vérifier
`curl https://89.168.53.133.nip.io/` d'abord), c'est le réseau local qui bloque
le port 22. Changer de connexion réseau résout généralement le problème.

### Déployer un changement de code
```bash
# Depuis le repo local, après avoir commité (jamais sans demande explicite de commit)
ssh ubuntu@89.168.53.133 "bash /opt/media-labs/deploy/deploy.sh"
```
`deploy.sh` fait : `git pull` (RADAR + STUDIO) → build (avec sauvegarde/retour
arrière automatique si le build échoue) → copie des configs nginx/PM2 → restart
PM2 → **vérification post-déploiement bloquante** (curl sur les deux apps, retour
arrière automatique si ça échoue) → banner `=== DONE ===` avec les URLs.

**Piège vérifié** : `NEXT_PUBLIC_*` (ex. `NEXT_PUBLIC_STUDIO_URL`) est inliné dans
le bundle **au build**, jamais relu au runtime — changer la variable d'environnement
seule (sans rebuild) n'a AUCUN effet sur les liens déjà buildés. Le build RADAR
doit être lancé avec cette variable explicitement (voir `deploy.sh` ligne du
`build_app` RADAR).

### Appliquer un correctif rapide sans passer par tout `deploy.sh`
Utilisé plusieurs fois en session pour des correctifs ciblés (un seul fichier) :
```bash
scp fichier.ts ubuntu@89.168.53.133:/opt/media-labs/RADAR/src/lib/fichier.ts
ssh ubuntu@89.168.53.133 "cd /opt/media-labs/RADAR && env NEXT_PUBLIC_STUDIO_URL='https://studio.89.168.53.133.nip.io' npm run build"
ssh ubuntu@89.168.53.133 "pm2 restart radar"
```
Toujours suivi d'une vérification réelle (curl sur l'endpoint concerné), jamais
d'une simple supposition que ça a marché.

### Vérifier l'état réel sans SSH (si SSH bloqué par le réseau)
Login via curl + cookie jar, puis appeler les API authentifiées directement :
```bash
curl -c cookies.jar -F '$ACTION_REF_1=' \
  -F '$ACTION_1:0={"id":"<voir /login pour l id courant>","bound":"$@1"}' \
  -F '$ACTION_1:1=["$undefined"]' -F '$ACTION_KEY=<voir /login>' \
  -F 'password=work' https://89.168.53.133.nip.io/login
curl -b cookies.jar https://89.168.53.133.nip.io/api/cron   # statut pipeline
```
(Les valeurs `$ACTION_*` sont générées par Next.js à chaque render de `/login` —
les relire dans le HTML de la page avant de construire la requête.)

### Base de données prod
- `/opt/media-labs/data/radar.db` (SQLite, better-sqlite3) — **toujours sauvegarder
  avant toute opération destructive** : `cp radar.db /opt/media-labs/backups/radar.db.avant-<description>-<date>`.
- Pas de client `sqlite3` CLI sur la VM — utiliser `node -e` avec `require('better-sqlite3')`
  directement (pattern utilisé toute la session), ou un script `.ts` dans `RADAR/scripts/`
  lancé avec `npx tsx` (module resolution : lancer depuis `/opt/media-labs/RADAR`,
  pas depuis un autre dossier, sinon les imports relatifs échouent).

---

## 3. Ce qui a été tenté et n'a PAS marché (pour ne pas re-essayer inutilement)

- **Contrôler un vrai navigateur visible sur la machine locale de l'utilisateur**
  (Playwright MCP) : échoue, Chrome n'est pas installé et il n'y a pas d'accès
  `sudo` pour l'installer (`npx playwright install chrome` échoue en demandant un
  mot de passe sudo interactif, impossible en session non-interactive). **Solution
  de contournement qui marche** : Playwright headless directement sur la VM prod
  (via `npx tsx` + script `chromium.launch()`), contre le vrai site en HTTPS —
  donne des résultats réels, juste invisibles à l'écran de l'utilisateur.
- **Timeout JS (`Promise.race`/`setTimeout`) pour interrompre un calcul de
  traduction bloquant** : ne marche pas. Vérifié empiriquement — un timeout de 15s
  posé autour d'un appel `translateTextLocal()` ne s'est jamais déclenché alors que
  l'appel a mis 40-60s. Node ne peut pas interrompre un calcul natif (ONNX) en
  cours depuis un timer JS, quel que soit le wrapper. La vraie protection est de
  réduire/éliminer le calcul lui-même (contenu traduit plafonné, ou process séparé),
  pas de l'entourer d'un timeout côté appelant.
- **`max_new_tokens` sur le modèle de traduction seul, sans agir sur la source** :
  insuffisant — un bloc de texte dégénéré (liste de titres sans ponctuation, cas
  réel event Bring a Trailer) a quand même mis 38-40s malgré le plafond de
  génération. La traduction du champ `content` brut scrapé a fini par être
  **désactivée entièrement** (seuls titre/résumé, courts et fiables, sont traduits)
  plutôt que continuer à chercher un plafond qui tienne dans tous les cas.
- **Process séparé pour le pipeline (worker/2e process PM2)** : analysé en détail,
  **pas implémenté** — décision explicite de l'utilisateur de reporter (changement
  structurel, mieux vaut du temps dédié qu'une implémentation à la hâte tard le
  soir). Plan complet dans `TODO.md` §3.3, prêt à reprendre tel quel.
- **Sous-agent (fork) pour une analyse longue en arrière-plan** : a échoué une fois
  par timeout technique (stream watchdog, pas de progrès pendant 600s) — refait
  directement en thread principal sans problème. Si un fork stalle, ne pas
  s'acharner à le relancer plusieurs fois : basculer en exécution directe.

---

## 4. Fichiers à lire en priorité

| Fichier | Pourquoi |
|---------|----------|
| `ECOSYSTEM.md` | **Comportement réel vérifié** — session, assistant, infra PM2/HTTPS, pare-feu. Source de vérité n°1 pour "comment ça marche vraiment". |
| `TODO.md` | Toutes les tâches, § 3.3 a l'analyse complète du problème pipeline/blocage avec la solution recommandée. |
| `RADAR/CLAUDE.md` | Constitution RADAR — interdits, stack figée, anti-hallucination. |
| `studio/CLAUDE.md` | Constitution STUDIO — décisions visuelles, gabarits, stack. |
| `AGENTS.md` | Sources de vérité, plugins, règles transversales. |

### Fichiers de code clés
| Fichier | Pourquoi |
|---------|----------|
| `RADAR/src/app/events/[id]/page.tsx` | Page événement — la plus complexe, génération brief/article/validation/carrousel. |
| `RADAR/src/lib/cron.ts` | Pipeline automatique — cible du futur process séparé (`TODO.md` §3.3). |
| `RADAR/src/lib/brief.ts` / `translateLocal.ts` | Génération de brief + traduction locale — contient les correctifs du 14 sept. (content non traduit, chunking dur). |
| `RADAR/src/lib/studio-prefill.ts` | Workflow RADAR → STUDIO, résolution `getStudioUrl()` (priorité `NEXT_PUBLIC_STUDIO_URL` > `STUDIO_URL` > fallback). |
| `deploy/deploy.sh` | Procédure de déploiement complète, commentée avec l'historique des bugs trouvés/corrigés. |
| `RADAR/src/lib/assistant/knowledge.ts` / `studio/.../knowledge.ts` | Contenu réel de l'assistant intégré (onboarding équipe) — pas `ECOSYSTEM.md`, qui ne l'alimente pas. |

---

## 5. Architecture technique réelle (pas Docker)

```
Internet (HTTPS, Let's Encrypt)
        │
        ▼
   nginx (VM Oracle Cloud, reverse proxy)
   ├── 89.168.53.133.nip.io          → 127.0.0.1:3000 (RADAR)
   └── studio.89.168.53.133.nip.io   → 127.0.0.1:3002 (STUDIO)
        │
        ▼
   PM2 (2 process, VM directe — PAS de conteneurs Docker)
   ├── radar   (next start, port 3000, --max-memory-restart 3000M)
   └── studio  (next start, port 3002, --max-memory-restart 400M)
        │
        ▼
   SQLite partagée : /opt/media-labs/data/radar.db
```

`docker-compose.yml` existe dans le dépôt mais **n'a jamais tourné en prod**
(vérifié : `docker ps -a` sur la VM ne montre aucun conteneur). Ne pas s'y fier.

### Variables d'environnement (`/opt/media-labs/.env`, partagé, non versionné)
`AUTH_PASSWORD, SESSION_SECRET, SESSION_COOKIE_SECURE, SESSION_COOKIE_DOMAIN,
GROQ_API_KEY, GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, STUDIO_URL,
NEXT_PUBLIC_STUDIO_URL, STUDIO_IMPORT_URL, RADAR_URL, DB_PATH`.

---

## 6. Règles de style (LMA)

- **Tutoiement** (pas de vouvoiement) — confirmé par de vrais posts.
- **Phrases courtes** : 15-25 mots.
- **Ton** : factuel-complice, pas corporate.
- **Types d'articles** : annonce, curiosité, comparatif, essai (détection par scoring).

---

## 7. Priorités recommandées (voir `TODO.md` pour le détail complet)

1. **Guide de style éditorial** — humain, pas technique, mais bloque la calibration de tout le reste. À démarrer en parallèle, pas après.
2. **Process pipeline séparé** (`TODO.md` §3.3) — le vrai fix du blocage récurrent du site. Toujours pas fait au 15 sept.
3. **Poids `realesrgan` (upscale HD)** + `GOOGLE_REDIRECT_URI` mort + points restants de la réduction de charge cognitive UI (`TODO.md` § Priorité 3, plusieurs items impact élevé/moyen encore ouverts).

**Fait le 15 sept. 2026** (ne plus reproposer) : export STUDIO cassé, faux
timeout/doublons LLM RADAR, ancrage factuel STUDIO, chatbot déplaçable, logo
STUDIO, recadrage titre/CTA, icône Sparkles + ALL-CAPS — voir la section
ci-dessus et `SESSION-START.md`.

---

## 8. Workflow de raisonnement (méthodologie agents, inchangé)

1. **Brainstorming** — comprendre le vrai besoin avant de coder.
2. **Writing plan** — plan d'implémentation, tâches vérifiables.
3. **TDD** — tests d'abord, code ensuite.
4. **Verification** — lint, typecheck, `npm run build`.
5. **Code review** — identifier ce qui a pu casser.

Règles absolues : ne jamais sauter ces étapes ; ne jamais modifier un gabarit
STUDIO sans justification visuelle ; ne jamais changer le comportement RADAR
sans vérifier les contraintes (`RADAR/CLAUDE.md` §4) ; toute dépendance nouvelle
vérifiée contre la stack figée ; pas de push sans que `npm run build` passe ;
**jamais de commit/déploiement en prod sans demande explicite de l'utilisateur.**

---

## 9. Contacts

- **Développeur** : nouredine-diallo
- **Équipe** : 5 personnes
- **Budget** : 0€
- **Hébergement** : Oracle Cloud Always Free (VM ARM, 2 vCPU, 11-12 Go RAM, sans GPU)
