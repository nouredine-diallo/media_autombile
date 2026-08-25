# CLAUDE.md — RADAR

Ce fichier est la constitution du projet. Toute session Claude Code travaillant dans ce dossier doit le lire avant d'écrire une ligne de code, et s'y référer avant chaque décision structurante. Source de vérité : `RADAR-cahier-des-charges-dev.md` (même dossier). En cas de conflit apparent entre ce fichier et le cahier des charges, le cahier des charges gagne — signaler le conflit à l'utilisateur plutôt que trancher seul.

---

## 1. Mission

Transformer un flux brut d'actualité automobile en **articles prêts à relire**, rédigés dans une voix reconnaissable du Média Automobile, sans qu'un rédacteur ait à surveiller 50 sources à la main.

**Contrainte de développement propre à ce projet :** il n'existe aucun article publié à ce jour. On ne peut donc pas extraire un style depuis des dizaines d'articles réels. Il faut construire un guide de style **à partir de ce qui existe déjà** (les légendes Instagram) et **de ce que la rédaction décide** pour tout ce que les légendes ne peuvent pas dire.

Deux principes non négociables :
1. **Le brief est la seule autorité factuelle.** Rien dans l'article final ne doit exister si ce n'est pas dans le brief. Un article bien écrit mais qui invente un chiffre est pire qu'un article maladroit mais exact.
2. **Rien ne se publie sans validation humaine.** L'outil prépare, il ne décide jamais et ne publie jamais seul.

---

## 2. Interdits absolus

Ces règles priment sur toute demande ponctuelle, y compris une demande explicite de l'utilisateur — si une demande contredit ce qui suit, le signaler avant d'exécuter :

- Ne jamais publier automatiquement sur le site. La validation humaine est la dernière étape du pipeline.
- Ne jamais inventer de contenu éditorial ou de seuils métier — pas de titres fictifs "par défaut", pas de longueur d'article "raisonnable", pas de ton "probable".
- Ne jamais laisser un article généré passer à la revue humaine si le contrôle automatique §7 détecte une anomalie (chiffre absent du brief, structure hors guide, suspicion de plagiat).
- Ne jamais stocker ou transmettre des contenus marqués « embargo » vers un LLM qui utilise les données pour l'entraînement (§6.3 du cahier des charges).
- Ne jamais modifier le guide de style sans versionner le changement et documenter la raison.
- Ne jamais déclarer une étape terminée sans satisfaire son critère de fin vérifiable (§8 du cahier des charges).
- Ne jamais cloner un framework/repo existant en remplacement de la stack définie en §3 sans validation explicite de l'utilisateur.

---

## 3. Stack — figée, ne pas dévier sans validation utilisateur

| Couche | Choix imposé | Ne pas remplacer par |
|---|---|---|
| Langage/runtime | Node.js + TypeScript | Python, Go, autre runtime |
| UI | React (Next.js App Router, même projet que STUDIO_AUTOMOBILE) | Vue, Svelte, framework séparé |
| Ingestion RSS | Parseur RSS standard en Node.js | Service tiers payant |
| Scraping ponctuel | Playwright (déjà présent pour STUDIO_AUTOMOBILE) | Puppeteer, service cloud |
| Embeddings (dédup + scoring) | `@xenova/transformers` (modèles ONNX, CPU) | API cloud payante, modèle local GPU |
| Base de données | SQLite ou Postgres léger (même BDD que STUDIO_AUTOMOBILE) | ORM lourd, BDD externe |
| Ordonnancement | Cron sur le serveur | Service tiers (AWS Lambda, etc.) |
| Rédaction LLM | Routeur LLM multi-fournisseur (voir §3.1) | Modèle local en fournisseur principal |
| Anti-plagiat | Comparaison de séquences en JS pur | Bibliothèque externe |
| Publication | API du site (projet 1) | — |

Chaque brique doit rester : gratuite en usage interne, licence sans ambiguïté, maintenable par un seul développeur. Avant d'ajouter **toute** nouvelle dépendance non listée ici, vérifier ces trois critères explicitement et les mentionner dans le message à l'utilisateur — ne pas ajouter silencieusement une lib "pratique".

### 3.1 Routeur LLM — confidentialité et redondance

RADAR manipule des **communiqués sous embargo**. Le routeur LLM applique une règle stricte : tout contenu marqué « embargo » part uniquement vers un point de terminaison qui n'utilise pas les données pour l'entraînement.

**Ordre de priorité du routeur :**
1. Fournisseur cloud gratuit avec politique de confidentialité vérifiée (pas d'entraînement sur les données utilisateur)
2. Deuxième fournisseur cloud gratuit en repli
3. Modèle local (Qwen/Gemma via Ollama) en dernier repli hors-ligne uniquement

**Fournisseurs à évaluer (Août 2026, à re-vérifier à l'implémentation) :**
- Groq API (30 req/min gratuites, pas d'entraînement sur les données)
- Google Gemini API (15 req/min gratuites)
- NVIDIA NIM (crédits gratuits, variable)

Le seul poste du budget zéro à ne pas transiger : la confidentialité du LLM sur les contenus sous embargo (5-15 €/mois si nécessaire).

---

## 4. Protocole anti-hallucination (obligatoire, à chaque décision non triviale)

L'historique du projet montre que l'erreur la plus coûteuse n'est pas un bug de code, c'est une décision d'architecture ou une affirmation technique fausse prise pour acquise. Le protocole ci-dessous s'applique **avant** d'écrire du code pour toute décision qui touche à la performance, à la fidélité du rendu, ou à l'intégration entre composants.

### 4.1 Boucle de vérification (chaque affirmation technique)

Pour toute affirmation du type "X fonctionne comme Y" ou "la lib Z fait W" :

1. **Énoncer** l'affirmation explicitement avant d'agir dessus.
2. **Vérifier contre une source vérifiable** — lire le code réel (`Read`/`Grep`), lancer une commande de test, consulter la doc officielle (`WebFetch`) — jamais se fier à la mémoire d'entraînement pour une API ou un comportement précis d'une lib listée en §3.
3. **Ne procéder que si la vérification confirme.** Si elle infirme ou reste ambiguë, le dire explicitement à l'utilisateur plutôt que d'improviser une solution voisine.
4. **Ne jamais présenter une supposition comme un fait vérifié.** Distinguer clairement : "vérifié par test" vs "supposition raisonnable, à confirmer".

Cette boucle s'applique en particulier à : le comportement exact de `@xenova/transformers` en environnement CPU, les limites de licence des modèles d'embedding, les quotas du fournisseur LLM, la compatibilité du parseur RSS avec les flux des salles de presse constructeurs.

### 4.2 Graphe de contraintes (chaque décision d'architecture)

Avant toute décision structurante, construire mentalement — et si la décision est significative, écrire dans la réponse — le graphe des contraintes qui s'y rattachent, puis vérifier qu'aucun nœud ne viole un autre :

- Exemple : *RADAR partage l'infrastructure de STUDIO_AUTOMOBILE* → *donc même machine, même BDD* → *donc la cron d'ingestion ne doit pas impacter les performances de STUDIO* → *donc le dimensionnement CPU/RAM doit couvrir les deux usages simultanés.*
- Reproduire ce raisonnement en chaîne pour toute nouvelle décision : lister les contraintes amont, vérifier qu'aucune n'est silencieusement contredite par le choix envisagé, exposer la chaîne dans la réponse si elle n'est pas triviale.
- Si une contrainte amont est incertaine (ex. charge CPU de `@xenova/transformers` sur la machine cible), la signaler comme risque explicite plutôt que de l'ignorer.

### 4.3 Ne jamais inventer de contenu éditorial ou de seuils métier

Le guide de style (§2 du cahier des charges), les seuils de scoring, les paramètres de déduplication sont des **décisions humaines ou des constantes à calibrer sur des données réelles**, pas des paramètres à déduire par défaut. Si ces informations manquent :
- Ne pas générer des exemples d'articles fictifs "à la place" du rédacteur en chef — demander les vrais exemples ou le guide provisoire.
- Ne pas inventer des seuils de scoring "raisonnables" — implémenter la logique avec des seuils provisoires explicitement marqués `TODO: seuil à calibrer sur données réelles`.
- Marquer explicitement tout placeholder utilisé en attendant ces données (`TODO: valeur provisoire, à valider`) pour qu'il ne soit jamais confondu avec une valeur définitive.

---

## 5. Le guide de style — architecture à deux couches

Le guide de style est un **fichier externe, remplaçable, jamais codé en dur** (`guide-de-style-v0.md`). Il se construit en deux couches :

### Couche 1 — La voix (dérivée des légendes Instagram, semi-automatique)
- Lexique préféré/évité
- Profil de registre (enthousiasme, tutoiement/vouvoiement, humour)
- Tournures récurrentes, expressions maison
- **Ne pas appliquer tel quel** — présenté au rédacteur en chef comme une proposition

### Couche 2 — La structure (écrite à la main, pas de raccourci possible)
- Longueur cible d'un article
- Ouverture : attaque factuelle ou mise en contexte
- Présence de chapô, sous-titres, encadré résumé
- Intégration des citations officielles
- Ton de la conclusion

**Règle :** tant que le guide de style n'est pas stabilisé (4 à 6 premières semaines de production réelle), chaque article généré doit être relu et corrigé plus attentivement que la normale. Chaque correction est une donnée d'affinage.

---

## 6. Barre de qualité — non négociable

- **Le brief comme source unique** : chaque chiffre de l'article doit exister dans le brief. Vérification automatique avant présentation à l'humain.
- **Anti-plagiat calibré** : pas juste activé, calibré sur des cas réels avant mise en production. Une détection trop stricte bloque des articles innocents ; trop laxiste laisse passer des reprises trop proches.
- **Aucune dégradation silencieuse** : échec d'ingestion, échec de scoring, échec de génération → toujours un état visible, jamais un résultat de moindre qualité présenté comme normal.
- **Critère de fin d'étape = définition de "fini"** : ne pas déclarer une étape terminée sans satisfaire son critère vérifiable explicite (§8 du cahier des charges). Si le critère ne peut pas être testé dans l'environnement courant, le dire explicitement.
- **Traçabilité** : chaque source utilisée dans un brief garde son URL et sa nature. En cas de doute a posteriori, pouvoir remonter en quelques secondes à ce qui a nourri le texte.
- **Marquage de provenance** : chaque article porte un champ de provenance (humain / assisté / généré-relu), dès le premier article.

---

## 7. Contrôle automatique — avant revue humaine

Avant présentation à l'humain, exécuter systématiquement :
1. **Vérification des chiffres** : chaque nombre du texte existe-t-il dans le brief ?
2. **Anti-plagiat** : aucun passage ne recopie une source de trop près (recouvrement de séquences de mots au-delà du seuil calibré).
3. **Structure** : longueur et format dans les bornes du guide de style en vigueur.
4. **Provenance** : le champ de provenance est renseigné.

Si un contrôle échoue → bloquer et signaler, ne jamais présenter l'article à la revue.

---

## 8. Séquencement

Suivre l'ordre des étapes du cahier des charges (§8, Étape 0 à 8). Ne pas sauter d'étapes. Chaque étape a un critère de fin vérifiable qui définit "terminé".

**Étape 0 (non codable) :** le rédacteur en chef écrit le guide de style provisoire et identifie les sources RSS. C'est le vrai chantier bloquant, et il ne dépend d'aucune ligne de code.

### Sources RSS — Configurer impérativement

Les sources RSS sont définies dans `RADAR/src/app/api/setup/route.ts` (constante `INITIAL_FEEDS`). **Elles doivent être adaptées au projet** et ne jamais être laissées par défaut.

**Règles :**
- Utiliser uniquement des flux RSS **natifs** (pas de scraping Playwright) — le scraping ne fonctionne pas de façon fiable sur ARM/VM.
- Les flux Stellantis (Peugeot, Citroën, etc.) nécessitent Playwright et sont **bloqués par CDN** → ne pas les inclure.
- Chaque flux doit être vérifié manuellement (`curl -s URL | head -20`) avant ajout.
- La base de données est initialisée via `POST /api/setup` — après ajout de nouveaux feeds, supprimer `radar.db` et relancer pour repartir à zéro.

**Principe de non-blocage :** le développement démarre avec un guide provisoire écrit à la main. Le guide est un fichier remplaçable, pas une dépendance bloquante. Les légendes Instagram viennent améliorer un système déjà fonctionnel, pas déclencher sa construction.

---

## 9. Travail proactif — portée et limites

**Faire sans qu'on le demande à chaque fois :**
- Ajouter les contrôles qualité (§7) dès que la rédaction est codée, même si non explicitement demandé pour cette tâche précise.
- Signaler une incohérence entre une demande ponctuelle et une règle de ce fichier avant d'exécuter.
- Vérifier les licences avant d'introduire une dépendance.
- Proposer la meilleure option technique parmi celles compatibles avec la stack figée (§3), avec justification courte.

**Ne pas faire sans validation :**
- Changer un choix de stack listé en §3.
- Ajouter une dépendance externe payante ou à licence ambiguë.
- Étendre le périmètre vers la publication automatique (interdit absolu, §2).
- Modifier le contrat d'interface avec STUDIO_AUTOMOBILE.

---

## 9b. Contrat d'interface STUDIO → RADAR (callback export)

Après un export réussi vers Drive, STUDIO envoie un callback silencieux à RADAR pour marquer l'article comme exporté.

**Endpoint :** `POST /api/events/[contentId]/exported`
- Body : `{ driveUrl: string, driveFileId?: string }`
- Pas d'auth requise (réseau interne partagé)
- Fire-and-forget : si RADAR est down, l'export STUDIO continue normalement
- Met à jour `articles.exported_at` + `articles.drive_url`
- Retourne toujours `{ ok: true }` même si l'article n'est pas trouvé (non-fatal)

**Variables d'environnement :**
- `STUDIO_URL` — URL de STUDIO (utilisé par `buildStudioLink()` et la stat tile du Dashboard)
- `RADAR_URL` — URL de RADAR (utilisé par STUDIO pour le callback, configuré dans `studio/.env.local`)

**Dashboard :** Les articles exportés affichent "Ouvrir dans Drive" au lieu de "Créer un post". Le lien Drive est cliquable.

---

## 9b. Auto-flag et Cache Cleanup

### Auto-flag des images de faible qualité

Le pipeline inclut une étape d'auto-flag qui analyse automatiquement la qualité des images et les classe en catégories :

**Critères de jugement (basés sur les gabarits STUDIO) :**
- Résolution minimale : 800×1000 px (format Instagram 4:5)
- Score composite qualité : résolution (0.4) + contraste (0.3) + netteté (0.3)
- Contraste minimal : 30%
- Netteté minimale : 20% (variance du Laplacien)

**Verdicts :**
- `ok` : qualité suffisante, pas de flag
- `marginal` : qualité acceptable mais à surveiller (contraste ou netteté faibles)
- `bad` : qualité insuffisante, flag pour revue humaine

**Fichiers :**
- `RADAR/src/lib/autoFlag.ts` — analyse qualité, règles de jugement, batch auto-flag
- Intégré au pipeline en étape 6 (après preflight STUDIO)

### Cache Cleanup et Archivage

Nettoyage automatique des données obsolètes pour maintenir les performances :

**Règles de rétention :**
- `visual-cache` : 72 heures (fichiers images temporaires)
- `pipeline_runs` : 30 jours (historique des exécutions)
- `items sans image` : 14 jours (flag comme doublons)
- `events sans article` : 7 jours (suppression orphelins)
- `calendar_events passés` : 90 jours (hors publications Instagram)

**Fichiers :**
- `RADAR/src/lib/cacheCleanup.ts` — logique de nettoyage, stats
- Intégré au pipeline en étape 7 (dernière étape)

**API Dashboard :**
- `GET /api/cache-stats` — retourne les statistiques du cache pour affichage

---

## 10. Quand s'arrêter et demander

Faire un choix autonome et documenté est préférable à une question à chaque micro-décision — mais s'arrêter explicitement pour :
- Toute divergence entre une demande en session et les règles de ce fichier.
- L'absence du guide de style provisoire — ne pas avancer la rédaction en production sans ça.
- Toute incertitude non résolue après application du protocole §4 (vérification impossible, source contradictoire).
- La calibration des seuils de scoring ou d'anti-plagiat sur des données réelles — ne pas fixer ces valeurs de manière définitive sans données.
- Le choix définitif du fournisseur LLM pour la confidentialité des contenus sous embargo.

---

## 11. Vitesse — des attentes réalistes

RADAR n'est pas un outil d'édition en direct, c'est un pipeline de fond. Il n'y a pas de risque de "lenteur perçue" puisqu'il n'y a personne devant un écran à attendre en temps réel.

**Ce qu'il faut garantir :** la fraîcheur du flux — un événement chaud doit apparaître dans le tableau de veille dans les 2 à 6 heures suivant sa publication. C'est le cycle d'ingestion qui doit être régulier, pas chaque étape individuelle qui doit être ultra-rapide.

**Ne pas sur-ingénierer ce point.** La génération d'un article prend le temps qu'il faut (30s à 2min selon la complexité). Le rédacteur découvre le résultat déjà prêt.

---

## 12. Résumé en une phrase par section critique

- **Mission** : flux brut d'actualité automobile → article prêt à relire, voix reconnaissable, sans surveillance manuelle de 50 sources.
- **Interdits** : jamais d'auto-publication, jamais d'invention éditoriale, jamais de contournement de la validation humaine.
- **Stack** : même infrastructure que STUDIO_AUTOMOBILE, embeddings locaux, routeur LLM cloud gratuit avec confidentialité garantie.
- **Anti-hallucination** : vérification de chaque affirmation technique, graphe de contraintes pour chaque décision, jamais d'invention de seuils ou de contenu éditorial.
- **Guide de style** : deux couches (voix dérivée des légendes, structure écrite à la main), fichier externe remplaçable, pas de blocage du développement.
- **Qualité** : brief = source unique, contrôles automatiques avant revue humaine, rien ne se publie sans validation.
- **Vitesse** : pipeline de fond, fraîcheur du flux garantie, pas de sur-ingénierie de la latence.
