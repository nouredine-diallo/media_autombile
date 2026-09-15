# TODO — Le Média Automobile

> Fichier de référence pour l'ensemble des ajouts et corrections à faire.
> Organisé par les 5 objectifs du projet. Chaque tâche est taguée :
> - `[RADAR]` = concerne RADAR uniquement
> - `[STUDIO]` = concerne STUDIO uniquement
> - `[LES DEUX]` = touche les deux apps
> - `[INFRA]` = déploiement, Docker, nginx
> - `[DATA]` = guide de style, contenu éditorial
>
> Statuts : `⬜ à faire` · `🔄 en cours` · `✅ terminé` · `❌ bloqué`

---

## Fait le 15 sept. 2026 (déployé, vérifié en prod) — pas dans les objectifs 1-5 ci-dessous, ajouté en session

- ✅ `[RADAR]` Faux timeout client (15s) + doublons de génération LLM sur brief/article — `apiFetch` accepte un timeout par appel, `generationLock.ts` empêche un calcul dupliqué (verrou au niveau des fonctions partagées, couvre aussi le chemin cron/auto-génération, pas seulement les routes HTTP). Vérifié par requêtes concurrentes réelles en prod.
- ✅ `[STUDIO]` Tous les exports cassés en prod (`ERR_SSL_PROTOCOL_ERROR`, séquelle HTTPS) — `getInternalRenderOrigin()` force l'adresse interne en clair pour les 4 points d'entrée du rendu Playwright. Vérifié par export réel en prod (PNG téléchargé).
- ✅ `[STUDIO]` Ancrage factuel du mode "thème seul" — `GET /api/facts-lookup` (RADAR) donne de vrais faits déjà ingérés au LLM plutôt que de le laisser inventer des chiffres. Vérifié en prod (1 seul appel Groq, quota préservé).
- ✅ `[LES DEUX]` Chatbot déplaçable par glisser-déposer (gêne mobile signalée).
- ✅ `[STUDIO]` Logo en-tête → logo Média Automobile + lien retour accueil (3 pages, composant partagé `BrandHomeLink.tsx`).
- ✅ `[STUDIO]` Recadrage manuel (zoom/déplacement) du titre et du texte CTA fin de carrousel — réutilise `RecadrageFond` tel quel.
- ✅ `[LES DEUX]` Icône Sparkles retirée de toute l'UI, labels de section en casse normale (au lieu d'ALL-CAPS) — signatures visuelles "IA générique" reconnues.
- ✅ `[INFRA]` `deploy.sh` : `pm2 start --max-memory-restart 3000M` n'appliquait pas fiablement la limite sur `radar` — filet de sécurité `pm2 restart --update-env` ajouté. À surveiller au prochain déploiement (voir `SESSION-START.md`).

## Fait le 15 sept. 2026 (Partie 2 — audit production-ready, **déployé et vérifié en prod**)

> Voir `AUDIT-PRODUCTION-READINESS-2026-09-15.md` §11 pour le détail complet et les preuves de vérification (builds, tests unitaires réels, SSH prod en lecture seule, versions installées relues directement sur la VM après déploiement).
>
> **Deux bugs supplémentaires trouvés en déployant réellement** (§11.10, pas des findings de sécurité — des bugs d'outillage) : `deploy.sh` s'auto-modifiait pendant sa propre exécution (git pull sur lui-même, bash continuait sur l'ancien contenu déjà chargé) — corrigé en se ré-exécutant depuis une copie figée. Et surtout : `deploy.sh` n'a **jamais lancé `npm install`** depuis le début du projet — `git pull` mettait à jour `package.json` mais `node_modules` restait figé, donc aucune mise à jour de dépendance (y compris de sécurité) n'atteignait jamais réellement la prod par ce script seul. Corrigé. A nécessité 4 runs de déploiement pour que tout s'applique réellement (conséquence du premier correctif : un changement à `deploy.sh` prend effet au run suivant, pas à celui qui l'introduit).

## Fait le 15 sept. 2026 (Partie 3 — test réel du parcours utilisateur, chronométré, **déployé et vérifié en prod**)

> Voir `AUDIT-PRODUCTION-READINESS-2026-09-15.md` §12. Parcours RADAR (login → dashboard → events → brief → article → pages annexes) et STUDIO (login → titres → gabarits → pipeline) testés réellement via Playwright, chronométrés, en local puis contre la vraie prod. 2 appels Groq réels consommés (article + titres), avec accord explicite préalable.

- ✅ **Vitesse vérifiée, pas un problème** : Groq (1.25-2.6s), export Playwright (1.1-1.9s), pages (1.0-1.7s) — tous corrects sur la vraie VM. Seule la génération de brief (traduction locale) est très variable (65ms à 15.6s) selon le volume de texte, pas un goulot fixe.
- ✅ `[RADAR]` **Bug réel, cassé depuis le début du projet** : `drive_files` n'avait pas de colonne `path` en prod (deux définitions de schéma contradictoires entre `lib/db.ts` et `lib/drive.ts`, celle sans `path` gagnait toujours) — cassait `GET /api/drive?stats=true` (500) et la synchronisation du dossier local `drive-sync/` (`INSERT` sur colonne inexistante). Corrigé par migration `ALTER TABLE ADD COLUMN path`, testé contre une reproduction exacte du schéma cassé de prod (500 → 200), déployé et reconfirmé en direct.
- ✅ `[RADAR]` `AnalyticsTracker` déclenchait un 401 silencieux sur `/api/analytics` à chaque visite de `/login` (avant toute session). Corrigé à la source, déployé et reconfirmé.
- ✅ `[LES DEUX]` Scripts de parcours chronométrés réutilisables ajoutés (`scripts/dev-journey-test.mjs`), zéro coût Groq par défaut.

- ✅ `[LES DEUX]` **[CRITIQUE]** Next.js 16.3.1 → 16.3.5 — advisory critique (RCE non authentifiée, Image Optimization API) confirmée par `npm audit`, et `/_next/image` vérifié joignable sans session en prod avant correctif (curl réel). Build OK des deux apps après bump.
- ✅ `[LES DEUX]` Bypass du rate limiting login (`X-Forwarded-For` spoofable, nginx ne le remplace pas) — `getClientIp()` préfère maintenant `x-real-ip`. Extrait en `lib/loginSecurity.ts`, testé (8 tests RADAR + 6 STUDIO, dont un test qui reproduit l'ancien bug pour prouver qu'il était réel).
- ✅ `[LES DEUX]` `SESSION_SECRET` : repli silencieux vers une valeur codée en dur remplacé par un fail-fast explicite en prod (`lib/sessionSecret.ts`, résolution paresseuse pour ne pas casser `next build`). Testé.
- ✅ `[LES DEUX]` Comparaison mot de passe non constant-time (`crypto.timingSafeEqual`), path traversal par préfixe sans séparateur (`/api/drive/file`), `X-Frame-Options` manquant — 3 correctifs ponctuels, testés.
- ✅ `[RADAR]` `npm audit` : 6 → 0 vulnérabilité (`js-yaml`, `protobufjs` critique, `sharp` — ces deux derniers via `overrides` ciblés plutôt qu'un downgrade cassant de `@xenova/transformers`). Vérifié par un vrai calcul d'embeddings après coup (similarité cosinus correcte, modèle intact).
- ✅ `[STUDIO]` `npm audit` : 5 → 0 vulnérabilité (`sharp`, `qs`, `adm-zip`), aucun downgrade cassant.
- ✅ `[INFRA]` Restauration de `radar.db` **réellement testée** (pas juste analysée) : sauvegarde du matin ouverte en lecture seule sur la VM, `PRAGMA integrity_check` = "ok", 791 events/837 items relus. Nouveau `deploy/restore.sh` (procédure complète, avec sauvegarde de sécurité avant écrasement — écrit et relu, **pas exécuté contre le `radar.db` vivant**).
- ✅ `[INFRA]` Nouveau `deploy/fetch-backup.sh` — rapatrie la dernière sauvegarde de la VM en local par SSH/SCP (répond au risque "même disque que le prod" détecté dans l'audit). **Exécuté réellement**, copie présente dans `backups-offsite/` (gitignored).
- ✅ `[INFRA]` `deploy.sh` vérifie maintenant lui-même que son filet PM2 (`--max-memory-restart 3000M`) a fonctionné après coup, au lieu de le supposer — échoue bruyamment sinon. Logique testée contre le vrai `pm2 jlist` de la VM prod.
- ✅ `[LES DEUX]` 25 tests unitaires réels ajoutés (`npm run test:unit`, `node --test` natif, zéro nouvelle dépendance), chacun reproduisant un scénario concret des findings ci-dessus.
- ⚠️ `[STUDIO]` Confirmé (pas supposé) : `uploads/` (images en cours, pas encore exportées) n'a aucune sauvegarde — pas corrigé cette session (décision produit hors périmètre d'un correctif ponctuel), signalé explicitement.
- ℹ️ Découverte annexe : `scripts/verify-gabarit-1a.mjs` (aperçu=export pixel-identique) échoue actuellement — **vérifié par bisection que ce n'est pas une régression de cette session** (échoue aussi sur le code d'origine, avant tout correctif). Non corrigé, hors périmètre sécurité de cette passe.

---

## Objectif 1 — Comprendre le contenu réel de LMA

> **But** : alimenter le routeur LLM (titres, surtitres, paragraphes 1B, descriptions)
> avec du vrai contenu Le Média Automobile, pas des textes inventés.
> Chaque tâche liste **exactement quoi collecter** et **pourquoi**.

### 1.1 Inputs concrets à collecter — Titres (court format)

> Le routeur Groq génère 3 variantes de titre. Il a besoin de **calibration** :
> des vrais titres LMA pour apprendre la longueur, le ton, les tournures.

- ⬜ `Extraire 15-20 titres Instagram réels du compte @lemediaautomobile`
  - **Où** : compte Instagram public, 152K followers, ~1425 posts
  - **Format** : texte brut de la première ligne de chaque légende (= le titre du carrousel)
  - **Variété** : inclure des titres d'annonces, de curiosité, de comparatifs, de scoops
  - **Pourquoi** : carnet de style du routeur (`src/lib/titles/router.ts`) — calibrer longueur (2-6 mots ?), ton (enthousiaste ? factuel ?), registre (tutoiement ? vouvoiement ?)

### 1.2 Inputs concrets à collecter — Surtitres (micro format)

> Le surtitre est la ligne au-dessus du titre (ex : "Une touche japonaise pour
> séduire les internautes" dans le post Mercedes). Actuellement le "faux 1B"
> les utilise, mais il n'est pas dans la spec.

- ⬜ `Identifier 10 posts LMA qui ont un surtitre` — est-ce que LMA utilise vraiment des surtitres ? Si oui, extraire 10 exemples. Si non, ne pas construire cette fonctionnalité.
  - **Où** : même compte Instagram, regarder les slides 2+ des carrousels
  - **Format** : la ligne de texte au-dessus du titre gras
  - **Pourquoi** : décider si le surtitre est un élément du style LMA ou un artefact d'un seul post

### 1.3 Inputs concrets à collecter — Paragraphes 1B (long format)

> Le gabarit 1B = image pleine + paragraphe de légende (slide 2+ d'un carrousel).
> Le texte est rédigé par le rédacteur (pas la légende Instagram brute).
> Le routeur LLM doit pouvoir générer un **brouillon de paragraphe** que le rédacteur édite.

- ⬜ `Extraire 10-15 légendes Instagram complètes (slide 2+) des posts LMA`
  - **Où** : posts carrousel du compte, slides 2 et suivantes
  - **Format** : texte complet de la légende (100-800 caractères)
  - **Variété** : inclure des explications techniques, des anecdotes, des comparatifs, des appels à l'action
  - **Pourquoi** : calibrer le routeur LLM pour la génération de **brouillons de paragraphe 1B** — longueur, structure (intro → détail → conclusion ?), ton, usage de chiffres
- ⬜ `Mesurer la longueur réelle des paragraphes 1B` — compter les mots de 10 légendes pour définir une plage cible
  - **Résultat attendu** : "les paragraphes 1B font entre X et Y mots, médiane Z"
  - **Pourquoi** : bornes du gabarit 1B (min/max characters avant troncature ou saut de ligne)

### 1.4 Inputs concrets à collecter — Descriptions / Légendes (format mixte)

> La "description" = le texte qui accompagne le post Instagram quand on le partage.
> C'est le hashtag + la légende courte. Utile pour l'export Drive (Obj. 4.3).

- ⬜ `Extraire 10 descriptions Instagram complètes (légende + hashtags)`
  - **Où** : mêmes posts que §1.1
  - **Format** : texte complet avec hashtags, séparés du contenu principal
  - **Pourquoi** : calibrer la génération automatique de légende + hashtags à l'export

### 1.5 Inputs concrets à collecter — Articles RADAR (format long)

> Les articles RADAR = texte de 300-800 mots rédigés à partir d'un brief.
> Le guide de style couche 2 (structure) doit être écrit à la main.

- ⬜ `Fournir 3-5 exemples d'articles courts que tu écrirais toi-même` (200-400 mots)
  - **Format** : un titre + 3-4 paragraphes, sur des sujets variés (annonce, curiosité, comparatif)
  - **Pourquoi** : servir de **référence humaine** pour calibrer le LLM — "voici comment j'écris, génère dans ce style"
- ⬜ `Définir les bornes de longueur` pour chaque type d'article
  - **Format** : tableau { type → min mots, max mots }
  - **Pourquoi** : le contrôle qualité §7 doit vérifier que l'article est dans les bornes

### 1.6 Guide de style — à compléter avec les inputs ci-dessus

- ⬜ `Compléter le guide-de-style-v0.md` avec les données collectées §1.1-1.5
  - Couche 1 (voix) : lexique, registre, tournures — à extraire des légendes
  - Couche 2 (structure) : longueur, ouverture, sous-titres, citations, conclusion — à écrire à la main
- ⬜ `Alimenter le routeur LLM avec le carnet de style` — 15-20 titres réels + 10 paragraphes réels comme few-shot examples
- ⬜ `Présenter au rédacteur en chef pour validation` — ce guide est une PROPOSITION

---

## Objectif 2 — Gabarit 1B : image + paragraphe

> **But** : construire le vrai gabarit 1B (specStudio.md §4.1) — image pleine +
> paragraphe de texte rédigé par le rédacteur. C'est le slide 2+ d'un carrousel.
>
> L'actuel `Gabarit1B.tsx` est un "surtitre + titre" qui n'est PAS dans la spec.
> Il doit être renommé ou remplacé.

### 2.1 Clarifications à obtenir avant de coder

- ⬜ `Confirmer la police du paragraphe 1B` —Roboto 400/500 (Regular/Medium) ou Roboto 700 (Bold) comme le titre ?
  - **Impact** : change l'alias `titleFont` → `bodyFont` ou conservé
  - **En attente** : réponse de l'utilisateur
- ⬜ `Confirmer le comportement du texte long` — le paragraphe déborde-t-il du cadre ? Si oui, scroll tronqué ? Saut de ligne automatique ?
  - **Impact** : hauteur max de la zone texte, gestion du overflow
- ⬜ `Confirmer si le surtitre (`eyebrow`) est conservé ou supprimé` — le vrai 1B spec n'a pas de surtitre, mais l'actuel "1B" en a un

### 2.2 Composant Gabarit1B — à rebuilder

- ⬜ `Supprimer l'ancien Gabarit1B.tsx (surtitre+titre)` et le renommer en `Gabarit1B-surtitre.tsx` ou le supprimer
- ⬜ `Créer le nouveau Gabarit1B.tsx` selon specStudio.md §4.1 :
  - Même fond que 1A (image pleine 1080×1350, `object-cover`)
  - Même dégradé bas + logo via `TitleFooter.tsx`
  - **Zone texte** : paragraphe en Roboto (weight à confirmer), blanc, aligné à gauche
  - **Pas de surtitre** (contrairement à l'ancien 1B)
  - **Bornes** : min 50 caractères, max 800 caractères (à calibrer avec les données §1.3)
- ⬜ `Tester avec 3 longueurs de texte` — court (100 car.), moyen (400 car.), long (800 car.)
- ⬜ `Vérifier que le paragraphe ne chevauche pas le logo` — le dégradé doit laisser de la place au texte

### 2.3 Route de rendu et export

- ⬜ `Ajouter la route `/render/1b` pour le rendu Playwright` — capture pixel-exacte
- ⬜ `Ajouter la route `/gabarits/1b` pour l'aperçu navigateur` — preview instantanée
- ⬜ `Ajouter le gabarit 1B dans le sélecteur de gabarits` — le rédacteur peut choisir "paragraphe" quand il a 1 image + du texte long

### 2.4 Calibration du texte 1B

- ⬜ `Définir la plage de caractères Acceptable` — moins de 50 = trop court pour un paragraphe, plus de 800 = illisible sur mobile
- ⬜ `Tester le rendu sur mobile` — le post Instagram est consommé à 80% sur téléphone, le texte doit être lisible en 4:5 sur un écran ~375px
- ⬜ `Vérifier le contraste texte/dégradé` — le texte blanc sur dégradé noir doit rester lisible quel que soit le fond (fond clair = dégradé plus sombre ?)

---

## Objectif 3 — Réparer le parcours RADAR

> Objectif : le parcours complet "login → dashboard → veille → brief → article → validation → ouverture STUDIO" doit fonctionner de bout en bout sans friction.

### 3.1 Authentification et navigation

- ⬜ `Vérifier le parcours login complet` — page login → mot de passe "work" → choix Daniel/Test → redirection /dashboard
- ⬜ `Tester STUDIO sans re-login` — quand on vient de RADAR, STUDIO doit être accessible (pas de middleware de session)
- ⬜ `Vérifier que /login et /select-name n'affichent pas la sidebar` — déjà codé (masquée sur écrans publics), à vérifier en prod

### 3.2 Dashboard "À faire aujourd'hui"

- ⬜ `Vérifier le statut pipeline temps réel` — vert/orange/rouge, dernière exécution, nb items, nb visuels
- ⬜ `Vérifier l'affichage des articles urgents en haut`
- ⬜ `Vérifier l'affichage des articles prêts à publier avec visuels`
- ⬜ `Tester le bouton "Lancer maintenant"` — déclenchement manuel du pipeline

### 3.3 Pipeline automatique

- ⬜ `[INFRA] Séparer le pipeline (cron) du serveur web dans un process distinct` — **trouvé le 14 sept. 2026, prod réelle** : le site devient totalement inaccessible (aucune réponse HTTP, pas une lenteur) pendant toute la durée d'un cycle pipeline (30-50 min), parce que le calcul intensif (embeddings + traduction locale, `@xenova/transformers`/ONNX) tourne dans le **même process Node** que le serveur HTTP (`next start`) — un seul thread JS, bloqué par l'inférence, ne peut plus répondre aux requêtes. Mesuré aussi sur le chemin à la demande (génération de brief à l'ouverture d'un event) : un item au contenu dégénéré (liste de titres sans ponctuation, cas réel event 171948 "Bring a Trailer") a bloqué un seul appel de traduction 40-60s d'affilée — un timeout `Promise.race`/`setTimeout` posé autour ne s'est **jamais déclenché**, la preuve empirique que Node ne peut pas interrompre un calcul natif bloquant en cours, quel que soit le wrapper JS utilisé autour.
  - **Mitigations déjà en place** (pas une solution complète, juste moins de risque en attendant) : cron réduit à 2 exécutions/jour hors heures de bureau (`0 4,16 * * *`, 6h/18h Paris) au lieu de toutes les 4h ; traduction du `content` brut désactivée dans `generateBrief()` (seuls titre/résumé, courts et fiables, sont traduits) ; limite mémoire PM2 de `radar` relevée 400M→3000M (le vrai plafond mesuré du pic embeddings+traduction est ~1.5-1.6 Go).
  - **Solutions explorées et écartées** : webhook/service externe (interdit par CLAUDE.md §3, sur-ingénierie pour 10 users) ; traitement par lots avec pauses entre items (n'aide pas — un item **seul** peut bloquer 40-60s, les pauses entre items ne changent rien pendant qu'un item est en cours) ; alléger le pipeline (réduit la durée du blocage, ne l'élimine pas).
  - **Solution recommandée** : sortir `startCron()`/`runPipeline()` (`src/lib/cron.ts`) de l'app Next.js vers un **3ᵉ process PM2 autonome** (`radar-pipeline`), même pattern que RADAR/STUDIO déjà séparés aujourd'hui — isolation totale, vrai parallélisme (VM à 2 vCPU, 11 Go RAM, vérifié `nproc`/`free -h`), aucune nouvelle dépendance. Le serveur web ne fait alors plus jamais de calcul lourd. Nécessite : (1) un point d'entrée standalone (`src/pipeline-worker.ts`) qui appelle `startCron()` et écoute un petit serveur HTTP interne `127.0.0.1` (ex: port 3010) avec `POST /run` (déclenchement manuel, remplace l'appel direct actuel dans `api/cron/route.ts`) et `POST /reload-config` (relit la config après un changement d'horaire) ; (2) retirer l'appel à `startCron()` de `instrumentation.ts`/`startup.ts` côté app web ; (3) faire pointer `POST /api/cron {action:'run'}` et `{action:'update_config'}` vers ce process interne au lieu d'exécuter en local ; (4) `getCronStatus().running` doit venir d'une requête `SELECT` sur `pipeline_runs` (état partagé via la même base SQLite) plutôt que du booléen `isRunning` en mémoire, qui vivrait sinon dans le mauvais process ; (5) déplacer le handler d'arrêt propre (`registerGracefulShutdown`, `startup.ts`) vers le nouveau process ; (6) ajouter la ligne `pm2 start` correspondante dans `deploy/deploy.sh` avec sa propre limite mémoire généreuse (~3000M, mêmes modèles chargés).
  - **Limite honnête de cette solution** : ne couvre que le cycle automatique. Le chemin à la demande (brief généré au clic sur un event, toujours dans le process web) resterait exposé en théorie à un futur cas dégénéré, même si le risque a été fortement réduit ce soir (traduction du `content` désactivée). Un `worker_thread` scopé juste à `translateTextLocal`/`embeddings.ts` serait le complément pour une garantie totale des deux chemins — pas fait, à évaluer séparément si le besoin réapparaît.
  - **Pourquoi pas fait tout de suite** : changement structurel touchant scheduling, IPC entre process et arrêt propre — mérite du temps pour tester correctement plutôt qu'une implémentation à la hâte tard le soir, décision explicite de l'utilisateur (14 sept. 2026).
- ⬜ `Tester le cron toutes les 4h en environnement Docker` — ingestion RSS, visual search, clustering
- ⬜ `Vérifier l'extraction images RSS` — enclosure, media:content, media:thumbnail
- ⬜ `Vérifier le visual search Playwright` — og:image, twitter:image, srcset, `<img>`
- ⬜ `Vérifier le scoring de pertinence` — résolution, ratio 4:5, source (og:image > twitter > page > rss)
- ⬜ `Vérifier le clustering et le scoring composite` — densité, vélocité, fraîcheur, marque
- ⬜ `Vérifier le pipeline_runs tracking` — chaque exécution logged avec items, events, images, status, erreurs
- ⬜ `Calibrer les seuils de scoring sur données réelles` — TODO: seuil à calibrer (CLAUDE.md §4.3)

### 3.4 Veille RADAR → Articles

- ⬜ `Tester la création de brief à partir d'un événement`
- ⬜ `Tester la rédaction d'article par le LLM` — mode 1 (brief → article), nécessite le guide de style
- ⬜ `Tester les contrôles qualité avant revue humaine` — vérification des chiffres, anti-plagiat, structure, provenance
- ⬜ `Tester la validation humaine → passage à "prêt à publier"`
- ✅ `Fixer buildStudioLink() : STUDIO_URL env var + /titres path` — IP hardcodée supprimée, prefill pointe la bonne page
- ✅ `Auto-génération des titres après prefill` — les titres se génèrent dès que STUDIO s'ouvre avec un prefill valide
- ✅ `Afficher le contexte source dans STUDIO` — nom du flux + chapeau de l'article en header
- ✅ `Export inline sans navigation` — le statut d'export s'affiche sur la même page (pas de redirect /export/{jobId})

### 3.5 Corrections et suivi

- ⬜ `Tester la page /corrections` — suivi des corrections demandées
- ⬜ `Tester le rejet de visuel auto-trouvé` — POST /api/visual-search/reject + re-scraping alternatif
- ✅ `Bouton "Tout confirmer" pour les faits` — macro-action dans FactHighlighter, coche tous les repères en 1 clic
- ✅ `Bouton "Valider sans vérifier"` — override quand le score de vérification ≥ 80%, avec confirmation
- ✅ `Barre d'actions post-validation` — "Ouvrir STUDIO" en ligne après validation (pas de scroll)

### 3.6 Export et Drive

- ⬜ `Tester l'export vers Google Drive` — POST callback STUDIO→RADAR `/api/events/[contentId]/exported`
- ⬜ `Tester la page /drive` — explorateur avec prévisualisation images
- ⬜ `Vérifier que les articles exportés affichent "Ouvrir dans Drive" au lieu de "Créer un post"`

### 3.7 Stats et reporting

- ⬜ `Tester la page /stats` — dépôt CSV Instagram, ratios calculés, tendances
- ⬜ `Tester la page /partenaires` — tracker livrables + génération rapport PDF
- ⬜ `Tester le calendrier /calendrier` — vue semaine avec drag-and-drop

---

## Objectif 4 — Rendre la production quasi automatique

> Objectif : le rédacteur n'a qu'à valider. Le pipeline trouve les sujets, rédige les articles, prépare les visuels, et ne demande l'humain qu'à la validation finale.

### 4.1 Pipeline RSS → Événements (existant, à stabiliser)

- ⬜ `Configurer les flux RSS adaptés au projet` — dans `RADAR/src/app/api/setup/route.ts` (constante `INITIAL_FEEDS`), vérifier que les flux ne sont pas les défauts
- ✅ `Désactiver les flux non-automobiles (designboom, dezeen)` — script `scripts/disable-bad-feeds.ts`, colonne `enabled` ajoutée à la table feeds
- ⬜ `Vérifier chaque flux RSS manuellement` — `curl -s URL | head -20` avant d'ajouter
- ⬜ `Exclure les flux Stellantis` — Peugeot, Citroën etc. nécessitent Playwright, bloqués par CDN
- ⬜ `Supprimer radar.db et repartir à zéro après ajout de nouveaux feeds`

### 4.2 Rédaction LLM → Articles

- ✅ `Implémenter la route de rédaction d'article` — brief → article via routeur LLM (`generateChained`/`generateArticleSmart`, `RADAR/src/lib/llm.ts`)
- ⬜ `Connecter le guide de style à la rédaction` — charger `guide-de-style-v0.md` comme contexte
- ✅ `Implémenter les contrôles qualité §7` — vérification des chiffres vs brief (`verifyArticleAgainstBrief`), structure, provenance. Anti-plagiat implémenté (`checkArticlePlagiarism`) mais pas calibré, voir ligne ci-dessous.
- ✅ `Bloquer les articles qui échouent aux contrôles` — `runMorningAutoGeneration` (`autoGenerate.ts`) supprime silencieusement tout brouillon qui échoue, jamais présenté à l'humain.
- ⬜ `Calibrer l'anti-plagiat` — pas juste activé, calibré sur des cas réels (trop strict = bloque des articles innocents)

**Deux bugs trouvés et corrigés le 2026-08-29/30, en creusant pourquoi aucun article ne franchissait jamais le contrôle qualité (0 article en base, prod comme local — voir le plan de la même date sur l'auto-validation)** :
- **Le format de réponse du chemin "meilleure qualité" (`generateChained`, 2 passes) ne correspondait pas à ce que lisait le parseur.** `buildFormattingPrompt()` (`content-engine.ts`) demande explicitement du JSON (`{"titre","chapeau","contenu",...}`), mais `parseGeneratedArticle()` (`articles.ts`) ne savait lire que le format ligne-par-ligne du chemin de repli à 1 passe (`generateArticleSmart`). Résultat mesuré sur un vrai article : le JSON entier atterrissait dans `title`, `content` restait vide, et la vérification des chiffres comparait des artefacts de formatage (`word_count`) au lieu du texte réel. **Corrigé** : `parseGeneratedArticle()` détecte et parse le JSON en premier, retombe sur le format ligne-par-ligne sinon. Sans ce correctif, le chemin de génération "meilleure qualité" — celui tenté en premier — ne produisait jamais un article exploitable.
- **Du HTML brut (balises + attributs) provenant du flux RSS source traversait `extractFacts()` sans nettoyage** et se retrouvait dans le texte des faits du brief — mesuré : un `<em data-start="407">` a fait sortir `407` comme "chiffre du brief absent de l'article", une fausse anomalie. **Corrigé** : nouvelle fonction `stripHtml()` dans `brief.ts`, appliquée une fois à tous les champs texte des items juste après traduction, avant toute construction du brief.
- **Limite non corrigée, notée pour plus tard** : `extractNumbers()` traite tout chiffre isolé comme un fait à retrouver mot pour mot, y compris des chiffres de nom de finition/pack (ex. "Premium 1") ou des fragments de specs tronqués pendant l'extraction/traduction (ex. "une vitesse accrue (de 3,7)" sans unité ni contexte "0-100"). Un article par ailleurs fidèle peut encore être bloqué pour ne pas avoir répété ce genre de chiffre. Pas touché maintenant — resserrer la détection de "fait numérique" toucherait directement la barre de qualité non négociable (CLAUDE.md §6), à ne faire qu'avec de vraies données de calibration, pas une estimation.

### 4.3 Connectique RADAR → STUDIO (à finaliser)

- ⬜ `Vérifier que buildStudioLink() fonctionne en prod` — avec les bonnes URLs (STUDIO_URL, RADAR_URL)
- ⬜ `Tester le flow complet : article validé → STUDIO s'ouvre avec image pré-remplie`
- ⬜ `Vérifier que le callback export STUDIO→RADAR fonctionne` — POST /api/events/[contentId]/exported

### 4.4 Routeur LLM — confidentialité et redondance

- ⬜ `Vérifier que le routeur LLM respecte les contenus embargo` — confidentialité d'abord, pas d'entraînement sur les données
- ⬜ `Tester le repli multi-fournisseur` — Groq → Gemini → NVIDIA NIM → local
- ⬜ `Vérifier les quotas gratuits` — 30 req/min Groq, 15 req/min Gemini, crédits NVIDIA
- ⬜ `Documenter le fournisseur LLM définitif` — à trancher avec l'équipe

### 4.5 Cache et maintenance

- ⬜ `Vérifier le cache cleanup automatique` — visual-cache 72h, pipeline_runs 30j, items sans image 14j, events sans article 7j
- ⬜ `Vérifier l'auto-flag des images de faible qualité` — critères : résolution, contraste, netteté
- ⬜ `Tester l'API GET /api/cache-stats` — affichage dashboard

---

## Objectif 5 — Perfectionner les gabarits 1/2/3

> Objectif : chaque gabarit existant doit être pixel-identique entre aperçu et export.

### 5.1 Police et typographie

- ⬜ `Confirmer Roboto 700 comme police libre` — substitut de Helvetica Neue Bold (confirmé par mesure, PSD du directeur)
- ⬜ `Vérifier le corps 75pt / interlignage 1.0 / crénage -0.03em` — calé sur le PSD, vérifier que les titres longs ne débordent pas
- ⬜ `Tester avec des titres de longueurs variées` — court (2 mots), moyen (5-6 mots), long (10+ mots)

### 5.2 Anneau et bulles

- ⬜ `Vérifier l'épaisseur d'anneau 13px (≈1.2%)` — calibré sur les références Porsche/Mercedes
- ⬜ `Vérifier l'ombre adaptative des bulles` — calculée depuis la luminance du fond (`edgeLuminance.ts`)
- ⬜ `Vérifier que l'ombre fonctionne sur fonds clairs ET sombres` — le calibrage Porsche (fond clair) vs WEC (fond sombre)

### 5.3 Détourage et empilement

- ⬜ `Vérifier u2net.onnx sur la VM ARM` — non mesuré sur 2 cœurs ARM, risque de lenteur
- ⬜ `Installer les poids du modèle sur la VM` — 176 Mo, `models/u2net.onnx`, hors Git
- ⬜ `Mesurer le temps de détourage sur ARM` — ~1.6-2s sur CPU dev, inconnu sur ARM
- ⬜ `Prévoir le repli u2netp.onnx` — 4.5 Mo au lieu de 176 Mo, moins précis mais plus rapide

### 5.4 Recadrage smart

- ⬜ `Vérifier le fond flou/assombri sur images avec fitsFully=false` — technique Stories Instagram, déjà implémenté
- ⬜ `Vérifier que les bulles n'ont PAS de fond flou` — `cropped.jpg` (bulles) vs `backdrop.jpg` (fond)
- ⬜ `Mesurer la marge de recadrage sur plus de combinaisons` — 6% actuel = provisoire

### 5.5 Upscale HD

- ⬜ `Installer realesrgan-ncnn-vulkan + poids sur la VM` — binaire MIT, poids à acquérir
- ⬜ `Vérifier llvmpipe sur l'image Oracle ARM` — rendu logiciel Vulkan sans GPU dédié
- ⬜ `Mesurer la vitesse réelle sur 2 cœurs ARM` — si trop lent, dernier recours : renoncer à l'upscale

### 5.6 Vérification automatisée

- ⬜ `Relancer verify-gabarits-etape4.mjs` — aperçu = export pixel-identique sur les 6 gabarits
- ⬜ `Relancer verify-detourage.mjs` — avec et sans sujetUrl
- ⬜ `Relancer verify-pipeline-etape2.mjs` — pipeline complet

---

## Blocages critiques

> Ces items bloquent d'autres tâches. Les traiter en priorité.

| # | Blocage | Impact | Résolution |
|---|---------|--------|------------|
| B1 | **Guide de style absent** | Bloque la rédaction LLM d'articles (Obj. 4.2), la calibration de l'anti-plagiat, et la validation qualité | priorité absolue — Obj. 1.6 |
| B2 | **Poids u2net.onnx non installés sur la VM** | Bloque le détourage en prod | télécharger `models/u2net.onnx` (176 Mo) |
| B3 | **Poids realesrgan non acquis** | Bloque l'upscale HD en prod | acquérir les fichiers .param/.bin du modèle |
| B4 | **Flux RSS non configurés pour le projet** | Le pipeline ingère des flux par défaut, pas adaptés à LMA | ✅ Désactiver designboom/dezeen — script `disable-bad-feeds.ts` |
| B5 | **Seuils de scoring non calibrés** | Le scoring composite utilise des valeurs provisoires | nécessite des données réelles d'ingestion |

---

## Priorité 3 — Réduction de charge cognitive UI

> **But** : réduire le nombre de clics, d'informations visibles et de décisions à chaque étape.
> Chemin optimal cible : Dashboard → Liste → Détail → Valider → STUDIO → Export = 5 clics.

### 🔴 Impact élevé

- ⬜ `Colonne Articles → liste compacte quand article sélectionné` — éliminer la duplication titre/chapeau entre colonnes 3 et 4 (`events/[id]/page.tsx:989-1045`)
- ⬜ `Masquer CorrectionInterface par défaut` — 5 champs de formulaire toujours visibles, ajouter toggle "Enregistrer une correction" (`events/[id]/page.tsx:1438-1529`)
- ⬜ `Supprimer badge "Validé" + nombre de mots de la page Ready` — redondant avec le contexte de la page (`ready/page.tsx:92-97`)
- ⬜ `Masquer actions urgent/assign/tag-remove de la liste événements` — afficher au survol ou via menu `...` (`events/page.tsx:218-279`)
- ⬜ `Supprimer tile "Ouvrir STUDIO" des stats` — c'est une action, pas une métrique, remplacer par lien header ou FAB (`page.tsx:114-120`)

### 🟡 Impact moyen

- ⬜ `Masquer raccourcis clavier par défaut` — afficher sur `?` (`HomeShortcuts.tsx:21-34`)
- ⬜ `Supprimer ligne résumé de la liste événements` — le titre suffit (`events/page.tsx:204-208`)
- ⬜ `Supprimer nombre de sources de la liste événements` — déjà sur la page détail (`events/page.tsx:215-217`)
- ⬜ `Supprimer image_source en double dans cartes sources` — garder seulement l'overlay image (`events/[id]/page.tsx:838-843`)
- ⬜ `Réduire faits du Brief par défaut` — afficher compteur, expand au clic (`events/[id]/page.tsx:897-916`)
- ⬜ `Masquer DriveStatusBadge quand sain` — afficher seulement en erreur (`page.tsx:128`)

### 🟢 Impact faible (polish)

- ⬜ `Séparer sélection et édition des titres STUDIO` — clic pour sélectionner, icône pour éditer (`titres/page.tsx:715-728`)
- ⬜ `Tags + noms de flux dans section expandable` — header événement (`events/[id]/page.tsx:694-713`)
- ⬜ `Masquer micro-correction derrière toggle` — power-user feature (`events/[id]/page.tsx:1066-1091`)
- ⬜ `Fetch tags dans API événements` — éliminer N+1 queries (`events/page.tsx:49-65`)

---

## Ordre de traitement recommandé

```
Phase 1 — Fondations (bloque tout)
  └─ 1.1-1.5: Collecter les inputs concrets (titres, paragraphes, articles)
  └─ 1.6: Compléter le guide de style + alimenter le routeur LLM
  └─ B4: Configurer les flux RSS (Obj. 4.1)

Phase 2 — Gabarit 1B
  └─ 2.1: Obtenir les clarifications (police, overflow, surtitre)
  └─ 2.2: Reconstruire Gabarit1B.tsx (image + paragraphe)
  └─ 2.3: Ajouter les routes rendu/export
  └─ 2.4: Calibrer sur mobile + contraste

Phase 3 — Pipeline fonctionnel
  └─ B2: Installer poids u2net (Obj. 5.3)
  └─ 3.3: Tester le cron en Docker (Obj. 3.3)
  └─ 4.2: Implémenter la rédaction LLM (Obj. 4.2)
  └─ 4.3: Connecter RADAR→STUDIO (Obj. 4.3)

Phase 4 — Production
  └─ B3: Installer realesrgan (Obj. 5.5)
  └─ B5: Calibrer le scoring (Obj. 3.3)
  └─ 4.4-4.5: Routeur LLM + cache (Obj. 4.4-4.5)
  └─ 3.5-3.7: Corrections, Drive, Stats (Obj. 3.5-3.7)

Phase 5 — Réduction charge cognitive (P3)
  └─ Impact élevé: colonne Articles compacte, masquer CorrectionInterface, nettoyer Ready, masquer actions liste, supprimer tile STUDIO
  └─ Impact moyen: raccourcis clavier, résumé, sources, image_source, faits, DriveStatus
  └─ Impact faible: sélection/édition titres, tags expandable, micro-correction, N+1 queries
```

---

## Références rapides

| Document | Emplacement | Rôle |
|----------|-------------|------|
| Constitution RADAR | `RADAR/CLAUDE.md` | Règles, stack, interdits, protocoles |
| Constitution STUDIO | `studio/CLAUDE.md` | Règles, stack, gabarits, détails techniques |
| Dashboard | `RADAR/CLAUDE_DASHBOARD.md` | Personas, parcours, design system |
| Cahier des charges RADAR | `RADAR/RADAR-cahier-des-charges-dev.md` | Spécifications complètes RADAR |
| Cahier des charges STUDIO | `studio/STUDIO_AUTOMOBILE-cahier-des-charges-dev.md` | Spécifications complètes STUDIO |
| Spécification STUDIO §4 | `studio/specStudio.md` | Gabarits détaillés (source de vérité §4) |
| Guide de style v0 | `RADAR/guide-de-style-v0.md` | Brouillon du guide de style |
| Verdict final dashboard | `RADAR/LMA-Dashboard-verdict-final.md` | Audit critique + priorisation |
| Agents spécialisés | `.opencode/agents/` | 28 agents (frontend, backend, sécurité, etc.) |
| Plugins | `opencode.json` | Superpowers + Impeccable |
