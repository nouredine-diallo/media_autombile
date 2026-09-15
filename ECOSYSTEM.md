# ECOSYSTEM.md — Comportement réel de la plateforme Media Labs Automobile

> **Fichier unique de référence sur le comportement actuel** des deux applications
> (RADAR + STUDIO) : ports, session partagée, assistant (`/api/assistant`),
> kill-switch, mascotte, brouillons IA, empty states.
>
> **Vérifié le 2026-08-28**, puis **corrections ciblées le 2026-09-14** (HTTPS,
> infra PM2 réelle, horaire pipeline — voir §10) contre le code source et l'état
> réel des serveurs (`ss`, lecture des routes/du moteur/du widget, tests
> navigateur de la session, SSH direct sur la VM prod).
> Ce fichier est la vérité tant que le code dit pareil — s'il y a divergence,
> **corriger ce fichier** (et/ou le code) et non un autre doc.

---

## 1. Vue d'ensemble des deux apps

| | RADAR (veille / pipeline) | STUDIO (création de posts) |
|---|---|---|
| Rôle | Veille auto, événements, articles, pipeline RSS, publication | Création visuelle de posts (6 gabarits), export HD / Google Drive |
| Stack | Next.js (App Router) + SQLite (better-sqlite3) | Next.js (App Router), modeles d'image locaux |
| Port (dev = prod, PM2 direct, pas de Docker) | **3000** | **3002** |
| Accès public prod | `https://89.168.53.133.nip.io/` (nginx → 127.0.0.1:3000) | `https://studio.89.168.53.133.nip.io/` (nginx → 127.0.0.1:3002) |
| Auth | Mot de passe (`AUTH_PASSWORD`, défaut `work`) + session cookie `session` | Mot de passe (`AUTH_PASSWORD`, défaut `work`) + session cookie `session` |
| Session | **Partagée** avec STUDIO (même cookie `session`, même clé `SESSION_SECRET`) | **Partagée** avec RADAR |
| Fiches assistant | 18 | 10 |

Domaines : **prod réelle et unique** → `89.168.53.133.nip.io` (RADAR) /
`studio.89.168.53.133.nip.io` (STUDIO), servis en **HTTPS** (Let's Encrypt,
`setup-ssl.sh`) depuis le 14 sept. 2026 — redirection automatique depuis le
HTTP. `radar.media-labs.is-a.dev` / `studio.media-labs.is-a.dev`
(référencés dans `GOOGLE_REDIRECT_URI` du `.env` prod) sont un **domaine mort,
jamais activé** — ne jamais le documenter comme « prod annoncée », c'est une
config OAuth orpheline, pas une adresse réelle du produit.
Budget : 0 €, VM Oracle Cloud ARM (2 vCPU, 11 Go RAM, sans GPU — vérifié
`nproc`/`free -h` le 14 sept. 2026).

> ⚠️ Correction de la session (2026-08-28) : `ONBOARDING.md` disait « RADAR port 3001 »
> en dev. La réalité vérifiée : **dev = 3000**, 3001 n'existe qu'en prod Docker.

---

## 2. Session partagée (comment ça marche)

- Cookie unique **`session`** posé par les deux apps :
  `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, expiration **7 jours**
  (`Date.now() + 7*24*60*60*1000`).
  **Depuis le 14 sept. 2026 (HTTPS actif)** : `secure: true` +
  `domain: .89.168.53.133.nip.io` (`SESSION_COOKIE_SECURE`/`SESSION_COOKIE_DOMAIN`
  dans le `.env` prod partagé, lus par `src/lib/session.ts` des deux apps) — c'est
  ce qui fait qu'une connexion sur RADAR est **réellement reconnue par STUDIO sans
  redemander le mot de passe**, testé en conditions réelles (login RADAR →
  navigation STUDIO, aucune re-connexion). Avant cette date, le cookie n'avait pas
  `secure` (tout tournait en HTTP) — ne plus documenter ce comportement.
- Les deux apps signent/déchiffrent avec le **même `SESSION_SECRET`** (les valeurs
  des deux `.env.local` sont strictement identiques — hash vérifié) et le **même
  fallback codé en dur** dans `src/lib/session.ts`.
- Du fait de `sameSite=lax` + même clé, **un login RADAR est accepté par STUDIO et
  réciproquement** : une seule authentification couvre les deux apps sur le même
  domaine parent.
- Payload : RADAR signe `{ userId, userName, expiresAt }` ; STUDIO signe
  `{ userId, expiresAt }`.
- Protections :
  - Toutes les pages des deux apps sont protégées par un middleware/session
    (hors `/login`, `/select-name`, API d'état système).
  - **Toutes les API RADAR exigent une session** (règle R5) sauf
    `/api/system/status` (exempté exprès).
  - Exemple toléré : `randomUUID` ne doit pas être appelé hors HTTPS côté client
    (cause réelle historique de « This page couldn't load »).

---

## 3. L'assistant — API `/api/assistant`

Route identique dans les deux apps :
`RADAR/src/app/api/assistant/route.ts` et `studio/src/app/api/assistant/route.ts`.

### 3.1 Kill-switch et sécurité

```
ASSISTANT_ENABLED ≠ "false"  →  activé (défaut : absent = activé)
ASSISTANT_ENABLED == "false" →  désactivé → toutes requêtes = 503 { error: "Assistant désactivé" }
```

Chaque requête passe par `assertEnabled()` :
1. kill-switch → **503** ;
2. pas de session → **401** `{ error: "Non authentifié" }` ;
3. sinon on traite.

`runtime = "nodejs"`, `dynamic = "force-dynamic"` : pas de cache, calcul servi
à chaud.

### 3.2 Modes de requête

| Requête | Réponse |
|---|---|
| `GET /api/assistant` | `{ success, starters }` — les chips d'accueil (5 pour chaque app) |
| `GET /api/assistant?id=<id>` | Résolution **déterministe** (jamais de recherche floue) : `{ success, reply: { match, matchRelated, suggestions: [], directory, confidence: 1 } }` — **404** `{ error: "Fiche introuvable" }` si l'id n'existe pas |
| `POST /api/assistant` `{ "q": "..." }` | `{ success, reply }` — **400** si `q` vide/non-chaîne |

`reply` est toujours :
`{ match: Fiche|null, matchRelated: {id,title}[], suggestions: Fiche[], directory: string[], confidence: number }`.
`matchRelated` = les `related` de la fiche **résolus en {id, title}** (l'UI ne voit
jamais un id technique brut). `directory` = la liste des titres de la base
(`RADAR_DIRECTORY` / connaissance STUDIO).

### 3.3 Le moteur (TF-IDF pur TS, zéro dependance, zéro LLM)

`RADAR/src/lib/assistant/intents.ts` et `studio/src/lib/assistant/intents.ts` :
**fichiers strictement identiques** (symétrie garantie entre les deux apps).

- **Pourquoi TF-IDF** (2026-08-28, remplace le token-matching pur initial) :
  corpus petit et fermé (18/10 fiches) ; RADAR possède déjà un embedding local
  (`@xenova/transformers`, multilingual-e5-small, réutilisé pour le clustering
  d'events dans `lib/embeddings.ts`), mais STUDIO ne l'a pas — re-dupliquer le
  modèle (~113 Mo) violerait la règle de stack figée et la contrainte VM ARM.
- **Tokenisation FR** : minuscules, NFD sans accents, apostrophes remplacées par
  des espaces, tout non-`[a-z0-9]` → espace ; stopwords (~60 mots fr) et mots de
  moins de 3 lettres retirés ; **unigrammes + bigrammes** (`mot1_mot2`).
- **Pondération des champs** : `title: 4`, `keyword: 3`, `phrase: 2`,
  `description/steps/tips: 1` — les champs curatés à la main pèsent plus que la
  prose.
- **TF-IDF** : `idf = log((N+1)/(df+1)) + 1`, score = **cosinus** entre le vecteur
  de la question et chaque fiche, **normalisé**.
- **Bonus phrase** : si une `phrases` de la fiche apparaît en sous-séquence
  contiguë dans la question → `+ 0.35 × nombre de mots`.
- **Correction de fautes** : un token inconnu du vocabulaire est corrigé contre le
  terme le plus proche si préfixe de 4 partagé (rang 2) ou Levenshtein ≤ 1 (rang 1,
  tokens ≥ 5 lettres).
- **Seuils** : `minScore = 0.16` (en dessous → `match: null`), `limit = 3`
  suggestions, score renvoyé comme `confidence`.
- Si la question n'a aucun terme significatif : `match: null`, suggestions = les 3
  premières fiches, `confidence: 0`.
- Aucun appel réseau, < 1 ms, `buildCorpusIndex` recalculé à chaque requête.

### 3.4 Les bases de connaissance

**RADAR — 18 fiches** (`RADAR/src/lib/assistant/knowledge.ts`) :
`connexion, dashboard, veille, rediger, valider, publier, planifier, calendrier,
partenaires, stats, drive, pipeline, brouillons, corrections, style_guide, studio,
raccourcis, image_visuels`.
Starters (ordre affiché) : `rediger, publier, brouillons, raccourcis, pipeline`.

**STUDIO — 10 fiches** (`studio/src/lib/assistant/knowledge.ts`) :
`debuter, gabarits, titres, images, bulles, carrousel, export, drive_connect,
pipeline_upscale, verification`.
Starters : `debuter, gabarits, titres, export, carrousel`.

**Token `$STUDIO` (RADAR uniquement)** : les fiches RADAR qui pointent vers STUDIO
utilisent le token `$STUDIO` dans `fiche.link.href`. `resolveKnowledge` le remplace
une seule fois au démarrage par l'URL réelle, dans l'ordre de priorité
`getStudioUrl()` : `NEXT_PUBLIC_STUDIO_URL` > `STUDIO_URL` > fallback
`http://89.168.53.133:3002`. Côté STUDIO pas de token : liens internes relatifs.

### 3.5 Le widget (les deux apps, composants identiques)

`src/components/assistant/` : `AssistantLauncher.tsx`, `AssistantWidget.tsx`,
`Mascot.tsx`, `mascot-art.ts`, `assistant.css`.

- Monté **une fois dans `layout.tsx`** (donc sur toutes les pages), **masqué sur
  `/login`, `/select-name`, `/login/`** (`HIDDEN_PATHS`, même set dans les 2 apps).
- Flux réseau observé : `GET /api/assistant` (starters au chargement),
  `POST /api/assistant` (question envoyée), `GET /api/assistant?id=` (clic sur une
  chip starter / fiche liée — jamais de re-recherche floue).
- `.lma-avatar` rend la mascotte ; les chips starters s'affichent même sans
  coupure d'état (l'état du widget est local au composant).
- **Déplaçable depuis le 15 sept. 2026** : le bouton flottant (`.lma-launcher`)
  se glisse (Pointer Events, `touch-action: none` pour le tactile), position
  mémorisée par appareil (`localStorage`, clampée à la fenêtre). Un tap simple
  (déplacement < 6px) garde son comportement d'origine (ouvrir/fermer) —
  ajouté suite à une gêne signalée sur mobile (le bouton fixe pouvait
  recouvrir un bouton d'action selon la page).

### 3.6 Kill-switch côté UI

Il n'y a **pas** de masque visuel du widget lié à `ASSISTANT_ENABLED` :
le kill-switch agit au niveau de l'API (503). Le launcher n'est masqué que par
`HIDDEN_PATHS`.

---

## 4. La mascotte (Mascot.tsx + mascot-art.ts)

- **`mascot-art.ts`** — « Mascotte LMA — géométrie SVG dessinée à la main »,
  version **`ART_VERSION = "2026-08-28-2"`** (révision 2).
  - **Historique** : v1 exportait tête + yeux depuis le studio
    `bible-strong-avatar-lab` (`packages/avatar-core`) ; le « corps » exporté
    (lobes ovale + renflement) ne se lisait pas comme des roues/antenne une fois
    rendu (vérifié par rendu réel, `scripts/e2e-test/render-mascot.mjs`).
  - **Conservés** : la tête + les **4 jeux d'yeux** `idle / thinking / happy /
    perplexed` (revérifiés par rendu).
  - **Réécrits à la main** : le corps — antenne (tige capsule + bille, bille verte
    `#4ADE80` quand `happy`, sinon `#DA675E`) + **deux roues** (r 23, centrées un
    peu au-dessus du bas, comme des roulettes) ; tête `#CA3E3E`, roues `#8F2626`.
    Chaque partie ciblable en CSS (micro-interactions dans `assistant.css` :
    `.lma-blink`, `.lma-bob`, `.lma-antenna--thinking`).
- États discrets (pas d'animation interminable) : message `.lma-bob` sur
  `idle/happy`, paupières `.lma-blink` sinon, antenne qui oscille en `thinking`.
- La mascotte répond au contexte : brouillons IA → `happy` si `passed > 0` sinon
  `perplexed` ; onglet d'accueil STUDIO → `happy` ; widget → état selon
  démarrage/réflexion/réponse.

> Note licence : le studio `bible-strong-avatar-lab` est un outil de composition ;
> le corps final est redessiné ici (géométrie explicite), la tête+yeux sont issus
> de l'export du studio. Les polices vendues par l'écosystème : Nimbus (clone
> Helvetica) est **AGPL-3 avec exception** (`studio/src/components/gabarits/fonts.ts`).

---

## 5. Brouillons IA (« du matin »)

- Le **pipeline tourne 2x/jour, 6h et 18h heure de Paris** (`cron '0 4,16 * * *'`,
  configurable en base via `pipeline_config` — `RADAR/src/lib/cron.ts`) : ingestion
  RSS, scoring, clustering (embeddings e5-small), fact-checking, contrôle qualité
  automatique. **Changé le 14 sept. 2026** (était toutes les 4h) — cause : le
  pipeline tourne dans le **même process Node que le serveur web** (pas de worker
  séparé), son calcul intensif (embeddings + traduction locale ONNX) bloque le
  thread JS et rend le site **totalement inaccessible** pendant toute sa durée
  (30-50 min), vérifié en prod réelle. 2x/jour hors heures de bureau réduit le
  risque sans l'éliminer — voir `TODO.md` §3.3 pour l'analyse complète et la
  solution structurelle recommandée (process séparé), pas faite à ce jour.
- Il **auto-génère des brouillons marqués « GÉNÉRÉ PAR L'IA »** (badge affiché dans
  l'UI). Ils ne sont **jamais publiés sans validation humaine**.
- Écran d'accueil RADAR (Serveur) : `morningAutoGen` expose `attempted`, `passed`,
  `drafts` → bannière « Brouillons du matin » avec compteur
  `passed/attempted`, liste des drafts, mascotte `happy`/`perplexed`.
- **Contrôle qualité auto** : les brouillons qui n'ont pas passé la QA sont
  **retirés automatiquement** — message empty state : « Aucun des N brouillons
  n'a passé le contrôle qualité ce matin — retirés automatiquement, rien à valider. »
- Le flux complet : événement → « Rédiger » → STUDIO (prefill titre/image/source/
  chapeau) → retour → valider (contrôle qualité) → « Prêt à publier » → publier/
  planifier.

---

## 6. Empty states (états vides)

Le composant **`EmptyState`** (`RADAR/src/components/ui` / `studio`) est utilisé quand
les données manquent, avec icône + titre + message + (parfois) action :

| Écran | Empty state |
|---|---|
| RADAR — Statistiques | `EmptyState` (pas encore de stats) |
| RADAR — Drive | `EmptyState` (aucun export) |
| RADAR — Partenaires | `EmptyState` + `SkeletonRows` pendant chargement |
| RADAR — Analytics | `EmptyState` |
| RADAR — Calendrier | « Aucun événement » (semaine vide) |
| RADAR — Brouillons du matin | Bannière de retrait auto (cf. §5) |
| STUDIO — Accueil | mascotte `happy` en accueil ; pas d'état vide agressif |

Règle UX maintenue dans la session : les états vides **calibrent l'attente**
(« voilà ce qui arrivera ici ») au lieu d'afficher une page nue.

---

## 7. Workflow RADAR → STUDIO (prefill et export)

- **Build des liens STUDIO** : `RADAR/src/lib/studio-prefill.ts`, résolution
  `getStudioUrl()` (§3.4). Prefill complet : titre, image, source, chapeau →
  `.../titres?prefill=...` (et `/titres/carrousel` pour les carrousels).
- **Export Google Drive** : inline (polling, **pas de navigation**) ; export local
  possible sans Drive (fix 2026-08). STUDIO garde les exports dans `studio-uploads`.
- Rappel historique de la session : « exporter un gabarit noir » en prod venait
  d'un placeholder d'image jamais commité — attention, ne pas refaire.

---

## 8. Infra et déploiement

> **Corrigé le 14 sept. 2026** : cette section décrivait un déploiement Docker
> (`docker-compose.yml`) qui n'a **jamais tourné en prod** — vérifié directement
> sur la VM (`docker ps -a` → aucun conteneur, jamais créé). Le déploiement réel,
> celui manipulé en session, est **PM2 direct** : chaque app tourne via
> `next start` lancé par PM2 (`deploy/start-radar.sh` / `start-studio.sh`),
> `deploy/deploy.sh` orchestrant pull/build/restart. `docker-compose.yml` existe
> dans le dépôt mais est un vestige non utilisé — ne pas s'y fier pour comprendre
> la prod réelle.

- **PM2** (VM Oracle Cloud) : 2 process applicatifs, `radar` (port 3000) et
  `studio` (port 3002), plus `pm2-logrotate`. Lancés par `deploy/start-radar.sh` /
  `start-studio.sh` (source `/opt/media-labs/.env`, partagé, non versionné),
  orchestrés par `deploy/deploy.sh` (pull, build, copie configs, restart PM2,
  vérification post-déploiement avec retour arrière automatique si échec).
- **Limites mémoire PM2** (`--max-memory-restart`) : `studio` à 400M ; `radar` à
  **3000M** (relevé le 14 sept. 2026 depuis 400M — le pic réel mesuré au
  chargement des modèles embeddings + traduction locale tourne autour de
  1.5-1.6 Go, 400M causait des redémarrages en boucle en pleine ingestion,
  `pm2.log` : `current_memory=1005432832`/`1634156544` octets contre
  `max_memory_limit=419430500`/`1572864000`).
  **Régression trouvée le 15 sept. 2026** : `pm2 start ... --max-memory-restart
  3000M` (dans `deploy.sh`) n'applique pas toujours cette limite sur `radar` —
  `pm2 describe radar` a montré `419430400` (400M, la valeur de STUDIO) après
  un déploiement standard, alors que `--kill-timeout` de la même commande
  s'appliquait bien. Cause exacte côté PM2 non identifiée. `pm2 restart radar
  --update-env --max-memory-restart 3000M` corrige la valeur de façon fiable
  (vérifié) — `deploy.sh` l'exécute désormais en filet de sécurité juste après
  le `pm2 start`. Vérifier `pm2 jlist` après chaque déploiement.
- `nginx/` : conf HTTPS finale (`nginx/media-labs-ssl.conf`, installée par
  `setup-ssl.sh` une fois le certificat obtenu) — `server_name 89.168.53.133.nip.io`
  → `127.0.0.1:3000`, `server_name studio.89.168.53.133.nip.io` →
  `127.0.0.1:3002`, redirection HTTP→HTTPS + challenge ACME sur le bloc HTTP.
  Conf bootstrap HTTP-only (`nginx/media-labs.conf`) gardée pour un tout premier
  déploiement avant obtention du certificat.
- Variables d'env présentes (`/opt/media-labs/.env`, partagé entre les deux apps,
  présence vérifiée) :
  - **RADAR** : `AUTH_PASSWORD, SESSION_SECRET, GROQ_API_KEY, OPENROUTER_API_KEY,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, IMPORT_SECRET,
    STUDIO_URL, NEXT_PUBLIC_STUDIO_URL, STUDIO_IMPORT_URL, SESSION_COOKIE_SECURE,
    SESSION_COOKIE_DOMAIN`.
  - **STUDIO** : `AUTH_PASSWORD, SESSION_SECRET, GROQ_API_KEY, IMPORT_SECRET,
    RADAR_URL, SESSION_COOKIE_SECURE, SESSION_COOKIE_DOMAIN`.
- Même fichier `.env` pour les deux apps (`SESSION_SECRET`/`AUTH_PASSWORD`
  identiques) — c'est ce qui matérialise la session partagée en prod.

### 8.1 Pare-feu à deux niveaux (finding F7, audit 2026-09-07)

La VM Oracle Cloud est filtrée par **deux pare-feu indépendants et empilés** —
un port n'est joignable de l'extérieur que si les DEUX l'autorisent. Cette
information était éparpillée en commentaires (`deploy/deploy.sh`,
`setup-ssl.sh`, `nginx/media-labs.conf`) ; consolidée ici, une fois.

1. **`iptables` sur la VM elle-même** — modifiable par script, ce que fait le
   déploiement. Règles appliquées automatiquement à chaque `deploy.sh`
   (`deploy/deploy.sh`, étape « Open firewall ») : ports **80** (HTTP/nginx),
   **3000** (RADAR direct), **3002** (STUDIO direct). Le port **443** (HTTPS)
   est ajouté séparément par `setup-ssl.sh` lors de l'activation SSL.
2. **La Security List Oracle Cloud (niveau VCN)** — un pare-feu géré depuis la
   console web Oracle Cloud, **pas depuis la VM** : aucun script de ce dépôt
   ne peut la modifier. Elle doit être ouverte **manuellement** pour chaque
   port destiné à un accès public, en plus de la règle `iptables`
   correspondante.

**État confirmé (session du 27 août 2026, vérifié par test réel)** :
- Port **3002** (STUDIO direct, `http://<IP>:3002`) : **bloqué** par la
  Security List — `iptables` l'autorise mais la Security List non. Ne jamais
  documenter ou utiliser cette adresse comme accès public (voir le rappel
  affiché par `deploy.sh` en fin d'exécution) ; l'accès public passe par
  nginx sur le port 80/443 (`studio.<IP>.nip.io`), déjà ouvert des deux
  côtés.
- Port **22** (SSH) : bloqué côté Security List depuis les réseaux testés en
  session — accès SSH réel non disponible sans une connexion depuis un
  réseau où ce port est explicitement autorisé (5G de l'utilisateur,
  confirmé fonctionner).
- Port **443** (HTTPS, ajouté par `setup-ssl.sh`) : la règle `iptables` est
  posée automatiquement par le script, mais **la Security List doit être
  ouverte à la main** dans la console Oracle Cloud avant que Let's Encrypt
  (`certbot`) ou tout accès HTTPS externe ne fonctionnent — `setup-ssl.sh`
  l'affiche comme rappel bloquant, pas comme une étape qu'il peut effectuer
  lui-même.

**Règle pratique pour toute nouvelle brique réseau** : avant de documenter un
port comme « accessible publiquement », vérifier les deux niveaux — une
règle `iptables` qui fonctionne ne garantit rien côté Security List, et
inversement.

---

## 9. État du code et santé

- `npm run build` est la porte d'entrée de validation (règle « pas de push sans
  build »). Aucune dépendance nouvelle hors stack figée (§3 des CLAUDE.md).
- **RADAR/CLAUDE.md** est plus récent (27-08) que **studio/CLAUDE.md** (23-08) —
  en cas de conflit sur STUDIO, le CLAUDE.md du dossier concerné gagne (AGENTS.md).
- Sources de vérité officielles (`AGENTS.md`) : `ONBOARDING.md`, `TODO.md`,
  `ECOSYSTEM.md` (ce fichier), `RADAR/CLAUDE.md`, `studio/CLAUDE.md`,
  `RADAR/CLAUDE_DASHBOARD.md`.

---

## 10. Ce qui a été corrigé pendant la rédaction de ce fichier (2026-08-28)

1. **`ONBOARDING.md`** : « RADAR (port 3001) » → **3000** (dev, vérifié par `ss`).
2. **`AGENTS.md`** : la référence à `CLAUDE_DASHBOARD.md` (racine) pointait sur un
   fichier **inexistant** (seul `RADAR/CLAUDE_DASHBOARD.md` existe) ; référencé le
   bon chemin et ajouté `ECOSYSTEM.md` dans la table des sources de vérité.

## 10.1 Corrections du 2026-09-14 (activation HTTPS + passage prod réel)

Ce fichier décrivait un état antérieur à l'activation HTTPS et contenait une
section infra jamais réellement en service. Corrigé après vérification directe
sur la VM prod (SSH, `pm2`, `docker ps -a`, tests navigateur réels) :

1. **§1** : domaine « prod annoncée » (`*.media-labs.is-a.dev`) clarifié comme
   config OAuth morte, jamais servie — la seule prod réelle est
   `89.168.53.133.nip.io` (HTTPS). Table de ports corrigée (pas de mapping
   Docker, PM2 direct).
2. **§2** : cookie de session documenté comme non-`secure` (HTTP) — faux depuis
   l'activation HTTPS ; `secure: true` + `domain` partagé confirmés actifs et
   testés (partage de session RADAR↔STUDIO réel, sans re-connexion).
3. **§5** : horaire du pipeline « toutes les 4h » → **2x/jour (6h/18h Paris)**,
   changé ce jour pour limiter (pas éliminer) le blocage du site pendant les
   cycles — cause de fond et solution recommandée documentées dans `TODO.md`
   §3.3. La fiche assistant correspondante (`RADAR/src/lib/assistant/knowledge.ts`,
   id `pipeline`) a aussi été corrigée pour ne plus induire l'équipe en erreur.
4. **§8** : section infra réécrite — décrivait un déploiement Docker
   (`docker-compose.yml`) **jamais utilisé en prod** (`docker ps -a` vérifié :
   aucun conteneur). Le vrai déploiement est PM2 direct (`next start` via
   `deploy/start-radar.sh`/`start-studio.sh`), documenté avec les limites
   mémoire réelles (`radar` relevé 400M→3000M après des redémarrages en boucle
   mesurés en prod) et la conf nginx HTTPS finale.