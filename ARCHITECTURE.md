# ARCHITECTURE — expliquée simplement

> Ce document explique le projet **Media Labs Automobile** (LMA) avec la **logique la plus
> élémentaire possible**, puis nomme — à chaque fois que c'est un concept connu — le
> **pattern / design / architecture** que le code illustre réellement.
>
> Objectif : un développeur qui débarque comprend *pourquoi* c'est fait comme ça, *où* chaque
> chose va, et peut dire *« ah, donc c'est ce pattern-là »*.

---

## Table des matières

1. [L'idée en une phrase](#1-lidée-en-une-phrase)
2. [La logique élémentaire : 3 rôles, 1 frigo](#2-la-logique-élémentaire--3-rôles-1-frigo)
3. [Un post passe par 3 histoires](#3-un-post-passe-par-3-histoires)
4. [La stack expliquée pièce par pièce](#4-la-stack-expliquée-pièce-par-pièce)
5. [La carte des fichiers importants](#5-la-carte-des-fichiers-importants)
6. [La mécanique interne : le cron, la base, la sécurité](#6-la-mécanique-interne--le-cron-la-base-la-sécurité)
7. [Le montage image expliqué pas à pas](#7-le-montage-image-expliqué-pas-à-pas)
8. [Les patterns qu'on rencontre — nommés](#8-les-patterns-quon-rencontre--nommés)
9. [Comment mettre en production](#9-comment-mettre-en-production)

---

## 1. L'idée en une phrase

**On surveille l'actu automobile (des flux RSS), on en fait de petits postes Instagram
composés automatiquement, et on les exporte vers Google Drive.** Tout ça pour une équipe de
5 à 10 personnes, avec un budget de 0 €, sur une seule machine gratuite.

Pour tenir dans ce budget, **deux petits programmes** (pas un géant) se partagent le travail,
et une **seule base de données SQLite** fait office de mémoire commune.

---

## 2. La logique élémentaire : 3 rôles, 1 frigo

Pense à une petite cuisine d'équipe :

```
        ┌──────────────── FRIGO (SQLite radar.db) ────────────────┐
        │   RADAR écrit dans le frigo.                              │
        │   STUDIO ne touche JAMAIS le frigo — il demande au       │
        │   cuisinier RADAR ce dont il a besoin.                   │
        └──────────────────────────────────────────────────────────┘

   RADAR                      STUDIO                    Google Drive
  ┌─────────┐   passe la      ┌─────────┐   donne le    ┌─────────┐
  │ le chef │── commande ───▶ │ le chef │── plat prêt ─▶│ le client│
  │ achète,  │                │ compose,│               │ reçoit  │
  │ vérifie, │                │ monte le│               │ le post │
  │ prépare  │                │ plat    │               │ final   │
  └─────────┘                └─────────┘               └─────────┘
```

| Brique | Métier | Traduction technique |
|--------|--------|---------------------|
| **RADAR** | Le chef qui prépare : il va acheter (flux RSS), garde tout dans le frigo (SQLite), trie, vérifie que les infos sont justes, et prépare des brouillons d'articles. | Next.js (port 3000). **Il possède la base de données. C'est le seul à l'écrire.** |
| **STUDIO** | Le chef qui compose le plat : il prend un article préparé (prefill), invente des titres, monte l'image avec un gabarit, et pose le résultat sur l'assiette (Google Drive). | Next.js (port 3002). **Zéro accès direct à la base : il parle à RADAR par HTTP.** |
| **SQLite** | Le frigo. | Un fichier `.db` partagé, posé sur le disque de la VM. Simple, gratuit, parfait pour 5-10 personnes. |
| **Nginx + PM2** | La porte d'entrée du restaurant et le surveillant. | Nginx envoie chaque sous-domaine vers la bonne app ; PM2 relance l'app si elle tombe. |

### Pourquoi 2 apps et pas 1 grosse ?

C'est le contraire d'un monolithe géant : deux morceaux moyennement gros, chacun avec **une
seule mission**. On peut développer, redémarrer et faire évoluer RADAR sans toucher STUDIO
(inversement). Le coût : il faut relier les deux par HTTP (voir §3).

> **🖼️ Pattern connu — c'est le « Monolithe Modulaire »**
> Deux applications indépendantes qui partagent de la donnée à travers une interface
> (HTTP), plutôt qu'une armée de microservices. Un bon compromis pour une petite équipe :
> simple à déployer (une seule VM), sans la lourdeur de la décomposition en microservices.

### Pourquoi STUDIO ne touche-t-il jamais au frigo ?

Si 2 programmes écrivaient dans le même fichier SQLite, ils se marcheraient dessus (conflits
d'écriture). En donnant la base **entièrement à un seul propriétaire**, plus de conflit
possible. C'est le principe : *une seule source de vérité, un seul écrivain*.

RADAR expose alors des « trous de service » (routes API) que STUDIO utilise pour signaler :
« cet article a été exporté », « voici l'aperçu généré », etc.

> **🖼️ Pattern connu — c'est l'« Encapsulation des données » (Data ownership)**
> Chaque service possède et protège ses données ; les autres n'y accèdent jamais directement,
> seulement via son API. Les données sont le périmètre du service, pas une ressource partagée
> au hasard.

<!-- Intégration possible : si un jour on ajoute grosseur, on remplacerait ce couple HTTP
par une vraie API REST documentée. Aujourd'hui, 3 routes publiques suffisent. -->

---

## 3. Un post passe par 3 histoires

### Histoire 1 — RADAR surveille tout seul (toutes les 4 h)

Le cron (une horloge) lance le « pipeline » :

```
1. Va chercher les articles des flux RSS (rss.ts)
       → on les range dans la table items (dédoublonnage par titre)
2. Calcule un « profil » de chaque article (embeddings)
       → c'est un résumé chiffré : 2 articles qui parlent de la même voiture
         ont des profils proches
3. Regroupe les articles proches en « événements » (scoring.ts)
       → 5 articles du même sujet deviennent 1 événement "Nissan dévoile sa X"
4. Donne un score à chaque événement (fraîcheur + nombre de sources)
5. Nettoie la table (rétention des vieilles données, voir §6.2)
6. Au matin, écrit des brouillons d'articles automatiquement
```

> **🖼️ Patterns connus ici :**
> - **« Traitement par lots » (Batch processing)** : un robot passe à heures fixes et
>   enchaîne des étapes. On ne réagit pas à un événement en direct — on poll.
> - **« Clustering sémantique » via similarité cosinus** : on compare les profils
>   (embeddings) pour regrouper. Un concept aujourd'hui standard en recherche/IA.
> - **« Déduplication »** : deux niveaux — clé unique exacte (`UNIQUE(title)`) + similarité.

### Histoire 2 — RADAR passe la commande à STUDIO (prefill)

Sur une fiche événement de RADAR, l'équipe clique « Créer un post ». RADAR fabrique un lien
avec **tout ce qu'il faut pour débuter** : titre, source, image, identifiant unique, chapeau.
Ces infos sont emballées dans l'URL (`?prefill=...`), en base64 (illisible mais pas un secret).

STUDIO ouvre ce lien, **décolle la commande** (`prefill.ts`), puis appelle l'IA pour générer
plusieurs titres, surtitres et paragraphes dans le style de la maison (`titles/router.ts`).

> **🖼️ Pattern connu — c'est le « Data transfer prefill » (pré-remplissage)**
> On fait passer un petit paquet de données entre deux systèmes dans l'URL. Simple, sans
> infrastructure, mais limité par la taille de l'URL (d'où le tronquage à 150/200
> caractères dans le code).

### Histoire 3 — STUDIO exporte (vers Google Drive)

```
1. L'opérateur compose le visuel (il voit l'aperçu)
2. « Exporter » → un vrai navigateur Chrome invisible (Playwright) prend
   une photo du visuel → PNG
3. Le PNG part vers Google Drive (googleapis)
4. STUDIO prévient RADAR : « l'article X a été exporté, voici le lien »
   (route /api/events/[contentId]/exported, autorisée sans session)
```

> **🖼️ Pattern connu — c'est le « principe de *what you see is what you get* » (WYSIWYG)**
> L'aperçu et l'export passent par **le même chemin de code** (le même composant React rendu
> dans un vrai navigateur). Impossible d'avoir un aperçu beau et un export raté : c'est
> littéralement la même photo.

---

## 4. La stack expliquée pièce par pièce

### Le langage commun

| Brique | Analogie | Explication |
|--------|----------|-------------|
| **Next.js 16** (×2) | La cuisine toute équipée | Framework qui gère les pages, les routes API, le build. Les 2 apps sont des apps Next.js. |
| **React 19** | Les meubles | Composants UI (dashboard, gabarits…). |
| **TypeScript 5** | Les étiquettes sur tout | Types partout → moins de bugs, meilleure doc. |
| **Tailwind CSS 4** | Les règles de déco | Styles utilitaires CSS. |

### La mémoire et l'IA

| Brique | Analogie | Explication |
|--------|----------|-------------|
| **SQLite (`better-sqlite3`)** | Le frigo | Base en fichier unique. RADAR seul l'écrit. |
| **`node-cron`** | L'horloge de la cuisine | Planifie : pipeline 4 h, sauvegarde 1/jour. |
| **`rss-parser`** | L'acheteur | Va chercher les flux RSS. |
| **`@xenova/transformers`** | Le profileur | Transforme chaque article en « empreinte » numérique (embedding) pour rapprocher les sujets. |
| **Groq (API)** | Le chef de recette IA | Génère titres/paragraphes/briefs. Modèle `gpt-oss-120b`, gratuit, ~200K mots/jour. |
| **`jose`** | Le passe-partout | Crée/valide le cookie de session (JWT) partagé entre les 2 apps. |

### La partie création (STUDIO)

| Brique | Analogie | Explication |
|--------|----------|-------------|
| **`sharp`** | Le dégraissage/la découpe | Traitement d'image (recadrage, flou, collage). |
| **`onnxruntime-node` + u2net** | L'œil qui détoure | L'IA qui identifie le sujet (la voiture) et le sépare du décor. |
| **`playwright`** | Le photographe | Navigateur invisible qui photographie le visuel fini. |
| **`googleapis`** | Le livreur | Envoie le PNG vers Google Drive. |

> **🖼️ Concept — c'est l'« acide remplacé par du code » : le montage est 100 % programmatique.**
> Pas de Photoshop : chaque étape (détourage, cadrage, composition, rendu) est une fonction
> qui s'enchaîne. Résultat reproductible à l'infini, gratuit, et auditable.

---

## 5. La carte des fichiers importants

### RADAR — `RADAR/src/lib/` (le moteur)

| Fichier | Ce que c'est (simple) |
|---------|------------------------|
| `db.ts` | **Le livre de comptes complet** : crée toutes les tables, et ajoute une colonne existante au besoin (migrations). Tout passera par là. |
| `cron.ts` | L'horloge + l'orchestrateur du pipeline. |
| `rss.ts` | Va chercher les flux, range les articles, note les flux qui échouent. |
| `scoring.ts` | Regroupe les articles en événements + score. Il **protège** les événements déjà reliés à un article/brief (on ne détruit jamais du travail). |
| `cacheCleanup.ts` | Le ménage : rétentions (voir §6.2). |
| `backup.ts` | Copie quotidienne du frigo + purge des copies >7 jours. |
| `vacuum.ts` | Le défragmenteur : compacte le fichier SQLite une fois par semaine. |
| `session.ts` | Fabrique et vérifie le cookie de session. |
| `studio-prefill.ts` | Construit le lien `?prefill=` vers STUDIO. |
| `autoGenerate.ts` | Les brouillons du matin. |
| `visualSearch.ts` | Cherche des images (og:image…) et nettoie le `visual-cache/` (72 h). |
| `llmProvider.ts` / `brief.ts` / `translate.ts` | Appels à l'IA, génération de briefs, traduction FR mise en cache. |
| `killswitch.ts` | Le coupe-circuit (mode dégradé si ça tourne mal). |

### STUDIO — `studio/src/`

| Fichier | Ce que c'est (simple) |
|---------|------------------------|
| `components/gabarits/registry.tsx` | **Le catalogue des gabarits** (`GABARITS`) : chaque gabarit = un composant + une liste de champs. Toute page d'aperçu/rendu/export le consulte. |
| `components/gabarits/Gabarit*.tsx` | Les 8 gabarits (1A, 1B, 1C, CTA, 2A, 2B, 3A, 3B). |
| `lib/render/renderGabarit.ts` | Photographie le visuel (Playwright). |
| `lib/images/` | Toute la chaîne d'images (voir §7). |
| `lib/titles/router.ts` | L'aiguilleur LLM : appelle Groq (ou Ollama, ou Claude un jour) sans que les appelants changent. |
| `lib/export/` | Le carnet d'export (jobs) + notification à RADAR. |
| `specStudio.md` | La spécification des gabarits — à lire avant toute modif visuelle. |

### Racine du repo

| Fichier | Ce que c'est |
|---------|--------------|
| `deploy/deploy.sh` | **Le bouton de mise en prod** (§9). |
| `deploy/start-radar.sh` / `start-studio.sh` | Comment PM2 démarre chaque app (env, graceful shutdown). |
| `nginx/media-labs*.conf` | La porte d'entrée (proxy HTTP → app ; config HTTPS prête). |
| `docker-compose.yml` | Variante de déploiement local (RADAR :3001, STUDIO :3002). La prod n'utilise pas Docker. |
| `setup-ssl.sh`, `provision-oracle.sh` | Installation de la VM + certificats TLS. |
| `TODO.md`, `ONBOARDING.md`, `ECOSYSTEM.md`, `CLAUDE_DASHBOARD.md` | États, plan, comportements vérifiés. |

---

## 6. La mécanique interne : le cron, la base, la sécurité

### 6.1 Les deux horloges

| Horloge | Fréquence | Action |
|---------|-----------|--------|
| Pipeline | 4 h | Tout le cycle d'ingestion (Histoire 1) + ménage. |
| Sauvegarde | 1/jour (3 h UTC) | Défragmentation (1/semaine) puis copie du frigo. |

Chaque étape a un **chrono de sécurité** (timeout) : si une étape dépasse, elle échoue mais la
suivante continue. Une seule étape par cycle à la fois (verrou `isRunning`).

### 6.2 Le ménage (anti-pollution de la base)

| Donnée | Durée de vie | Ce qui se passe |
|--------|--------------|-----------------|
| `pipeline_runs` (historique des cycles) | 30 jours | Supprimé |
| Articles RSS sans image | 14 jours | Flag `is_duplicate = 1` (on les rend « invisibles » pour le pipeline) |
| Événements orphelins (sans article ni brief) | 7 jours | Supprimé |
| Événements du calendrier passés | 90 jours | Supprimé (sauf publications Instagram, gardées) |
| Images téléchargées cachées | 72 h | Supprimées |
| Copies de sauvegarde | 7 jours | Purge de l'ancienne |

> **🖼️ Pattern connu — c'est le « TTL / rétention » (Time-To-Live)**
> Chaque donnée temporaire a une durée de vie et un nettoyeur (le cron). C'est ce qui évite
> que la base grossisse sans fin. Note : la table `items` elle-même n'est jamais purgée —
> uniquement flaggée. Impact négligeable (<200 Mo/an) mais à anticiper.

### 6.3 La sécurité en trois idées simples

1. **Une seule porte d'entrée** : le middleware `middleware.ts` (RADAR) vérifie le cookie de
   session pour **toutes** les pages ET routes API. Avant, chaque route API devait vérifier
   elle-même — 30 routes étaient ouvertes par erreur. Centraliser = une seule chose à surveiller.
2. **De courtes exceptions** : 4 routes précises restent ouvertes pour STUDIO (appels
   serveur-à-serveur). On liste ce qui est autorisé, jamais l'inverse (allowlist).
3. **Défense en profondeur** : 2 pare-feu empilés (iptables + Security List Oracle), secrets
   dans un fichier `.env` hors du repo, HTTPS prévu.

> **🖼️ Patterns connus ici :**
> - **« Défense en profondeur »** : plusieurs barrières indépendantes, pas une seule.
> - **« Chokepoint » (goulot d'étranglement maîtrisé)** : toute la sécurité passe par un
>   point unique (le middleware) — plus facile à auditer qu'une sécurité dispersée.
> - **« Allowlist »** : on n'autorise que ce qui est explicitement listé.
> - **« SSO par domaine de cookie »** : un seul cookie JWT partagé entre les deux sous-domaines
>   = une connexion unique pour 2 apps.

---

## 7. Le montage image expliqué pas à pas

### Ce que veut le directeur du projet
> « Ne coupe **jamais** dans la voiture. Si l'image ne rentre pas, on floute/assombrit le fond,
> pas le sujet. »

Le montage n'est pas un processus humain : c'est une chaîne de fonctions.

```
 PHOTO BRUTE
     │
     ▼
1. retirerBandes()       → enlève les barres noires en haut/bas
     │
     ▼
2. segment (u2net)       → DÉTOURAGE : l'IA isole la voiture, fait un masque
     │                     (les pixels de la voiture = blanc, le reste = noir)
     │                     + refineMaskByColour : récupère la carrosserie
     │                       que l'IA a ratée (croissance par couleur proche)
     │                     + dilateMask : épaissit de 1 px pour éviter un liseré
     │
     ▼
3. smartCrop()           → CALCUL : on cherche le recadrage 4:5 qui contient
     │                     TOUTE la voiture. Si impossible (voiture trop large)…
     │
     ▼
4. cropToAspectSmart()   → EXÉCUTION : deux fichiers
     │                     • cropped.jpg = recadrage strict
     │                     • backdrop.jpg = pareil, ou si la voiture déborde :
     │                       photo entière sur fond flou (blur 48) + assombri
     │                       avec un fondu qui s'arrête au bord de la voiture
     │
     ▼
5. Gabarit React + Playwright
                          → RENDU : un navigateur invisible photographie
                            le composant React → PNG FINAL
     │
     ▼
6. export → Google Drive
```

### Les fiches des outils d'image

| Fichier | Rôle |
|---------|------|
| `segment.ts` | L'œil : inférence du modèle u2net (entrée 320×320) → masque. Puis les 2 améliorations maison : **refineMaskByColour** (récupère la carrosserie qu'il manque) et **dilateMask** (anti-liseré). |
| `smartCrop.ts` | Le calcul : la boîte englobante du sujet + le meilleur recadrage qui la contient. |
| `pipeline.ts` | Le chef d'orchestre : produit `cropped.jpg` + `backdrop.jpg`, gère le repli « fond flou ». Contient aussi l'upscale (realesrgan, non acquis). |
| `trimBandes.ts` | Enlève les bandes noires. |
| `renderGabarit.ts` | La photo du produit fini (Playwright). |
| `registry.tsx` | Le catalogue des gabarits. |
| `titles/router.ts` | L'aiguilleur IA des textes. |

> **🖼️ Patterns connus ici :**
> - **« Segmentation sémantique »** : u2net, une IA de vision qui étiquette chaque pixel
>   (sujet / fond). Un standard du domaine.
> - **« Smart crop » / recadrage à base de saillance** : on cadre D'APRÈS où se trouve le
>   sujet, pas au centre de l'image. Le « blurred backdrop » (fond flou) est le même pattern
>   que le recadrage « blur » des téléphones quand le sujet ne rentre pas.
> - **« Registry + Strategy »** : le `GABARITS` est un registre (`Registry pattern`) qui
>   choisit le composant à utiliser (`Strategy pattern`). Ajouter un gabarit = ajouter une
>   entrée, zéro modification des écrans génériques.
> - **« Direct manipulation » (concept UX de Shneiderman)** : déplacer une bulle sur
>   l'aperçu (champ `geometry`) plutôt que taper des coordonnées dans un formulaire.
> - **« Formalisme de sécurité »** : u2net (licence Apache-2.0) a été préféré à isnet
>   (entraîné sur un dataset interdit en usage commercial). → le choix de modèle est un
>   choix **juridique** documenté dans le code.

---

## 8. Les patterns qu'on rencontre — nommés

Le tableau de référence pour « au fait, ça, c'est quel pattern ? » :

### Architecture générale

| Élément du code | Pattern connu | Paraphrase |
|-----------------|---------------|------------|
| 2 apps Next.js + HTTP | **Monolithe modulaire** | Deux morceaux, une seule VM, couplage par interface. |
| `app/` → `lib/` → `db.ts` | **Architecture en couches** | Présentation → services → données ; chaque couche ne parle qu'à la voisine. |
| RADAR seul écrit SQLite | **Encapsulation / Data ownership** | Un propriétaire par donnée, accès uniquement via son API. |
| Schéma complet créé dans `db.ts` | **Single source of truth** | Une seule définition des tables, tout en dérive. |
| Pipeline récurrent | **Batch processing (polling)** | Tâches exécutées à heures fixes, pas d'événements en direct. |
| Ajout de colonnes conditionnel | **Migrations idempotentes** | Relançables à l'infini sans doublon ni erreur. |
| Étapes du pipeline avec timeout | **Fail-fast / Timeout safety** | Un blocage ne fige jamais toute la chaîne. |

### Données & état

| Élément du code | Pattern connu | Paraphrase |
|-----------------|---------------|------------|
| Status des articles / des runs | **Machine à états** | `running → completed|failed`, `draft → validated → published`. |
| Regroupement d'articles | **Clustering sémantique cosinus** | Embeddings + similarité pour grouper l'information. |
| Menage périodique | **TTL / retention** | Chaque donnée temporaire expire et se nettoie. |
| `cacheCleanup`, `backup`, `vacuum` | **Idempotence + opérations sûres** | Refaisables sans danger, ne lèvent jamais stupidement. |
| FK `ON DELETE CASCADE` | **Intégrité référentielle** | Supprimer une ligne supprime proprement ses enfants (item → images). |
| Événements protégés dans le scoring | **Protection de l'intégrité référentielle** | On ne supprime jamais une donnée encore référencée ailleurs. |
| WAL + busy_timeout | **Write-Ahead Logging** | Lecture pendant écriture, pas de verrou fatal à 2 écritures. |

### Sécurité

| Élément du code | Pattern connu | Paraphrase |
|-----------------|---------------|------------|
| Middleware qui filtre tout | **Chokepoint (point unique)** | Toute requête passe par la même porte. |
| 4 routes publiques listées | **Allowlist** | On n'ouvre que le strict nécessaire. |
| 2 pare-feux + HTTPS | **Défense en profondeur** | Plusieurs barrières indépendantes. |
| Cookie JWT partagé ×2 apps | **SSO / session partagée** | Une connexion, deux services. |
| `killswitch.ts` | **Circuit breaker / Kill switch** | Coupe-circuit global en cas de dérive. |
| Erreurs jamais silencieuses | **Fail loud / Observatory** | Tout échec est visible (logs, `pipeline_runs.error`, callbacks). |

### Studio / UI / montage

| Élément du code | Pattern connu | Paraphrase |
|-----------------|---------------|------------|
| Aperçu = export (même code) | **WYSIWYG** | Ce qu'on voit est ce qui sort, à la lettre. |
| `GABARITS` → composant | **Registry + Strategy** | Catalogue + sélection du composant à l'exécution. |
| Détourage u2net | **Segmentation sémantique** | Étiquetage pixel par pixel sujet/fond. |
| Recadrage selon le sujet | **Smart / saliency-aware crop** | Le cadrage suit le sujet, pas le centre. |
| Géométrie par manipulation | **Direct manipulation** | Manipuler l'objet, pas des nombres. |
| Un seul chemin de rendu | **Single flight path (DRY)** | Zéro duplication entre aperçu et export. |

### Opérations / déploiement

| Élément du code | Pattern connu | Paraphrase |
|-----------------|---------------|------------|
| Build vérifié + `.next.bak` | **Déploiement avec rollback** | On garde l'avant, on repart en arrière si ça casse. |
| `curl -f` post-déploiement | **Smoke test** | Vérifier que l'app répond VRAIMENT avant de dire « done ». |
| PM2 max-memory-restart | **Bouclier contre les fuites** | Un process qui dépasse 400 Mo est relancé, sans tuer la VM. |
| Graceful shutdown RADAR | **Drain (fin en douceur)** | On laisse finir le cycle en cours avant d'éteindre. |
| Logs rotatés (pm2-logrotate) | **Rotation de logs** | Les logs ne remplissent jamais le disque. |
| Scripts répétables | **Idempotence** | `deploy.sh` peut être relancé sans casser. |

---

## 9. Comment mettre en production

### Principes

- **Un seul repo git** (`nouredine-diallo/media_autombile`) contient RADAR + STUDIO + la racine.
- **Un seul bouton** : `deploy/deploy.sh`.
- La prod tourne sur **PM2 + nginx** (pas Docker) sur la VM Oracle.

### Développer en local

```bash
cd RADAR && npm run dev       # http://localhost:3000 (cron désactivé en dev)
cd studio && npm run dev      # http://localhost:3002
```

> ⚠️ Les deux `next.config.ts` ont `typescript.ignoreBuildErrors` et
> `eslint.ignoreDuringBuilds`. Le build passe donc **même avec des erreurs**. Toujours lancer
> `npx tsc --noEmit` et `npm run lint` AVANT de pousser.

### Mettre en prod (1 commande)

```bash
ssh <user>@89.168.53.133
cd /path/du/repo && ./deploy/deploy.sh
```

Ce que fait le script, pas à pas :

1. **Tire la dernière version** (git pull).
2. **Compile les 2 apps**. Avant d'écraser, il met le `.next` actuel de côté (`.next.bak`) et
   vérifie que le build a bien produit un marqueur (`BUILD_ID`) → sinon il restaure l'ancien et
   S'ARRÊTE.
3. **Met à jour nginx** + les scripts de démarrage, recharge nginx (testé).
4. **Redémarre PM2** : plafond mémoire 400 M/process, timeout d'arrêt 10 s (le temps que le
   pipeline en cours finisse), logs rotatés.
5. **Ouvre le pare-feu** (3000, 3002, 80).
6. **Vérifie** : `curl` sur les 2 apps, 6 tentatives. Si une échoue → **rollback automatique**
   (`.next.bak` restauré, apps relancées sur l'ancien build) et le script sort en erreur.

### Les pièges à connaître

| Piège | Réponse |
|-------|---------|
| `STUDIO_URL` vs `STUDIO_IMPORT_URL` | Le 1er est public (liens cliqués par le navigateur) ; le 2e est local (appels serveur-à-serveur). Ne pas les confondre. |
| Ports 3000/3002 | Jamais ouverts au public : liés en `127.0.0.1`, accès via nginx port 80 + sous-domaine. |
| Secrets | Dans `/opt/media-labs/.env` (hors repo), sourcé par les `start-*.sh`. |
| HTTPS | Activer la conf SSL + `SESSION_COOKIE_SECURE`/`SESSION_COOKIE_DOMAIN` une fois les certificats posés (`setup-ssl.sh`). |
| Vue d'ensemble | `pm2 status`, `pm2 logs`, et le dashboard RADAR (dernier run, dernier backup). |

---

## Annexe — Le point d'entrée du développeur qui reprend (checklist)

```
1. Lire ONBOARDING.md, ECOSYSTEM.md, TODO.md  → l'état et le plan
2. Lire RADAR/CLAUDE.md et studio/CLAUDE.md    → les règles (interdits, stack figée)
3. Tracer l'Histoire 1 : cron.ts → rss.ts → scoring.ts → autoGenerate.ts
4. Tracer l'Histoire 2 : studio-prefill.ts → prefill.ts → titles/router.ts
5. Tracer l'Histoire 3 : renderGabarit.ts → runExport.ts → uploadToDrive
6. Avant toute modif visuelle : lire specStudio.md et passer le fichier via Impeccable
7. Avant tout push : npx tsc --noEmit + npm run lint (le build, lui, pardonne tout)
8. En prod : uniquement via deploy/deploy.sh, jamais à la main
```