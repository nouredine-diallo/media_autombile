# RADAR
## Cahier des charges développeur — v1.0
**Veille automobile → article rédigé. Sans corpus d'articles existant.**

---

## 0. Lecture rapide — les décisions structurantes

| Question | Décision | Raison courte |
|---|---|---|
| Le problème du style manquant | **Le guide de style se construit en deux couches, pas une** — voir §2 | Les captions donnent le ton, pas la structure d'un article ; les deux se traitent différemment |
| Faut-il attendre les captions pour commencer à coder ? | **Non.** Développement démarre avec un guide provisoire écrit à la main | Le guide est un fichier remplaçable, pas une dépendance bloquante — même logique que le contrat d'interface RADAR↔STUDIO_AUTOMOBILE du document précédent |
| Web app ou logiciel ? | **App web**, même infrastructure que STUDIO_AUTOMOBILE | Un seul serveur à maintenir, coût toujours à zéro |
| Cloner un repo GitHub ? | **Non**, même conclusion que pour STUDIO_AUTOMOBILE | Aucune des pistes fournies ne couvre ce besoin (veille + rédaction encadrée) |
| Sera-ce instantané comme STUDIO_AUTOMOBILE ? | **Non, et ce n'est pas grave.** RADAR est un pipeline de fond, pas un outil d'édition en direct | Détail en §5 |
| Le point sensible du budget zéro | **La confidentialité du LLM sur les communiqués sous embargo** — déjà signalé dans le document de cadrage général | Seul poste où une petite dépense (5-15 €/mois) est recommandée |

---

## 1. Objectif

Transformer un flux brut d'actualité automobile en **articles prêts à relire**, rédigés dans une voix reconnaissable du Média Automobile, sans qu'un rédacteur ait à surveiller 50 sources à la main.

**Contrainte de développement propre à ce projet :** il n'existe aucun article publié à ce jour. On ne peut donc pas faire ce qu'on ferait normalement — extraire un style depuis des dizaines d'articles réels. Il faut construire un guide de style **à partir de ce qui existe déjà** (les légendes Instagram) et **de ce que la rédaction décide** pour tout ce que les légendes ne peuvent pas dire.

---

## 2. Le problème central — construire un style sans articles

### 2.1 Ce que les légendes peuvent vraiment vous apprendre, et ce qu'elles ne peuvent pas

Une légende Instagram, même longue, n'est pas un article miniature. C'est un objet avec ses propres règles : elle cherche l'engagement, elle est pensée pour être lue en scrollant, elle n'a pas de structure en paragraphes développés. Il faut être honnête sur ce qu'on peut en tirer.

| Ce que les légendes révèlent de façon fiable | Ce qu'elles ne révèlent pas |
|---|---|
| Le lexique : quels termes techniques ils emploient, quels anglicismes ils tolèrent ou évitent | Comment structurer plusieurs paragraphes qui s'enchaînent |
| Le registre : niveau d'enthousiasme, tutoiement/vouvoiement, humour ou sérieux | Le rythme d'un texte long — une légende se lit en 10 secondes, un article en 2 minutes |
| Les tournures récurrentes, les expressions maison | Comment intégrer une citation officielle dans un flux de phrases |
| Les sujets qui reviennent, les angles qu'ils privilégient spontanément | La convention d'ouverture d'un article (attaque factuelle ? accroche narrative ?) |
| Ce qu'ils ne mentionnent jamais | S'il y a des sous-titres, un chapô, un encadré de synthèse |

**Conclusion : les légendes alimentent la moitié du guide de style — la voix. L'autre moitié — la structure — doit être écrite par un humain, parce qu'elle n'existe nulle part encore.**

### 2.2 Le guide de style à deux couches

**Couche 1 — La voix (dérivée des légendes, semi-automatique)**

Cette couche se construit avec un script d'analyse qui prend en entrée un lot de légendes et en ressort :
- une liste des expressions et tournures qui reviennent le plus souvent
- un profil de registre (mesure simple : longueur moyenne de phrase, densité de ponctuation exclamative, présence d'humour)
- un lexique préféré/évité, en comparant le vocabulaire utilisé à des synonymes plus neutres

Ce résultat n'est **jamais appliqué tel quel**. Il est présenté au rédacteur en chef comme une proposition, qu'il corrige et complète — exactement le même principe de gouvernance que pour l'attribution automatique des rôles d'image dans STUDIO_AUTOMOBILE : l'automatisation propose, l'humain tranche.

**Couche 2 — La structure (écrite à la main, pas de raccourci possible)**

Personne ne peut extraire d'un texte de 50 mots comment structurer un article de 500. Le rédacteur en chef doit trancher explicitement, une fois, sur un petit nombre de décisions :
- longueur cible d'un article
- ouverture : attaque factuelle directe, ou mise en contexte d'abord
- présence ou non d'un chapô, de sous-titres, d'un encadré résumé
- comment une citation officielle s'intègre (entre guillemets dans le texte, en bloc détaché)
- ton de la conclusion : ouverte, tranchée, invite à réagir

Ce travail se fait en une session de 2 à 3 heures avec le rédacteur en chef, pas en développant du code. **C'est le vrai chantier bloquant du projet, et il ne dépend d'aucune ligne de code.**

### 2.3 Comment ne pas bloquer le développement en attendant les légendes

Vous avez dit : « je pourrai les récupérer après ». C'est compatible avec le développement, à une condition : le guide de style doit être un **fichier externe, remplaçable, jamais codé en dur.**

**Plan concret :**

1. **Aujourd'hui** : le rédacteur en chef écrit un guide minimal à la main — quelques paragraphes décrivant le ton souhaité, plus les décisions de structure de la §2.2 couche 2. Ce guide provisoire, même imparfait, suffit pour développer et tester tout le pipeline.
2. **Le jour où vous récupérez les légendes** : vous lancez le script d'analyse (§2.2 couche 1) une seule fois. Son résultat vient enrichir le fichier existant — on ne repart pas de zéro, on affine.
3. **Le fichier est versionné** (comme du code, dans le même dépôt). Chaque évolution du guide est datée et comparable à la précédente — utile pour comprendre pourquoi un article rédigé en janvier ne sonne plus pareil qu'un article rédigé en mars.

**Résultat : zéro étape du développement n'attend les légendes.** Elles viennent améliorer un système déjà fonctionnel, pas déclencher sa construction.

### 2.4 La période de supervision renforcée — le vrai correctif de qualité

Tant que le guide de style n'est pas stabilisé (probablement les 4 à 6 premières semaines de production réelle), chaque article généré doit être relu et corrigé plus attentivement que la normale. **Chaque correction faite par un rédacteur est elle-même une donnée** : elle montre où le guide actuel s'écarte de ce que veut réellement la rédaction.

Concrètement : on enregistre chaque paire (texte généré → texte corrigé). Après une trentaine de corrections, on peut relire cet ensemble et mettre à jour le guide de style en conséquence — c'est un deuxième cycle d'affinage, plus fiable que le premier car basé sur de vrais articles publiés, cette fois.

---

## 3. Description détaillée du pipeline

### 3.1 Vue d'ensemble

```
INGESTION → DÉDUPLICATION → SCORING → RECHERCHE → RÉDACTION → CONTRÔLE → REVUE HUMAINE
```

### 3.2 Ingestion
Collecte régulière (toutes les 2 à 6 heures) depuis des sources hiérarchisées par fiabilité juridique :
1. Salles de presse constructeurs (flux RSS officiels)
2. Communiqués institutionnels (ACEA, PFA, UTAC, Euro NCAP, autorités de régulation)
3. Presse spécialisée — **utilisée uniquement comme signal de ce qui est chaud, jamais comme source de texte** (contrainte du droit voisin, déjà détaillée dans le document de cadrage général)
4. Reddit et forums spécialisés — détection précoce

### 3.3 Déduplication
Chaque item est encodé en vecteur (modèle d'embedding local, gratuit, tournant sur CPU). Les items proches sont regroupés en un seul « événement ». Le nombre de sources dans un groupe est en soi un signal de pertinence.

### 3.4 Scoring
Score composite : densité de reprise, vélocité, affinité avec la ligne éditoriale (mesurée par proximité avec les publications passées les plus performantes), fraîcheur, poids de la marque concernée, nouveauté du sujet.

### 3.5 Recherche approfondie
Pour les événements au-dessus du seuil, un agent rassemble les faits vérifiables et produit un **brief structuré**, chaque fait rattaché à sa source. Le rédacteur (étape suivante) n'a le droit d'écrire que ce qui figure dans ce brief — c'est le garde-fou anti-hallucination.

### 3.6 Rédaction
Le brief + le guide de style (§2) produisent : titre, chapô, corps, légendes, meta-description. Toujours dans les limites du guide en vigueur au moment de la génération.

### 3.7 Contrôle automatique
Avant présentation à l'humain : chaque chiffre du texte existe-t-il dans le brief ? Aucun passage ne recopie une source de trop près (vérification anti-plagiat par recouvrement de séquences de mots) ? Structure et longueur dans les bornes du guide ?

### 3.8 Revue humaine
Interface de relecture : article, brief et sources affichés côte à côte. Validation, correction ou rejet. **Rien ne se publie sans validation.**

---

## 4. Parcours utilisateur

### Écran 1 — Tableau de veille
Liste des événements détectés, triés par score de pertinence, avec pour chacun : le score, le nombre de sources, un résumé d'une ligne, l'ancienneté. Filtre par fenêtre temporelle (jour, semaine) et par marque.

### Écran 2 — Détail d'un événement
Le brief factuel complet, chaque fait avec sa source cliquable. Bouton « Générer l'article ».

### Écran 3 — Article généré, en attente de revue
Trois colonnes : le brief source, l'article généré, le résultat des contrôles automatiques (chiffres vérifiés, longueur, alerte anti-plagiat s'il y en a une). Le rédacteur édite directement le texte au milieu.

### Écran 4 — Validation
Boutons : « Publier sur le site », « Enregistrer en brouillon », « Rejeter ». Chaque action est journalisée (qui, quand, quoi).

### Écran 5 — Historique et apprentissage
Liste des articles publiés avec, pour chacun, un lien vers la version générée initiale et la version finale publiée — c'est la matière brute du cycle d'affinage décrit en §2.4.

---

## 5. Vitesse — des attentes différentes de STUDIO_AUTOMOBILE, et c'est normal

STUDIO_AUTOMOBILE devait être instantané parce que c'est un outil d'édition en direct, avec quelqu'un devant l'écran qui attend. **RADAR n'est pas cet outil-là.** C'est un pipeline de fond : la veille tourne toute seule, la rédaction d'un article prend le temps qu'il faut (recherche + génération : de 30 secondes à 2 minutes selon la complexité du sujet), et le rédacteur découvre le résultat déjà prêt, sans avoir attendu devant son écran.

**Ce qu'il faut garantir, ce n'est pas la vitesse d'un seul article, c'est la fraîcheur du flux :** un événement chaud doit apparaître dans le tableau de veille dans les 2 à 6 heures suivant sa publication, pas être découvert le lendemain. C'est le cycle d'ingestion qui doit être régulier, pas chaque étape individuelle qui doit être ultra-rapide.

**Ne pas sur-ingénierer ce point.** Contrairement à STUDIO_AUTOMOBILE, il n'y a pas de risque de « lenteur perçue » ici puisqu'il n'y a personne devant un écran à attendre le résultat en temps réel.

---

## 6. Stack technique

### 6.1 Principe : réutiliser l'infrastructure de STUDIO_AUTOMOBILE

Pas besoin d'un deuxième serveur, d'un deuxième compte d'hébergement, d'un deuxième système d'authentification. RADAR tourne sur **la même machine** que STUDIO_AUTOMOBILE (option A ou B du document précédent), avec :
- Une interface web supplémentaire dans le même projet Next.js (ou un second petit projet sur le même serveur si vous préférez séparer les codebases)
- Le même système de connexion pour l'équipe

C'est le meilleur moyen de tenir la contrainte zéro euro tout en gardant un seul système à maintenir.

### 6.2 Composants spécifiques à RADAR

| Couche | Choix | Licence | Rôle |
|---|---|---|---|
| **Récupération des flux** | Parseur RSS standard en Node.js | — | Lecture des salles de presse et communiqués |
| **Scraping ponctuel** (pages sans flux RSS) | Playwright (déjà présent pour STUDIO_AUTOMOBILE) | Apache 2.0 | Réutilisation directe, pas de nouvel outil à apprendre |
| **Embeddings pour la déduplication et le scoring** | `@xenova/transformers` (modèles ONNX exécutés localement en Node, ex. multilingue e5) | Apache 2.0 | Tourne sur CPU, aucun appel API, cohérent avec le principe « un seul langage » déjà retenu |
| **Stockage des événements et articles** | Même base que STUDIO_AUTOMOBILE (SQLite ou Postgres léger) | — | Table `events`, `briefs`, `articles`, `corrections` |
| **Ordonnancement du cycle d'ingestion** | Tâche planifiée (cron) directement sur le serveur qui tourne déjà en continu | — | Pas de dépendance à un service tiers |
| **Rédaction** | Routeur LLM (identique à celui de STUDIO_AUTOMOBILE, réutilisé) | — | Voir §6.3 sur la confidentialité |
| **Détection anti-plagiat** | Comparaison de séquences de mots en JavaScript pur | — | Pas de bibliothèque externe nécessaire, la logique est simple |
| **Publication** | API du site (projet 1, une fois qu'il existe) | — | En attendant, export en brouillon dans une base locale |

### 6.3 Le point de vigilance qui distingue RADAR de STUDIO_AUTOMOBILE : la confidentialité

C'est rappelé dans le document de cadrage général et ça reste vrai : RADAR va manipuler des **communiqués sous embargo**. Le routeur LLM doit appliquer une règle stricte, indépendante de la configuration de l'utilisateur : tout contenu marqué « embargo » part uniquement vers un point de terminaison qui n'utilise pas les données pour l'entraînement, jamais vers l'offre gratuite standard.

STUDIO_AUTOMOBILE peut se permettre d'utiliser une offre gratuite sans trop de risque (son contenu — thèmes de posts lifestyle — est rarement sensible). **RADAR ne peut pas, structurellement**, à cause de la nature de ses sources. C'est le seul poste du budget zéro à ne pas transiger, comme déjà indiqué.

---

## 7. Points d'attention pour la qualité

### 7.1 Le brief comme seule autorité factuelle
Rien dans l'article final ne doit exister si ce n'est pas dans le brief. C'est le garde-fou le plus important du projet — plus important que la qualité de la prose elle-même. Un article bien écrit mais qui invente un chiffre est pire qu'un article maladroit mais exact.

### 7.2 Le seuil anti-plagiat doit être calibré, pas juste activé
Une détection trop stricte va bloquer des articles innocents (une formulation courante du secteur automobile qui se répète naturellement). Une détection trop laxiste laisse passer des reprises trop proches. Il faut le tester sur des cas réels avant mise en production, pas se fier à une valeur par défaut.

### 7.3 Le guide de style doit rester un document lisible, pas une boîte noire
Le rédacteur en chef doit pouvoir ouvrir le fichier, le lire, et comprendre pourquoi l'outil écrit comme il écrit. Si le guide devient un ensemble de paramètres numériques incompréhensibles, personne ne pourra plus le corriger efficacement.

### 7.4 Traçabilité du droit voisin
Chaque source utilisée dans un brief garde son URL et sa nature (communiqué officiel vs signal presse). En cas de doute a posteriori sur un article, il faut pouvoir remonter en quelques secondes à ce qui a nourri le texte.

### 7.5 Marquage de provenance, dès le premier article
Comme signalé dans le document de cadrage général, l'obligation de transparence sur les contenus assistés par IA s'applique déjà. Chaque article doit porter, dès la conception de la base de données, un champ de provenance (humain / assisté / généré-relu), même si la mention visible sur le site n'est finalisée qu'avec le projet 1.

---

## 8. Étapes de développement — pas à pas

### Étape 0 — Le travail qui ne se code pas
**Objectif.** Session avec le rédacteur en chef pour écrire le guide de style provisoire (couche structure, §2.2) et lister les premières sources officielles à suivre (salles de presse constructeurs prioritaires).
**Critère de fin.** Un fichier `guide-de-style-v0.md` existe, même imparfait, et une liste d'au moins 10 sources RSS/communiqués identifiées.

### Étape 1 — Ingestion minimale
**Objectif technique.** Brancher 3-4 flux RSS de salles de presse, stocker les items bruts en base.
**Objectif qualité.** Vérifier qu'aucun doublon évident n'échappe à un premier filtre basique (même titre exact).
**Critère de fin.** Le tableau de veille (écran 1, version minimale) affiche des items réels, actualisés automatiquement.

### Étape 2 — Déduplication et scoring
**Objectif technique.** Brancher les embeddings locaux, implémenter le clustering et le score composite.
**Objectif qualité.** Sur un lot d'items réels, vérifier à l'œil que les regroupements ont du sens et que le classement par score reflète une intuition raisonnable de ce qui est important.
**Critère de fin.** Le tableau de veille affiche des événements groupés et triés, plus lisibles qu'une simple liste chronologique.

### Étape 3 — Recherche et brief factuel
**Objectif technique.** Implémenter l'étape de recherche qui produit le brief structuré et sourcé.
**Objectif qualité.** Chaque fait du brief doit être vérifiable manuellement en suivant sa source — tester sur 5 événements réels.
**Critère de fin.** L'écran 2 (détail d'un événement) affiche un brief complet et sourcé pour n'importe quel événement du tableau.

### Étape 4 — Rédaction avec le guide provisoire
**Objectif technique.** Brancher le routeur LLM, implémenter la génération contrainte au brief, avec le guide de style v0.
**Objectif qualité.** Vérifier sur 5-10 générations que rien n'est inventé hors du brief (contrôle manuel, avant même d'automatiser le contrôle §3.7).
**Critère de fin.** Un article complet est généré de bout en bout à partir d'un événement réel, factuellement fiable même si le ton n'est pas encore parfait.

### Étape 5 — Contrôles automatiques et interface de revue
**Objectif technique.** Implémenter la vérification des chiffres contre le brief, la détection anti-plagiat, l'écran de revue à trois colonnes.
**Objectif qualité.** Le rédacteur en chef doit pouvoir valider ou corriger un article en moins de 5 minutes, sans avoir à rouvrir les sources manuellement pour vérifier les faits — tout doit être déjà sous les yeux.
**Critère de fin.** Cinq articles réels passent par le cycle complet ingestion → brief → rédaction → revue → décision, avec journalisation de chaque décision.

### Étape 6 — Intégration du guide de style enrichi (dès que les légendes sont disponibles)
**Objectif technique.** Lancer le script d'analyse des légendes (§2.2, couche 1), fusionner le résultat dans le guide existant, versionner.
**Objectif qualité.** Comparer 5 articles générés avec le guide v0 et les mêmes 5 avec le guide enrichi — le rédacteur en chef doit percevoir une amélioration nette du ton, pas juste un changement.
**Critère de fin.** Le guide passe en version 1, daté, avec un changelog de ce qui a changé.

### Étape 7 — Cycle d'affinage par les corrections
**Objectif technique.** Instrumenter l'enregistrement systématique des paires (généré/corrigé), construire un export exploitable pour relecture périodique.
**Objectif qualité.** Après 30 corrections enregistrées, produire une révision du guide de style basée sur les patterns observés, pas sur l'intuition seule.
**Critère de fin.** Le guide passe en version 2, avec au moins 3 changements concrets tracés aux corrections qui les ont motivés.

### Étape 8 — Publication (une fois le projet 1 disponible)
**Objectif technique.** Brancher l'export vers le site.
**Critère de fin.** Un article validé dans RADAR apparaît sur le site sans étape manuelle intermédiaire, hors la validation elle-même.

---

## 9. Coûts

| Poste | Coût |
|---|---|
| Infrastructure (partagée avec STUDIO_AUTOMOBILE) | 0 € additionnel |
| Ingestion RSS, scraping, embeddings locaux | 0 € |
| Détection anti-plagiat | 0 € (logique interne) |
| Rédaction (LLM) | **5-15 €/mois recommandé**, pour garantir la confidentialité des contenus sous embargo (§6.3) — seul poste où la contrainte zéro n'est pas tenable sans risque |
| Le vrai coût du projet | Le temps de la session avec le rédacteur en chef pour la couche structure du guide (§2.2), et le temps de relecture renforcée pendant les 4-6 premières semaines |

---

## 10. Ce qu'il faut retenir en une phrase par section

- **Le problème central** : pas d'articles existants → guide de style à deux couches, voix dérivée des légendes, structure écrite à la main, jamais bloquant pour démarrer.
- **Pipeline** : ingestion → déduplication → scoring → recherche sourcée → rédaction contrainte au brief → contrôle → revue humaine.
- **Vitesse** : ce n'est pas un outil d'édition en direct, c'est un flux de fond — ce qui compte c'est la fraîcheur de la veille, pas la latence d'un seul article.
- **Stack** : même infrastructure que STUDIO_AUTOMOBILE, embeddings locaux, aucun nouveau serveur.
- **Le seul vrai coût** : quelques euros par mois sur le LLM pour la confidentialité, et surtout le temps humain — la session de cadrage du style, et la relecture renforcée le temps que le guide se stabilise.
