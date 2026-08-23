# Dashboard LMA — Audit critique des 2 analyses reçues + version finale
**Neutre, exigeant, pessimiste par défaut. Chaque affirmation chiffrée est soit vérifiée, soit marquée comme non vérifiée.**

---

## 0. Ce qui a été vérifié indépendamment avant de trancher

Avant de juger les deux documents que vous avez reçus, j'ai vérifié quelques faits moi-même plutôt que de reprendre leurs chiffres tels quels.

| Fait | Vérifié | Ce que ça change |
|---|---|---|
| Instagram : followers/posts | **152 000 followers, 1 425 posts, 1 220 comptes suivis** (page officielle, consultée directement) | Confirme l'ordre de grandeur déjà utilisé dans nos documents précédents. |
| Podcast Acast : maturité du contenu | **Un seul épisode en ligne, publié le 8 août 2026** (page officielle Acast consultée directement) — pas un catalogue établi, un lancement tout récent (~11 jours avant cette conversation) | **Change la priorité.** Les deux documents reçus parlent du podcast comme d'un pilier de contenu mûr à automatiser en priorité (repurposing, clips, etc.). Ce n'est pas le cas — c'est un contenu en phase de test. Construire un pipeline de découpage automatique pour un podcast à 1 épisode est une dépense d'ingénierie prématurée. |
| Partenariats B2B | Le podcast affiche un contact dédié : *« Pour toute demande de partenariat : contact@lemediaautomobile.fr »* | Confirme que le partenariat B2B est un axe business réel et assumé, pas une supposition — pèse dans la décision de la section 3. |
| HubSpot, offre gratuite | API accessible sur l'offre gratuite (contacts/entreprises), mais **limitée à 100 appels/10s**, et l'objet « Campagnes » n'est pas confirmé comme disponible hors palier payant | À vérifier concrètement avec le compte HubSpot réel du patron avant de construire une intégration dessus — ne pas supposer un accès complet. |

---

## 1. Verdict sur les deux documents reçus

### Ce qui est solide et à garder

- **La séparation Dashboard interne / Site vitrine public** (document 30, point 1) est correcte et déjà cohérente avec nos documents précédents : le site (Projet 1) est un affichage public qui pioche dans les données validées de RADAR, le dashboard reste un outil de production fermé. Pas de débat là-dessus.
- **Ne pas reconstruire un CRM, un Drive, un éditeur vidéo** (document 31, section 46) est le bon réflexe — cohérent avec la contrainte « un seul développeur, coût zéro » déjà actée dans nos cahiers des charges STUDIO/RADAR.
- **L'analyse des dépôts GitHub** (document 31, sections 19-28) recoupe ce qu'on avait déjà établi dans le tout premier document de ce projet : Remotion a un vrai problème de licence à partir de 4 salariés, la publication automatique (`instagram-ai-agent`) est à écarter, `capcut-cli`/`tscaps` sont des pistes valables *si* un jour un outil vidéo est construit — mais pas maintenant. Rien de neuf ici, juste une confirmation indépendante.

### Ce qui doit être corrigé avant d'être construit

**A. La « boucle de résonance » / apprentissage automatique qui réécrit le scoring de RADAR (document 30, section 3 ; document 31, sections 15-16, 54) — statistiquement intenable à ce volume.**

L'idée : le système détecte les publications qui surperforment, en déduit des patterns (« les comparatifs prix marchent », « le format carrousel marche »), et **modifie automatiquement** l'algorithme de scoring de RADAR.

Le problème n'est pas conceptuel, il est arithmétique. Une équipe de 5-10 personnes ne publie pas des centaines de posts par semaine. Si on prend un rythme réaliste pour ce type de structure — de l'ordre de quelques publications par jour — un mois de données donne au mieux quelques dizaines de posts. Chercher des patterns fiables (« +73% de performance », « format carrousel supérieur ») sur un échantillon de cette taille, c'est majoritairement du bruit statistique pris pour un signal. Les chiffres avancés dans le document 31 pour illustrer ce module (812 000 vues, +73%, +82%, 8,4% d'engagement) **ne sont d'ailleurs pas des données réelles du Média Automobile — ce sont des exemples inventés pour illustrer le concept**, et rien dans les documents ne dit clairement que ce sont des illustrations plutôt que des mesures. C'est exactement le genre de confusion qu'on ne peut pas se permettre.

Il y a un deuxième problème, indépendant du volume : un algorithme qui se réécrit tout seul est une boîte noire. Le cahier des charges de RADAR l'interdit déjà explicitement pour la même raison qui s'applique ici : *« le guide de style doit rester un document lisible, pas une boîte noire »* — le même principe s'applique au scoring. Si personne ne peut expliquer pourquoi RADAR a soudainement remonté tous les sujets Porsche, c'est un problème, pas une fonctionnalité.

**Ce qui est gardé de l'idée, corrigé :** le calcul automatique des ratios et la mise en évidence de ce qui a bien marché — **oui, exactement ce que le patron a demandé**. Ce qui est retiré : l'idée que le système modifie *automatiquement* et *silencieusement* l'algorithme de veille. À la place : le système **présente** les tendances observées à un humain, qui décide s'il veut ajuster manuellement le poids d'une marque ou d'un sujet dans RADAR (mécanisme qui existe déjà : `specStudio`/RADAR ont un score composite avec un « poids de la marque » ajustable). L'automatisation prépare, l'humain décide — le principe qu'on applique déjà partout ailleurs dans ce projet, appliqué ici aussi.

**B. Le périmètre du document 31 est démesuré pour un développeur seul à coût zéro.**

Le document propose environ 15 modules (Content Inbox, Content Object, Performance Intelligence, Drive, Content Packages, Calendrier, Partner Tracker, Repurposing, Event Mode, Asset Intelligence, Partner Portal, Website CMS, etc.), avec un tableau de priorité qui met presque tout en P0/P1. Le document le reconnaît lui-même en fin de section 52 avec les niveaux de difficulté, mais le classement final n'en tire pas les conséquences : on ne peut pas mettre 9 fonctionnalités en priorité maximale pour une seule personne. **Un tri plus dur est fait en section 3.**

**C. Le « Content Object » comme réécriture d'architecture unifiant podcast + vidéo + LinkedIn + Reels (document 30, section 7 ; document 31, section 7)** est prématuré. RADAR et STUDIO ne produisent aujourd'hui ni podcast ni vidéo — c'est une architecture pour des formats qui n'existent pas encore dans l'outil. Voir le point sur le podcast en section 0 : construire une infrastructure de repurposing pour un podcast à 1 épisode, c'est optimiser un pilier qui n'a pas encore prouvé qu'il allait durer.

---

## 2. Réponse à la question de séquencement (dashboard+site maintenant vs. dashboard puis site séparé)

Vous demandez s'il ne vaut pas mieux faire dashboard + site maintenant, puis un site vitrine séparé pour les clients/partenaires relié à RADAR pour la publication d'articles.

**Non — gardez la séparation, et c'est déjà ce que confirme le document 30 sur ce point précis.** Trois raisons concrètes, pas de principe :

1. **Le site public n'a pas les mêmes exigences que le dashboard.** Le dashboard peut se permettre un mot de passe unique partagé (déjà acté dans STUDIO §1.1) parce que c'est un outil interne à 5-10 personnes de confiance. Un site public doit survivre à un pic de trafic, à un lien mal formé partagé sur les réseaux, ou à une tentative d'intrusion — un tout autre niveau d'exigence, qu'il ne faut pas mélanger avec l'outil de production.
2. **Si le site plante, l'équipe doit pouvoir continuer à travailler.** Le dashboard (RADAR + STUDIO) doit rester fonctionnel même si le site public est indisponible. Techniquement, ça veut dire : le site lit dans la base de RADAR (comme déjà prévu dans le cahier des charges RADAR, Étape 8 — *« brancher l'export vers le site »*), il n'écrit jamais dedans, et RADAR/STUDIO ne dépendent d'aucune disponibilité du site pour fonctionner.
3. **Ordre de construction déjà tranché dans le premier document de ce projet** (§5.1) : dashboard/RADAR/STUDIO d'abord, site ensuite, parce que RADAR ne peut publier que si un site existe pour le recevoir — mais l'inverse n'est pas vrai, RADAR fonctionne très bien sans site (les articles restent en brouillon en attendant). Rien ne justifie de changer cet ordre.

**Ce que ça implique concrètement pour vous maintenant :** continuez à consolider le dashboard actuel (RADAR + STUDIO + les ajouts de la section 3 ci-dessous). Le site vitrine reste un projet séparé, à démarrer une fois que le dashboard produit un flux d'articles validés régulier — pas avant, parce que sans contenu à afficher, un site vitrine n'a rien à prouver.

---

## 3. La version finale du dashboard — triée, avec les modules explicitement écartés

### Principe de tri appliqué

Deux familles de fonctionnalités n'ont pas le même effet business, et il faut les distinguer plutôt que tout mettre au même niveau :

- **Gain de temps** (calendrier, inbox, recherche d'assets) : rend l'équipe plus efficace, mais l'effet est plafonné — une équipe de 5-10 personnes produit toujours un volume borné, même avec un outil parfait.
- **Levier de revenu** (rapport partenaire professionnel) : peut justifier un tarif plus élevé ou un renouvellement de contrat auprès d'un constructeur/sponsor — un effet qui n'est pas plafonné par la taille de l'équipe.

C'est cette distinction, pas juste « impact/difficulté », qui détermine ce qui suit.

### 🎯 L'idée retenue pour l'impact le plus fort — avec le raisonnement pessimiste explicite

**Le tracker de livrables partenaires + génération automatique de rapport de performance.**

Pourquoi celle-ci plutôt que la « boucle d'apprentissage » mise en avant par les deux documents reçus : parce qu'elle ne dépend pas d'un volume de données que Le Média Automobile n'a pas encore, et parce qu'elle agit directement sur le **prix** que le média peut facturer à un partenaire, pas seulement sur le temps que l'équipe économise.

Le raisonnement, en étant pessimiste sur chaque étape :
- On sait, par la présence d'un contact dédié aux partenariats (vérifié en §0) et par la couverture d'événements de marque (Porsche Experience Center, Automobile Awards), que le modèle économique du média passe au moins en partie par des accords B2B — ce n'est pas une supposition, c'est visible publiquement.
- Un média de 152K followers qui présente à un partenaire un rapport chiffré, comparé à une référence (pas juste « 50K vues » dans l'absolu, mais « 50K vues alors que la moyenne de vos contenus comparables fait 30K ») a un argument de négociation concret pour le renouvellement ou l'augmentation du tarif — sans ce rapport, la conversation repose sur une impression.
- **Ce que ça ne fait pas, pour rester honnête** : ça ne garantit aucun résultat commercial. Un rapport bien fait ne signe pas un contrat tout seul — ça donne un argument de plus à un patron qui négocie déjà ces contrats. L'ampleur réelle de l'effet (le fameux « +50% ») ne peut pas être promise avec certitude ; ce qui peut être affirmé, c'est que c'est le seul module de la liste dont l'effet a une chance d'agir sur le prix plutôt que seulement sur le temps — ce qui en fait le candidat le plus défendable, pas une garantie.

**Ce qu'il faut concrètement pour le construire, à coût zéro :**
1. Une liste de partenaires (nom, marque, période de campagne, livrables attendus) — simple table dans la même base que RADAR/STUDIO, saisie manuelle au départ (pas de synchronisation HubSpot en v1, voir §0 sur l'incertitude de l'accès à l'API Campagnes).
2. Un lien entre chaque publication (déjà trackée si le point suivant — §3.2 — est fait) et un partenaire, quand applicable.
3. Les statistiques Instagram par publication (via export CSV manuel dans un premier temps, exactement ce que le patron a demandé — pas besoin d'intégration API Instagram Graph pour la version 1).
4. Un calcul de moyenne mobile sur les publications comparables (même format, période récente) pour donner une base de comparaison — sans ce calcul, un chiffre brut ne veut rien dire pour un partenaire qui ne connaît pas vos moyennes habituelles.
5. Un export (PDF ou page imprimable) présentable tel quel à un partenaire.

### P0 — à construire en premier, dans cet ordre

**3.1 — Le tracker partenaires + rapport (détaillé ci-dessus).**

**3.2 — Rattacher chaque post STUDIO et chaque article RADAR à un identifiant commun.**
Nécessaire techniquement pour que 3.1 fonctionne (sans ça, impossible de savoir quel post correspond à quel sujet/partenaire). Coût faible : un seul champ d'identifiant partagé entre les deux bases, pas une refonte d'architecture — beaucoup plus léger que le « Content Object » proposé dans les deux documents, qui anticipe des formats (vidéo, podcast) non encore produits par l'outil.

**3.3 — Le module Stats, version honnête du besoin exprimé par le patron.**
Une zone de dépôt CSV (export Instagram natif), calcul automatique des ratios (engagement/reach, save rate), tri des publications par performance — exactement ce que le patron a demandé, sans la couche « apprentissage automatique qui réécrit RADAR » écartée en §1. Présente les tendances à l'équipe ; n'ajuste rien seul.

**3.4 — Explorateur Drive en lecture, dans le dashboard.**
Une page qui affiche les dossiers/fichiers du Drive déjà utilisé (API Drive, lecture seule), pour qu'aucun employé n'ait à ouvrir un nouvel onglet pour retrouver un visuel utilisé par STUDIO. Coût de développement faible (l'API Drive est déjà nécessaire pour l'export STUDIO, cette page en est un prolongement direct), valeur d'usage quotidien élevée.

**3.5 — Écran d'accueil « à faire aujourd'hui ».**
Une vue qui agrège ce qui existe déjà dans RADAR (`/events`, `/ready`) et STUDIO — pas une nouvelle source de données, juste une synthèse. C'est ce qui rend l'outil « intuitif » sans ajouter de complexité de fond : combien d'articles en attente de validation, combien de posts STUDIO à finaliser, combien de rapports partenaires à envoyer cette semaine.

### P1 — utile, mais après le noyau ci-dessus

- **Calendrier éditorial simple** (vue semaine de ce qui est prévu/publié) — utile, peu coûteux, mais pas urgent tant que le volume de contenu reste modeste.
- **Enrichissement de `/corrections`** (déjà existant dans RADAR) avec un compteur de récurrence des erreurs — cheap parce que la donnée est déjà capturée, juste pas encore agrégée.

### Explicitement écarté, avec la raison à chaque fois

| Module proposé | Pourquoi il n'entre pas dans cette version |
|---|---|
| Algorithme qui réécrit automatiquement le scoring de RADAR | Volume de données insuffisant pour un signal fiable (§1.A) + viole le principe « pas de boîte noire » déjà acté dans RADAR |
| Content Object unifié (podcast, vidéo, LinkedIn, Reels) | Anticipe des formats que l'outil ne produit pas encore ; le podcast a 1 épisode, pas un catalogue à automatiser (§0) |
| Portail partenaire séparé (site dédié pour les clients) | Le rapport exporté (3.1) couvre le besoin immédiat ; un portail complet est une deuxième application entière — à reconsidérer seulement si le rapport simple s'avère insuffisant à l'usage |
| CMS de site public dans le dashboard | Le site est un projet séparé (§2), ne pas le faire rentrer dans l'outil interne |
| Intégration HubSpot profonde (campagnes synchronisées en temps réel) | Accès à l'objet Campagnes non confirmé sur l'offre gratuite (§0) ; HubSpot gère déjà le CRM, pas besoin de le dupliquer — liste de partenaires en v1 suffit |
| Mode Événement / shot-list | Fonctionnalité confort, pas structurante ; peut être un simple champ texte libre dans le tracker partenaires si besoin, pas un module dédié |
| Tout pipeline vidéo (Remotion, capcut-cli, OpenMontage, etc.) | Déjà tranché dans le premier document de ce projet : hors périmètre tant que STUDIO/RADAR ne produisent que texte et image statique |
| Publication automatique Instagram (`instagram-ai-agent`) | Déjà écarté formellement dans le premier document (risque sur un compte à 152K abonnés) — confirmé indépendamment par le document 30 lui-même |

---

## 4. Ce que ça donne comme architecture finale

```
Dashboard (localhost:3000) — Le cœur, inchangé dans sa structure actuelle
├── /                    ← Accueil : "à faire aujourd'hui" (3.5)
├── /events, /events/[id] ← RADAR, existant
├── /ready               ← RADAR, existant
├── /corrections         ← RADAR, existant + compteur de récurrence (P1)
├── /stats               ← NOUVEAU : dépôt CSV, ratios, tendances (3.3)
├── /partenaires         ← NOUVEAU : tracker + génération de rapport (3.1)
├── /drive               ← NOUVEAU : explorateur en lecture (3.4)
└── /calendrier          ← P1, plus tard

STUDIO (localhost:3001) — inchangé, reste une app séparée
```

Aucun changement à la séparation dashboard/STUDIO déjà en place, aucune fusion forcée avec le site public (à construire séparément une fois le flux de contenu stable), et un seul nouveau concept structurant (l'identifiant partagé entre post/article/partenaire, §3.2) — pas une refonte.

---

## 5. Ce qui reste honnêtement incertain

- L'ampleur réelle de l'effet du tracker partenaires sur le chiffre d'affaires ne peut pas être quantifiée à l'avance — c'est le module qui a la meilleure logique business, pas une martingale garantie.
- L'accès réel à l'API HubSpot (quels objets, quelles limites) dépend du compte du patron — à vérifier avec ses identifiants avant de construire quoi que ce soit dessus, pas à supposer.
- Le rythme de publication réel de l'équipe (nécessaire pour juger si/quand le volume justifiera un jour une vraie détection de tendances statistiquement fiable) n'a pas été mesuré ici — si vous avez ces chiffres, ils permettraient d'affiner le seuil à partir duquel la section 1.A cesse de s'appliquer.
