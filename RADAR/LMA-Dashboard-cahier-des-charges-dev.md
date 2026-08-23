# DASHBOARD LMA
## Cahier des charges développeur — v1.0
**Finalisation de l'existant (`/`, `/events`, `/events/[id]`, `/ready`, `/corrections` déjà en ligne sur `localhost:3000`) + modules retenus dans `LMA-Dashboard-verdict-final.md` §3.**

---

## 0. Lecture rapide — les décisions structurantes

| Question | Décision | Raison courte |
|---|---|---|
| On repart de zéro ? | **Non.** Le dashboard existant (`/`, `/events`, `/events/[id]`, `/ready`, `/corrections`) est le socle. Ce document ajoute et restructure, il ne remplace rien. | Éviter le travail perdu, cohérent avec `LMA-Dashboard-verdict-final.md` §4 |
| Authentification | **3 niveaux, pas un vrai système multi-comptes** — voir §3 | Répond au besoin de restriction sans construire une infrastructure de comptes (gestion de mots de passe, reset, etc.) explicitement écartée pour STUDIO, même logique ici |
| Stack | **Identique à STUDIO/RADAR** — Next.js, React, la même base de données, Playwright déjà présent | Un seul développeur, une seule stack à maintenir sur les 3 outils |
| Export du rapport partenaire | **Playwright, déjà dans la stack** (le même outil qui capture les visuels STUDIO sait aussi générer un PDF) | Zéro nouvelle dépendance |
| Les stats et ratios sont-ils calculés par une IA ? | **Non, jamais.** Calcul déterministe en code, pas de génération de texte libre sur des chiffres | Le retour d'audit du dashboard a explicitement identifié des chiffres inventés présentés comme réels dans les analyses reçues — ce projet ne doit jamais reproduire ce risque |
| Coût | 0 € | Toutes les briques nouvelles sont des extensions d'outils déjà dans la stack, aucune nouvelle dépendance payante |

---

## 1. Objectif

Faire du dashboard le **centre de contrôle unique** de l'équipe pour trois choses : savoir quoi faire aujourd'hui, produire les rapports qui aident à vendre/renouveler les partenariats, et retrouver n'importe quel contenu (article, post, visuel) sans ouvrir dix onglets. Le dashboard reste strictement un outil de production interne — jamais public, jamais consulté par un partenaire directement (voir `LMA-Dashboard-verdict-final.md` §3, portail partenaire séparé explicitement écarté pour l'instant).

**Contrainte permanente, comme pour RADAR et STUDIO :** l'outil prépare et présente, il ne décide jamais seul d'une action ayant un effet business ou éditorial (publier, envoyer un rapport à un partenaire, modifier un scoring). Voir `LMA-Dashboard-verdict-final.md` §1.A sur pourquoi l'ajustement automatique du scoring RADAR a été explicitement écarté.

---

## 2. Description détaillée des modules

### 2.1 Déjà construit — à conserver tel quel dans sa logique, à adapter à la nouvelle authentification

- `/` — page d'accueil (à faire évoluer, voir 2.2)
- `/events`, `/events/[id]` — veille RADAR
- `/ready` — articles validés, ouverture de STUDIO avec titre pré-rempli
- `/corrections` — suivi des corrections

### 2.2 Nouveau — Accueil « à faire aujourd'hui »

Remplace la page d'accueil actuelle (probablement les deux cartes RADAR/STUDIO) par une vue de synthèse. Elle n'introduit aucune nouvelle donnée — elle agrège ce qui existe déjà dans `/events`, `/ready`, `/corrections`, `/stats`, `/partenaires` :

```
🔴 Urgent (ex : article en attente > 48h, livrable partenaire à échéance cette semaine)
🟠 En production (événements en cours de rédaction/validation)
🟢 Prêt (articles validés, posts STUDIO en attente d'export)
📊 À analyser (posts publiés depuis plus de 3 jours, pas encore de stats déposées)
🤝 Partenaires (rapports à envoyer, livrables en retard)
```

Chaque ligne est cliquable et amène directement à l'élément concerné. Les deux cartes RADAR/STUDIO restent accessibles (navigation principale), mais ne sont plus le premier contenu vu à l'ouverture.

### 2.3 Nouveau — `/stats`

Une zone de dépôt de fichier CSV (export natif Instagram, voir le format retenu à l'Étape 3 du plan de dev). À l'import :
- Calcul automatique par publication : taux d'engagement (interactions/reach), taux de sauvegarde (saves/reach), taux de partage (shares/reach) — formules simples, documentées dans le code, jamais devinées.
- Classement des publications par performance sur la période importée.
- Rattachement automatique à l'identifiant de contenu partagé (§2.5) quand disponible, pour relier une performance à l'événement RADAR/post STUDIO d'origine.
- Affichage des tendances **en langage descriptif généré à partir de gabarits de phrase remplis avec les chiffres calculés** (« Les posts au format carrousel publiés ce mois font en moyenne X% d'engagement de plus que les autres formats du mois ») — jamais un texte libre généré par un LLM qui pourrait inventer un chiffre. Voir §0.

### 2.4 Nouveau — `/partenaires`

Deux écrans :

**Liste des partenaires.** Nom, marque, période de campagne, livrables attendus (texte libre ou liste simple : « 3 posts, 1 article »), statut de chaque livrable.

**Fiche partenaire → génération de rapport.** Une fois des posts rattachés à un partenaire (via l'identifiant partagé, §2.5) et des stats importées (§2.3), un bouton « Générer le rapport » produit un document présentant : les publications de la campagne, leurs performances, une comparaison à la moyenne des publications comparables de la période (même format, période récente — jamais une comparaison à l'ensemble du compte, qui fausserait la lecture). Export en PDF, prêt à être envoyé tel quel.

### 2.5 Nouveau — Identifiant de contenu partagé

Pas un écran, une modification de structure : chaque événement RADAR, chaque post STUDIO, chaque partenaire, chaque import de stats partage un même identifiant de contenu quand ils se rapportent au même sujet. Un seul champ ajouté aux tables existantes, pas une refonte — c'est ce qui permet à `/stats` et `/partenaires` de fonctionner sans dupliquer la saisie.

### 2.6 Nouveau — `/drive`

Page en lecture seule sur le Drive partagé déjà utilisé par STUDIO pour l'export. Navigation par dossier, recherche par nom, clic pour ouvrir le fichier dans Drive (le dashboard n'héberge jamais le fichier lui-même, il pointe dessus).

### 2.7 P1, après le noyau — `/calendrier`

Vue semaine de ce qui est prévu/publié, construite à partir des dates déjà présentes dans RADAR/STUDIO — pas une nouvelle saisie de calendrier séparée.

---

## 3. Authentification et restriction des fonctionnalités

Trois niveaux, volontairement légers — pas de comptes individuels avec mots de passe propres, pas de gestion de mot de passe oublié, cohérent avec ce qui a déjà été tranché et documenté pour STUDIO.

### Niveau 1 — Accès au dashboard (mot de passe unique partagé)
Identique au mécanisme déjà en place pour STUDIO (JWT en session). Un seul mot de passe, connu de toute l'équipe, donne accès aux pages générales : accueil, RADAR, STUDIO, Drive, calendrier.

### Niveau 2 — Identification par nom (pas une authentification, une attribution)
Au premier accès de la session, un sélecteur demande « Qui êtes-vous ? » (liste des 5-10 membres de l'équipe, saisie une fois par la direction). Ce nom est attaché à chaque action journalisée : validation d'un article dans RADAR, correction enregistrée, rapport partenaire généré. **Ce n'est pas un mot de passe individuel** — n'importe qui connaissant le mot de passe du Niveau 1 peut se déclarer sous n'importe quel nom. C'est suffisant pour la journalisation interne (qui a validé quoi), pas conçu comme une protection contre un usage malveillant en interne — si ce niveau de garantie devient nécessaire, ce sera une vraie discussion de comptes individuels, pas une extension de ce mécanisme.

### Niveau 3 — Passphrase supplémentaire pour `/partenaires`
Une deuxième phrase de passe, distincte du Niveau 1, connue uniquement des personnes qui doivent voir les données partenaires (tarifs, performance par contrat — des informations plus sensibles que le reste du dashboard). Sans elle, l'entrée « Partenaires » n'apparaît pas dans la navigation et la route redirige. Techniquement : un claim supplémentaire dans le même JWT déjà utilisé pour le Niveau 1, pas un système séparé.

**Pourquoi pas plus (rôles Auteur/Éditeur/Direction comme proposé dans les documents reçus) :** à 5-10 personnes qui se connaissent, un système de rôles fins ajoute de la friction (gestion des permissions, cas limites) pour un bénéfice qui n'a pas été demandé explicitement par le patron. Le seul besoin réel identifié est de protéger les données partenaires — le Niveau 3 y répond directement. Si le besoin de rôles plus fins apparaît à l'usage, ce sera une évolution ciblée, pas une anticipation.

---

## 4. Parcours utilisateur

### Connexion
Mot de passe unique (Niveau 1) → sélection du nom (Niveau 2, une fois par session) → arrivée sur l'accueil.

### Écran d'accueil
Vue « à faire aujourd'hui » (§2.2). Navigation principale toujours visible : Accueil, RADAR, STUDIO (ouvre l'app séparée), Stats, Partenaires*, Drive, Corrections. (*Partenaires visible seulement après Niveau 3.)

### Flux RADAR → STUDIO (inchangé)
Consultation de la veille → génération de brief → article → validation → bouton « Créer un post Instagram » → STUDIO s'ouvre avec le titre pré-rempli. Ce flux existant n'est pas modifié par ce document, seulement enrichi de l'identifiant de contenu partagé (§2.5) en arrière-plan.

### Flux Stats
Fin de semaine : ouverture de `/stats` → dépôt du CSV exporté d'Instagram → l'outil calcule et classe → l'équipe consulte les tendances descriptives. Aucune action de correction manuelle des chiffres n'est prévue (les chiffres viennent du CSV, pas d'une saisie).

### Flux Partenaires
Création d'un partenaire (une fois, en début de campagne) → au fil des semaines, rattachement des posts concernés (sélection dans une liste, pas de ressaisie) → en fin de campagne ou à échéance périodique, clic « Générer le rapport » → PDF prêt à envoyer.

### Flux Drive
Recherche d'un visuel par nom ou navigation par dossier → clic → ouverture du fichier réel dans Drive dans un nouvel onglet.

---

## 5. Stack technique

Reprend exactement la stack déjà validée pour STUDIO et RADAR, sans nouvelle dépendance à valider :

| Besoin | Solution retenue | Déjà dans la stack ? |
|---|---|---|
| Serveur + interface | Next.js App Router, React | Oui (STUDIO) |
| Base de données | Même base que RADAR/STUDIO (SQLite ou Postgres léger) | Oui |
| Génération du rapport partenaire en PDF | Playwright (`page.pdf()`) — le même outil qui capture déjà les visuels STUDIO | Oui, extension d'usage |
| Lecture du CSV Instagram | `papaparse` (MIT) | Nouveau, licence déjà vérifiée dans l'écosystème de ce projet |
| Lecture du Drive | API Google Drive, déjà intégrée côté export STUDIO | Oui, extension en lecture |
| Auth 3 niveaux | Extension du système JWT déjà codé pour STUDIO | Oui |
| Hébergement | Même VM que STUDIO/RADAR (Option retenue dans le cahier STUDIO) | Oui |

**Aucune brique de génération de texte libre (LLM) n'est nécessaire pour ce dashboard** — c'est un choix délibéré, pas un oubli : tout ce qui est chiffré doit rester calculé, jamais rédigé librement (§0).

---

## 6. UI/UX — règles concrètes, pas des principes vagues

L'exigence du patron est « simple, intuitif, adapté au besoin, plaisant ». Voici ce que ça veut dire en décisions vérifiables, pas en adjectifs.

### 6.1 Un système de composants, pas des écrans réinventés à chaque page
Utiliser une bibliothèque de composants prête (type shadcn/ui — licence MIT, gratuite, cohérente avec React déjà en stack) plutôt que redessiner boutons/tableaux/formulaires à chaque nouvel écran. Bénéfice concret : une modification de style (couleur, espacement) se fait à un seul endroit, jamais page par page — et le rendu reste cohérent même quand un seul développeur construit 7 pages sur plusieurs semaines.

### 6.2 Une hiérarchie d'information stricte sur chaque écran
Sur chaque page : un titre, au maximum une action principale mise en avant visuellement (bouton plein, couleur d'accent), les actions secondaires en retrait (bouton discret ou lien). Jamais plus d'une couleur d'accent par écran — c'est ce qui évite qu'un dashboard avec 7 modules ait l'air de 7 outils différents assemblés à la hâte.

### 6.3 États systématiques sur chaque page qui affiche des données
Trois états à prévoir pour chaque liste/tableau du dashboard, sans exception : **chargement** (squelette gris qui épouse la forme du contenu à venir, jamais une simple roue qui tourne dans le vide), **vide** (message qui explique quoi faire, pas juste « aucune donnée » — ex. sur `/stats` vide : « Déposez votre premier export CSV pour voir apparaître les tendances »), **erreur** (message clair, jamais un écran blanc ou une erreur technique brute affichée à l'utilisateur).

### 6.4 Le moins d'action manuelle possible — vérifié page par page
Chaque écran de ce document a été conçu pour qu'aucune donnée ne soit ressaisie si elle existe déjà ailleurs dans le système (l'identifiant de contenu partagé, §2.5, existe précisément pour ça). Règle de conception pour toute future page : avant d'ajouter un champ de saisie, vérifier si la donnée n'existe pas déjà dans RADAR, STUDIO ou une page existante du dashboard.

### 6.5 Adapté à un usage rapide, y compris sur mobile
L'équipe consultera probablement l'accueil et les notifications urgentes depuis un téléphone, pas seulement au bureau. L'accueil (§2.2) et les listes doivent rester lisibles et cliquables sans zoom sur un écran de téléphone — pas besoin d'une app mobile séparée, juste une mise en page qui s'adapte (déjà standard avec les composants recommandés en 6.1).

### 6.6 Cohérence visuelle avec le reste des outils LMA, sans copier la charte des posts
Le dashboard est un outil de travail, pas un post Instagram — il n'a pas besoin de la police ou des couleurs de la charte éditoriale (Roboto 900, dégradés noirs) définies pour STUDIO. Une police neutre et lisible à l'écran (type Inter), un fond clair, une seule couleur d'accent (à choisir avec la direction, par exemple reprenant une couleur du logo) suffisent — la cohérence recherchée est celle d'un outil professionnel agréable à utiliser plusieurs heures par jour, pas celle d'un post publié.

---

## 7. Étapes de développement — pas à pas, avec critère de réussite vérifiable

### Étape 0 — Audit de l'existant et mise à niveau
**Objectif.** Vérifier que `/`, `/events`, `/events/[id]`, `/ready`, `/corrections` fonctionnent toujours après l'ajout de la nouvelle authentification (§3), sans régression sur le flux RADAR → STUDIO déjà en production.
**Critère de fin.** Le flux complet (consulter la veille → générer un article → valider → ouvrir STUDIO avec le titre pré-rempli) fonctionne de bout en bout avec le nouveau système d'authentification, testé réellement, pas supposé.

### Étape 1 — Authentification à 3 niveaux
**Objectif technique.** Implémenter le sélecteur de nom (Niveau 2) et la passphrase partenaires (Niveau 3), en étendant le JWT déjà en place plutôt qu'en construisant un nouveau système.
**Objectif qualité.** Une personne sans la passphrase Niveau 3 ne doit voir apparaître nulle part l'entrée « Partenaires », que ce soit dans la navigation ou en tapant l'URL directement (redirection, pas juste un lien caché).
**Critère de fin.** Testé avec et sans chaque niveau : accès refusé proprement (pas d'erreur technique visible) quand un niveau manque, accès accordé quand il est présent.

### Étape 2 — Identifiant de contenu partagé
**Objectif technique.** Ajouter le champ d'identifiant partagé aux tables RADAR et STUDIO existantes, sans casser les données déjà en base.
**Objectif qualité.** Aucune perte de données existantes — les événements et posts déjà créés avant cette étape doivent rester consultables normalement.
**Critère de fin.** Un événement validé dans RADAR aujourd'hui, puis transformé en post dans STUDIO, porte le même identifiant consultable dans les deux outils.

### Étape 3 — Accueil « à faire aujourd'hui »
**Objectif technique.** Construire les requêtes d'agrégation sur les données déjà existantes (§2.2), aucune nouvelle donnée à saisir.
**Objectif qualité.** Les chiffres affichés (urgent, en production, prêt) doivent correspondre exactement à ce qu'on trouve en allant vérifier manuellement dans `/events` et `/ready` — pas d'approximation.
**Critère de fin.** Comparaison manuelle des compteurs affichés contre un décompte fait à la main sur des données réelles : zéro écart.

### Étape 4 — Module `/stats`
**Objectif technique.** Import CSV (`papaparse`), calcul des ratios (§2.3), classement, génération des phrases descriptives à partir de gabarits.
**Objectif qualité.** Chaque ratio affiché doit être vérifiable à la main à partir des colonnes brutes du CSV — recalculer 5 lignes manuellement et comparer au résultat affiché.
**Critère de fin.** Un vrai export CSV Instagram est importé avec succès, les ratios de 5 publications choisies au hasard sont vérifiés manuellement et correspondent exactement à l'affichage.

### Étape 5 — Module `/partenaires`
**Objectif technique.** Création de partenaire, rattachement de posts via l'identifiant partagé (Étape 2), génération du rapport PDF via Playwright.
**Objectif qualité.** Le calcul de la moyenne comparable (§2.4) doit être documenté et vérifiable — pas une boîte noire, même approximative.
**Critère de fin.** Un partenaire test, avec au moins 3 posts rattachés et des stats importées, produit un PDF exportable, avec une comparaison à la moyenne dont le calcul est vérifié à la main.

### Étape 6 — Explorateur `/drive`
**Objectif technique.** Lecture seule de l'API Drive déjà utilisée par STUDIO, navigation par dossier et recherche par nom.
**Objectif qualité.** Aucune écriture, aucune duplication de fichier — le dashboard ne fait que pointer vers les fichiers réels.
**Critère de fin.** Un fichier déposé par STUDIO dans le Drive partagé apparaît dans `/drive` sans action supplémentaire, et le clic ouvre bien le fichier réel dans Drive.

### Étape 7 — Passage UI/UX de cohérence
**Objectif technique.** Vérifier que chaque page (existante et nouvelle) respecte les règles §6 : bibliothèque de composants commune, un seul accent par écran, les 3 états (chargement/vide/erreur) présents partout.
**Objectif qualité.** Test réel sur un écran de téléphone, pas seulement en pensée — chaque liste doit rester utilisable sans zoom.
**Critère de fin.** Checklist des règles §6 passée en revue page par page (7 pages minimum), aucune page sans les 3 états prévus.

### Étape 8 (P1) — `/calendrier`
**Objectif technique.** Vue semaine construite à partir des dates déjà présentes dans RADAR/STUDIO.
**Critère de fin.** Un article planifié dans RADAR apparaît automatiquement dans le calendrier, sans double saisie.

### Étape 9 (P1) — Enrichissement `/corrections`
**Objectif technique.** Ajouter un compteur de récurrence sur les corrections déjà journalisées (donnée déjà existante, juste pas encore agrégée).
**Critère de fin.** Une erreur corrigée 3 fois sur des articles différents apparaît clairement comme récurrente, pas comme 3 entrées isolées.

---

## 8. Coûts

| Poste | Coût |
|---|---|
| Toutes les nouvelles briques (`papaparse`, extension Playwright, extension Drive API, shadcn/ui) | 0 € — aucune n'est une nouvelle dépendance payante |
| Infrastructure | 0 € additionnel — même VM que STUDIO/RADAR |
| Le vrai coût | Le temps de construction (9 étapes), et la définition avec la direction de qui a accès au Niveau 3 (Partenaires) |

---

## 9. Ce qu'il faut retenir en une phrase par section

- **Objectif** : centre de contrôle unique, pas un nouvel outil de production — RADAR et STUDIO restent les moteurs.
- **Auth** : 3 niveaux légers (mot de passe partagé, identification par nom, passphrase partenaires) — pas un système de comptes individuels.
- **Modules nouveaux** : accueil de synthèse, stats (calcul déterministe, jamais généré librement), partenaires (rapport PDF via Playwright déjà en stack), Drive en lecture seule, un identifiant de contenu partagé qui relie tout sans ressaisie.
- **UI/UX** : des règles vérifiables (composants communs, un accent par écran, 3 états systématiques, testé sur mobile), pas des adjectifs vagues.
- **Coût** : zéro, chaque nouvelle brique est une extension de ce qui existe déjà dans la stack STUDIO/RADAR.
