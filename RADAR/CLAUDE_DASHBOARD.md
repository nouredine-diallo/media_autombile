# CLAUDE_DASHBOARD.md
## Constitution du Dashboard LMA — Référence unique pour le développeur

---

## 0. Ce document est

La **référence ultime** pour tout travail sur le Dashboard. En cas de conflit avec un autre document, ce fichier l'emporte. En cas de doute sur une décision UX/design/fonctionnelle, **on se réfère aux personas utilisateurs §1** et à leurs besoins réels, pas à des hypothèses.

---

## 1. Les personas — source de toute décision

Le Dashboard est conçu pour **5 à 10 personnes qui se connaissent**, pas pour un public anonyme. Toute décision d'interface, de parcours ou de fonctionnalité doit répondre à la question : **est-ce que ça aide ce persona dans sa journée de travail ?**

### Le Rédacteur (auteur de contenu)
- **Besoin principal** : savoir quoi écrire aujourd'hui, écrire vite, publier sans friction
- **Exigence** : pas de ressaisie inutile, pas de navigation à 3 niveaux pour faire une action simple
- **Usage type** : ouvre le dashboard le matin, regarde la veille RADAR, valide/génère un article, STUDIO s'ouvre avec visuel pré-rempli, c'est fait
- **Frustration à éviter** : perdre du temps à chercher où cliquer, devoir chercher des images manuellement, avoir à ouvrir 4 onglets pour une tâche qui devrait être en 2 clics

### Le Rédacteur en chef (validateur)
- **Besoin principal** : voir ce qui est en attente de validation, contrôler la qualité
- **Exigence** : vue d'ensemble claire, accès rapide aux éléments urgents
- **Usage type** : ouvre le dashboard, vérifie les articles en attente, valide ou demande des corrections
- **Frustration à éviter** : ne pas savoir ce qui est urgent, devoir fouiller dans les listes

### Le Responsable partenaires (business)
- **Besoin principal** : suivre les livrables, générer des rapports, prouver la valeur au partenaire
- **Exigence** : données fiables (jamais inventées), export professionnel
- **Usage type** : crée un partenaire, rattache des posts, génère un rapport PDF, l'envoie
- **Frustration à éviter** : devoir composer un rapport manuellement à partir de chiffres épars

### Le Direction (décideur)
- **Besoin principal** : comprendre l'état du média en 30 secondes
- **Exigence** : simplicité extrême, pas de jargon technique
- **Usage type** : ouvre le dashboard, regarde les stats, consulte les rapports partenaires
- **Frustration à éviter** : trop d'informations, pas assez de synthèse

---

## 2. Architecture finale

```
Dashboard (localhost:3000) — Le cœur
├── /                      ← Accueil : "à faire aujourd'hui" + statut pipeline
├── /events                ← RADAR : veille (avec visuels sources)
├── /events/[id]           ← RADAR : détail (sources → brief → article → validation → visuels)
├── /ready                 ← Articles validés → ouverture STUDIO (avec images)
├── /corrections           ← Suivi des corrections
├── /stats                 ← Dépôt CSV Instagram, ratios, tendances
├── /partenaires           ← Tracker livrables + génération rapport PDF
├── /drive                 ← Explorateur Drive (avec prévisualisation images)
├── /calendrier            ← Vue semaine avec drag-and-drop
└── Pipeline auto          ← Cron toutes les 4h : ingest → visuels → clustering

STUDIO (localhost:3001) — App séparée, travail indépendant
```

### Pipeline automatique (cron)
```
Toutes les 4h (configurable) :
  1. Ingestion RSS → extraction images (enclosure, media:content)
  2. Visual search → scraping og:image via Playwright pour items sans image
  3. Embeddings locaux (multilingual-e5-small)
  4. Clustering → détection d'événements
  5. Scoring composite (densité, vélocité, fraîcheur, marque)
  6. Auto-tagging (16 règles regex)
```

### Flux RADAR → STUDIO (avec images)
```
RADAR détecte événement
  → RSS fournit image (enclosure/media:content) OU visual search scrappe og:image
  → Image stockée dans items.image_url + items.image_source
  → Rédacteur valide article → bouton "Créer un post"
  → buildStudioLink() envoie {title, source, imageUrl, contentId, briefHeadline}
  → STUDIO s'ouvre avec image pré-remplie
  → Éditeur choisit gabarit → export
```

### C3 : Confiance dans les visuels auto-trouvés
```
Rédacteur voit une vignette dans Sources
  → Survol : bouton rouge "✗ Inadapté" apparaît sur la vignette
  → Clic : POST /api/visual-search/reject { item_id, rejected_url }
    → Étape 1 : image_rejected=1, image_url effacée
    → Étape 2 : re-scraping de l'article avec l'URL rejetée en blacklist
    → Si alternatif trouvé → image remplacée automatiquement, toast vert
    → Si aucun alternatif → image effacée, toast jaune + lien "Chercher dans l'article"
  → scoring amélioré : keyword matching titre→alt+URL, blacklist stock photos
  → getItemsWithoutImages exclut les rejetés (pas de re-scraping inutile)
  → getBestImageForEvent exclut les rejetés
  → Objectif : empêcher le "double travail" silencieux (outil + Google Images en parallèle)
```

### Règles d'architecture
- **RADAR et STUDIO restent dans leurs dossiers respectifs** — on ne fusionne jamais les codebases
- **Le Dashboard lit, ne modifie jamais** les données de STUDIO/RADAR sans action explicite
- **L'identifiant de contenu partagé** relie les événements RADAR, posts STUDIO et partenaires sans ressaisie
- **Zéro LLM dans le Dashboard** — tout chiffre est calculé en code, jamais généré librement
- **Les images suivent la hiérarchie** : RSS (gratuit) → og:image scraping (gratuit) → recherche manuelle (coût marginal)

---

## 3. Parcours utilisateur final

### Parcours 1 : La journée type du Rédacteur
```
1. Ouvre localhost:3000
2. Voit l'accueil "à faire aujourd'hui" + statut pipeline (vert/orange/rouge)
3. Items urgents en haut, événements avec visuels
4. Clique sur un événement RADAR → brief généré → article rédigé
   → Colonne Sources affiche les images des articles RSS
   → Visual search a trouvé og:image si RSS n'en avait pas
5. Valide l'article → bouton "Créer un post Instagram" → STUDIO s'ouvre AVEC l'image
6. Dans STUDIO : image déjà chargée, titre pré-rempli → gabarit → export
7. Terminé. Retour au dashboard.
```

### Parcours 2 : Le reporting partenaire (Responsable partenaires)
```
1. Ouvre /partenaires → liste des partenaires actifs
2. Clique sur un partenaire → voit les posts rattachés
3. Clique "Générer le rapport" → PDF créé avec Playwright
4. Télécharge le PDF → envoie au partenaire
```

### Parcours 3 : L'analyse des performances (Direction)
```
1. Ouvre /stats → dépose le CSV Instagram
2. Voit les ratios calculés automatiquement
3. Consulte les tendances descriptives (phrases basées sur les chiffres calculés)
4. Prend une décision éclairée
```

### Parcours 4 : La recherche d'un visuel (tout le monde)
```
Méthode automatique (prioritaire) :
1. Le pipeline cron trouve les images via RSS enclosure + og:image scraping
2. Les images apparaissent dans /events/[id] colonne Sources
3. La meilleure image est passée automatiquement à STUDIO

Méthode manuelle (fallback) :
1. Ouvre /drive → navigue par dossier ou cherche par nom
2. Les fichiers image affichent une prévisualisation thumbnail
3. Clique sur un fichier → ouvre en plein écran
```

### Parcours 5 : Le pipeline automatique (sans intervention humaine)
```
1. Le cron s'exécute toutes les 4h (configurable via API)
2. Ingeste les flux RSS + trouve les images
3. Le dashboard affiche les nouveaux événements avec visuels
4. Le Rédacteur n'a rien à faire — le pipeline tourne en arrière-plan
5. Le statut du pipeline est visible sur l'accueil (dernière exécution, nb items, nb visuels)
6. Bouton "Lancer maintenant" pour déclencher manuellement
```

---

## 4. Principes UX non négociables

### 4.1 La hiérarchie d'information
- **Un seul accent visuel par écran** — pas 5 couleurs qui se battent
- **Un titre, une action principale, des actions secondaires**
- **L'urgent en haut, le reste en dessous**

### 4.2 Les 3 états systématiques
Chaque page qui affiche des données doit avoir :
- **Chargement** : squelette gris qui épouse la forme du contenu (pas une roue qui tourne)
- **Vide** : message qui explique quoi faire (pas juste "aucune donnée")
- **Erreur** : message clair, jamais un écran blanc

### 4.3 Le moins d'action manuelle
- Avant d'ajouter un champ de saisie, vérifier si la donnée existe déjà
- L'identifiant de contenu partagé élimine la ressaisie
- Les calculs sont automatiques, pas manuels
- **Les images sont trouvées automatiquement** — le rédacteur ne cherche jamais un visuel

### 4.4 Mobile-first
- L'accueil et les listes doivent rester lisibles sur téléphone
- Pas besoin d'app mobile séparée, juste une mise en page adaptative

### 4.5 Esthétique — le système de design fait foi

Les règles ci-dessous ne sont pas des préférences : elles sont écrites dans
`src/app/globals.css` sous forme de jetons, et toute page les consomme au lieu
d'inventer ses propres valeurs. **Aucun hexadécimal en dur dans un composant.**

**Fondations**
- Police neutre et lisible (Geist) ; échelle typographique fixe (`.t-display`, `.t-title`, `.t-body`, `.t-label`, `.t-caption`, `.t-eyebrow`) — on ne choisit plus une taille au cas par cas.
- Chiffres en monospace tabulaire (`.font-data`) pour que les colonnes s'alignent.
- **Pas la charte des posts Instagram** (Roboto 900, dégradés noirs) — c'est un outil de travail, pas un post.
- Moderne, épuré, professionnel — plaisir à utiliser plusieurs heures par jour.

**Couleur — un seul accent, celui de la marque**
- L'accent est le **rouge brique de la marque, `#8B1D1D`**, mesuré sur le logo réel (moyenne RGB 139/29/29). Ce n'est pas un rouge vif « alerte » : c'est une couleur profonde et désaturée.
- Deux paliers, parce qu'une seule valeur ne peut pas tout faire (contrastes **mesurés**, pas estimés) :
  - `--brand` `#8B1D1D` en **aplat** (boutons principaux) — blanc dessus = **9,17:1** ;
  - `--accent` `#DA675E` en **encre** (liens, icônes, onglet actif) — la marque brute tomberait à **2,09:1** sur fond sombre, donc illisible ; le palier éclairci de la même teinte (OKLCH L 0,65 · h 26°) remonte à **5,05:1**.
- **Les états s'écartent du rouge en teinte**, pour ne jamais être confondus avec l'identité :
  | Rôle | Jeton | Couleur | Usage |
  |---|---|---|---|
  | Identité / interaction | `--brand` / `--accent` | rouge brique | nav active, bouton principal, liens, focus |
  | Urgent | `--warn` | ambre `#FBBF24` | articles en retard, urgence forcée |
  | En cours | `--info` | bleu `#60A5FA` | production, avancement |
  | Prêt / validé | `--success` | vert `#4ADE80` | article validé |
  | Erreur | `--danger` | rouge vif `#FF6E65` | échec, rejet, mode dégradé — rare, toujours avec icône **et** libellé |
  | STUDIO | `--studio` | violet `#A78BFA` | uniquement l'application externe |

**Verre dépoli (glassmorphism) — règle de zone, pas d'interdiction**
- Autorisé **uniquement sur le chrome** : barre latérale, en-tête de page, toasts, modales (classe `.chrome-glass`).
- **Interdit sur le contenu dense** : listes d'événements, tableaux, colonnes Sources / Brief / Articles / Revue. Le flou fait chuter le contraste — c'est un problème d'accessibilité WCAG, pas une question de goût. Ces surfaces sont **opaques**.

**Icônes — zéro emoji dans l'interface**
- Jeu unique **lucide-react** (licence ISC, zéro dépendance transitive), centralisé dans `src/components/icons.ts`.
- Un emoji est un bitmap : il change d'aspect selon le système (Noto sur Linux, Apple Color Emoji sur macOS) et **pixellise dès qu'on l'agrandit** — c'était la cause des « pixels qui ne font pas haute définition ».
- Tailles 11–20 px, épaisseur de trait 1,75–2, couleur héritée du texte.

**Netteté des images**
- Toute vignette bitmap est servie à au moins 2× sa taille d'affichage (`sizes`, `width`/`height` explicites) pour les écrans Retina.
- En cas d'échec de chargement : repli sur une icône vectorielle, jamais une injection d'`innerHTML`, jamais un emoji.

**Retenue**
- Pas de lueur néon : la hiérarchie passe par l'élévation (`--shadow-*`), le contraste et l'espace.
- Pas de dégradé décoratif.
- Un seul repère d'état actif : un filet de 2 px, pas un halo.
- `prefers-reduced-motion` est respecté globalement.

### 4.6 Signature du moteur

L'interface porte **deux identités distinctes**, jamais mélangées :
- la marque cliente **Le Média Automobile**, visible partout ;
- le moteur technique **LAN_D Core Engine**, mentionné une seule fois par page, en pied de page (10 px, encre effacée, sans lien) et sur `/login`.

Une signature discrète est également émise en console (F12), une fois par chargement.
Source unique de ces valeurs : `src/lib/engine.ts`. La signature ne doit jamais
gêner le travail : si elle devient visible au point d'être remarquée pendant
l'usage, c'est qu'elle est trop appuyée.

---

## 5. Modules — état final

| Module | Priorité | Statut | Description |
|---|---|---|---|
| Accueil "à faire" | P0 | **En ligne** | Agrège urgent/production/prêt/existant + statut pipeline |
| RADAR (/events) | P0 | **En ligne** | Veille, briefs, articles, **avec visuels sources** |
| STUDIO (localhost:3001) | P0 | **En ligne** | Création de visuels, **réceptionne images de RADAR** |
| Corrections | P0 | **En ligne** | Suivi des corrections |
| Prêts à publier (/ready) | P0 | **En ligne** | Articles validés → STUDIO **avec images** |
| Stats (/stats) | P0 | **En ligne** | Dépôt CSV, ratios, tendances |
| Partenaires (/partenaires) | P0 | **En ligne** | Tracker + rapport PDF |
| Drive (/drive) | P0 | **En ligne** | Explorateur **avec prévisualisation images** |
| Calendrier (/calendrier) | P1 | **En ligne** | Vue semaine avec drag-and-drop |
| Auth 3 niveaux | P0 | **En ligne** | Mot de passe + nom + passphrase |
| **Pipeline automatique** | P0 | **En ligne** | Cron toutes les 4h : ingest → visuels → clustering |
| **Recherche de visuels** | P0 | **En ligne** | RSS enclosure + og:image scraping + scoring |
| **Indicateur pipeline** | P1 | **En ligne** | Statut temps réel sur l'accueil |

---

## 6. UI/UX — État d'avancement

### Phase 1 : Dark Mode "Cockpit High-Tech" ✅
- Thème sombre forcé (#0B1120 fond, #F8FAFC texte)
- Couleurs néon fonctionnelles (rouge, vert, bleu, violet)
- Effets glow sur les éléments urgents
- Police monospace pour les données chiffrées
- Toutes les pages converties au dark mode

### Phase 2 : Progressive Disclosure ✅
- **Sidebar rétractable** : Icônes seules par défaut, expansion au survol
- **Focus Mode** : Mode simplifié pour la page d'événement
- Navigation par colonnes avec raccourcis 1-4

### Phase 3 : Navigation au clavier ✅
- **Raccourcis globaux** : V, R, C, S, P, K pour naviguer
- **Sidebar** : `[` pour rétracter/étendre
- **Focus Mode** : `F` pour activer, `Escape` pour quitter
- **Composant KeyboardHint** : Aide contextuelle

### Phase 4 : Additions ✅
- **Toast** : Notifications non-bloquantes
- **LoadingButton** : Bouton avec état de chargement
- **ScrollToTop** : Retour en haut automatique

### Phase 5 : Pipeline & Visuels ✅
- **Pipeline automatique** : cron toutes les 4h (node-cron), exécute ingest → visual search → clustering
- **Extraction images RSS** : enclosure, media:content, media:thumbnail, <img> dans le HTML
- **Visual search Playwright** : scrape og:image, twitter:image, srcset, <img> de la page
- **Scoring de pertinence** : résolution, ratio 4:5, source (og:image > twitter > page > rss)
- **Images dans /events/[id]** : thumbnail dans la colonne Sources + badge source
- **Images dans /ready** : thumbnail + indicateur "Visuel trouvé" + bouton adapté
- **Images dans l'accueil** : thumbnails dans la section "Prêt à publier"
- **Prévisualisation Drive** : thumbnails pour les fichiers image au lieu d'icônes emoji
- **BuildStudioLink()** : module `studio-prefill.ts` enfin utilisé par toutes les pages (avant = dead code)
- **Indicateur pipeline** : composant sur l'accueil, vert/orange/rouge, nb items/visuels, bouton "Lancer maintenant"
- **pipeline_runs** : tracking de chaque exécution (items, events, images, status, erreurs)
- **pipeline_config** : intervalle configurable en DB, modifiable via API

### Phase 6 : Système de design & identité de marque ✅
*(2026-08-21)*

- **Jetons de design** (`globals.css`) : surfaces, bordures en filet, encres à contraste vérifié, rayons, élévations, durées. Plus aucun hexadécimal en dur dans les composants.
- **Accent = couleur de marque** `#8B1D1D` en aplat + palier encre `#DA675E` pour la lisibilité sur fond sombre (contrastes mesurés : 9,17:1 et 5,05:1).
- **États déplacés hors du rouge** : urgent → ambre, en cours → bleu, prêt → vert, erreur → rouge vif (rare, icône + libellé).
- **Zéro emoji** : remplacés par `lucide-react` (ISC) via `src/components/icons.ts` — cause racine des « pixels pas nets » (les emoji sont des bitmaps).
- **Verre dépoli cantonné au chrome** (`.chrome-glass`) : barre latérale, en-têtes, toasts. Interdit sur les listes et les colonnes de travail.
- **Primitives partagées** (`src/components/ui/`) : `Card`, `SectionHeader`, `Badge`, `Button`, `StatTile`, `EmptyState`, `SkeletonRows`, `Thumb`.
- **En-tête de page unique** (`PageHeader`) : la navigation vit dans la barre latérale, l'en-tête ne la duplique plus.
- **Barre latérale** repensée : icônes vectorielles, groupes, raccourcis affichés, repère d'état actif en filet ; masquée sur les écrans publics (`/login`, `/select-name`).
- **Graphiques** : palette catégorielle validée par script (bande de clarté, chroma, séparation daltonienne ΔE 8,4, contraste ≥ 3:1) dans `src/components/charts/theme.ts`.
- **Netteté** : vignettes servies en 2×, repli sur icône vectorielle, indicateur de développement Next.js désactivé.
- **Signature moteur** : pied de page « Powered by LAN_D Core Engine — v1.0.0 » + une ligne en console (voir §4.6).

---

## 7. Raccourcis clavier

| Touche | Action | Contexte |
|--------|--------|----------|
| `V` | Aller à la veille | Global |
| `R` | Aller aux prêts | Global |
| `C` | Aller aux corrections | Global |
| `S` | Aller aux stats | Global |
| `P` | Aller aux partenaires | Global |
| `K` | Aller au calendrier | Global |
| `[` | Rétracter/étendre la sidebar | Global |
| `F` | Activer le mode focus | Events/[id] |
| `Escape` | Quitter le mode focus | Events/[id] |
| `1-4` | Sélectionner une colonne | Mode focus |
| `Ctrl+Enter` | Valider | Mode focus |
| `?` | Afficher les raccourcis | Global |

---

## 8. Fichiers clés du pipeline visuel

| Fichier | Rôle |
|---|---|
| `src/lib/visualSearch.ts` | Scraping Playwright + scoring amélioré (keywords+blacklist) + re-search avec blacklist |
| `src/lib/rss.ts` | Extraction RSS enrichie (enclosure, media:content, og:image fallback) |
| `src/lib/studio-prefill.ts` | Encodage/décodage URL STUDIO avec image |
| `src/lib/cron.ts` | Runner cron (node-cron) + config + tracking runs |
| `src/lib/db.ts` | Schema items.image_url, pipeline_runs, pipeline_config |
| `src/app/api/visual-search/route.ts` | API POST pour lancer la recherche manuellement |
| `src/app/api/cron/route.ts` | API GET status + POST trigger/update config |
| `src/app/api/drive/file/route.ts` | Sert les fichiers image du drive-sync |
| `src/components/PipelineStatus.tsx` | Indicateur dashboard du pipeline |

---

## 9. API endpoints du pipeline

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/ingest` | POST | Ingestion RSS + visual search automatique |
| `/api/process` | POST | Embeddings + clustering + scoring |
| `/api/visual-search` | POST | Recherche d'images pour items sans image |
| `/api/visual-search/reject` | POST | Rejet visuel + re-scraping alternatif en un clic |
| `/api/events` | PATCH | Rejet de visuel auto-trouvé (`action: 'reject_image'`) |
| `/api/cron` | GET | Status du cron + dernières exécutions |
| `/api/cron` | POST | Trigger manuel (`action: 'run'`) ou update config (`action: 'update_config'`) |
| `/api/drive/file` | GET | Sert un fichier image du drive-sync (sécurisé) |

---

## 10. Ce qui est explicitement écarté

| Module proposé | Pourquoi |
|---|---|
| Algorithme qui réécrit RADAR | Volume insuffisant + boîte noire |
| Content Object unifié | Anticipe des formats qui n'existent pas |
| Portail partenaire dédié | Le rapport PDF couvre le besoin |
| CMS de site public | Projet séparé |
| HubSpot intégré | Accès API non confirmé |
| Pipeline vidéo | Hors périmètre |
| Publication auto Instagram | Risque sur compte 152K |
| API de recherche d'images payante | Coût >5€/1000 requêtes, hierarchy RSS+og:image suffisante |
| Notification temps réel entre utilisateurs | Lock collaboratif suffit à 10 personnes |
| CRM maison | HubSpot gère déjà ça |
| Scheduler multi-plateforme | Hors périmètre, "l'humain décide" |

---

## 11. En cas de doute

**Se référer aux personas §1.** Si une décision n'est pas couverte par ce document, demander : est-ce que ça aide le Rédacteur, le Rédacteur en chef, le Responsable partenaires, ou la Direction dans leur travail concret ? Si la réponse est oui, c'est une bonne direction. Si la réponse est "peut-être" ou "ça anticipe un besoin futur", c'est P1 ou écarté.

**L'interface doit être moderne et esthétiquement plaisante sans faire trop.** Moins, c'est plus. Un dashboard n'est pas un post Instagram — il doit être agréable à regarder, pas impressionnant.

**Le pipeline tourne sans surveillance.** Le cron ingère et trouve les images toutes les 4h. Le rédacteur n'a rien à faire sauf rédiger et valider.
