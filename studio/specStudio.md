# PRESSE — Projet 3 : spécification utilisateur complète
**Analyse des 7 publications fournies + réponses aux 3 questions ouvertes**

---

## 1. Ce que révèle l'analyse de vos 7 publications

C'est la pièce qui manquait. Vos posts ne sont pas un style flou à « recréer » par une IA — ce sont **4 gabarits distincts, appliqués avec une discipline totale**. Chaque publication est une combinaison de :

- un nombre d'images en montage (1, 2 ou 3)
- une position de bulle fixe pour ce nombre
- un texte (titre OU paragraphe, jamais les deux sur la même image)
- un pied de page identique (logo centré + pastilles carrousel)

### 1.1 Les 4 familles identifiées

| Famille | Exemples | Structure |
|---|---|---|
| **A — Image pleine + titre** | Img 1 (Okuda), Img 3 (Disney+) | 1 image plein cadre, dégradé bas, titre 2-3 lignes en gras, logo dessous |
| **B — Image pleine + paragraphe** | Img 2, Img 4 (slides 2 des mêmes posts) | Même structure que A mais texte plus long, style légende/explication — **c'est le slide 2 du carrousel**, pas un template différent |
| **C — Image + 1 bulle** | Img 6 (Stig / Schumacher) | Image principale + 1 cercle incrusté en haut à droite, bordure blanche, léger chevauchement du bord |
| **D — Image + 2 bulles** | Img 5 (Tom Holland), Img 7 (EA/Battlefield) | Image principale + 2 cercles incrustés, positions et chevauchements différents selon les deux exemples |

**Le point capital :** dans la famille D, les deux occurrences (Img 5 et Img 7) **n'utilisent pas le même agencement**. Sur Img 5, les deux bulles sont côte à côte en haut à droite. Sur Img 7, elles sont empilées en diagonale, plus grandes, plus centrées. Même famille, deux variantes.

**C'est exactement la réponse à votre inquiétude sur la répétitivité** — voir §4.

### 1.2 Éléments constants (design tokens) — jamais négociables

Ce sont les invariants qui font qu'un post « ressemble au Média Automobile » quel que soit le gabarit :

- Dégradé noir en bas de l'image, hauteur proportionnelle à la longueur du texte
- Typographie : gras, blanc, sans-serif condensée, alignée à gauche
- Logo « Le Média Automobile » centré, toujours à la même distance du bas
- Pastilles de pagination carrousel, alignées sous le logo
- Bulles : cercle parfait, bordure blanche ~4-6 px, ombre portée légère
- Flèche de navigation carrousel en haut à droite (semi-transparente)

Ces éléments-là sont **codés en dur, jamais générés, jamais réinterprétés**. C'est ce qui garantit l'exigence n°1.

### 1.3 Verdict de faisabilité

**Oui, sans réserve, et voici pourquoi c'est même plus simple que prévu.**

Ce que vous m'avez montré n'est pas un style artistique à imiter — c'est un **système de composition géométrique** : rectangles pleins, dégradés linéaires, cercles avec bordure, texte positionné. Il n'y a pas une seule forme dans ces 7 images qu'un moteur de rendu HTML/CSS/Chromium ne produit pas au pixel près, à l'identique à chaque exécution.

La difficulté n'est **pas technique**, elle est **éditoriale** : produire les *bonnes images* et le *bon texte* à mettre dedans. C'est là que doit porter l'effort — pas sur la reproduction du gabarit lui-même.

---

## 2. Réponse à votre question sur les visuels manquants

Vous proposez trois pistes : rechercher, générer, ou améliorer un rendu flou avec de l'IA. Voici l'arbitrage, et il est directement éclairé par vos propres exemples.

### 2.1 Le constat qui tranche le débat

**Regardez ce que montrent vos 7 posts : des gens réels et identifiables (Hiroshi Okuda, Tom Holland, Michael Schumacher, Le Stig), des voitures réelles de marques précises (Toyota Prius, Porsche Taycan, Cadillac Escalade), des logos de marques déposées (Disney+, EA, Battlefield 6, BBC Top Gear).**

**Aucun de ces éléments n'est légitimement générable par IA :**
- Un visage généré ressemblant à Tom Holland ou Schumacher = usurpation d'image, droit à l'image, et potentiellement un cas d'usage « deepfake » au sens de l'AI Act (marquage obligatoire, voire interdiction selon le contexte).
- Un logo Disney+, EA ou BBC généré = reproduction de marque déposée, en plus d'un rendu visuellement toujours imparfait (lettrage déformé, proportions fausses — un modèle génératif est structurellement mauvais sur du texte et des logos exacts).
- Une Porsche Taycan « inventée » = le public passionné détecte l'écart immédiatement ; crédibilité du média entamée.

**Conclusion : dans votre cas précis, la génération d'image n'est pas juste déconseillée par prudence — elle est structurellement inadaptée à 90 % de votre contenu réel.** Ce n'est pas une position de principe, c'est un fait technique observable dans vos propres publications.

### 2.2 La hiérarchie recommandée — dans l'ordre

**Niveau 1 — Recherche dans des sources fiables et attribuables (par défaut, quasi toujours suffisant)**

- Salles de presse constructeur (photos officielles haute résolution, libres de droit pour la presse)
- Wikimedia Commons (portraits de personnalités publiques sous licence libre — très riche pour dirigeants, pilotes, historique automobile)
- Banques d'images libres de droit (Unsplash, Pexels, Pixabay) pour les visuels génériques (ambiance garage, route, ciel)
- Base d'images internes déjà utilisées par la rédaction (constituer une bibliothèque au fil du temps)

L'outil propose 3 à 5 candidats classés, avec la source et la licence affichées. **L'utilisateur choisit toujours** — exactement comme pour le titre, jamais d'auto-sélection silencieuse.

**Niveau 2 — Amélioration de qualité d'un visuel imparfait trouvé (oui, et c'est légitime)**

Vous avez raison : une recherche renvoie parfois une image floue, mal cadrée, ou en basse résolution. C'est un problème résolu par des outils **d'amélioration**, pas de génération — la nuance est importante :

| Outil | Fait | Ne fait pas |
|---|---|---|
| **Real-ESRGAN** (open source, local, gratuit) | Agrandit une image basse résolution en HD sans inventer de contenu | Ne change pas ce qui est représenté |
| **rembg / U²-Net** (open source, local, gratuit) | Détoure un sujet proprement pour l'insérer dans une bulle | — |
| **Redressement / recadrage intelligent** | Corrige un angle, recentre le sujet | — |

Ces outils *rehaussent* un visuel existant, ils n'*inventent* rien. Aucun risque de représentation erronée, aucune ambiguïté légale. **C'est la bonne réponse à votre remarque sur le rendu « HD ».**

**Niveau 3 — Génération IA (exception rare, strictement encadrée, jamais sur du réel identifiable)**

Réservée à des cas où le visuel est délibérément non-photoréaliste et non attribué à une personne ou marque précise : fond abstrait de garage, texture asphalte, dégradé de marque pour un slot vide. Toujours marqué comme généré en interne (métadonnée), jamais utilisé pour représenter un fait, une personne ou un produit réel.

**Niveau 4 — Aucun visuel trouvé : ne pas publier de force**

Si rien de niveau 1 ou 2 ne convient, l'outil le signale plutôt que de forcer une génération de niveau 3 hors périmètre. Un rédacteur tranche alors manuellement. C'est rare, et c'est plus sain qu'un visuel bancal en ligne.

---

## 3. Réponse à votre question sur le titre

Vous avez raison sur le fond : imposer une saisie manuelle systématique alourdit l'outil, mais l'automatiser à l'aveugle produit un titre générique. La solution n'est pas de choisir entre les deux, c'est de **faire correspondre le mode au contexte de production**, qui varie déjà naturellement selon d'où vient le post.

### 3.1 Les 3 modes, du zéro-effort au effort-minimal

**Mode 1 — Post issu de RADAR (le cas le plus fréquent, zéro tâche manuelle)**

Si le post part d'un événement détecté et qualifié par le projet 2, l'outil dispose déjà du brief factuel complet. Le titre est généré directement dedans, dans le style de la maison, calibré pour tenir dans la boîte. **Aucune saisie requise.** C'est le cas d'Okuda ou de Disney+/Formula E dans vos exemples : ce sont des actualités identifiables, RADAR les aurait détectées et qualifiées en amont.

**Mode 2 — Thème fourni sans lien vers un article (léger, ~10 secondes)**

L'utilisateur tape 2-3 mots-clés (« Tom Holland collection voitures », « Stig identité Schumacher »). L'outil produit le titre dans le style maison à partir de ce thème, sans base factuelle détaillée — adapté aux posts de curiosité/lifestyle qui ne sont pas rattachés à une actualité datée, comme votre exemple Spider-Man ou Top Gear.

**Mode 3 — Titre manuel (rédacteur qui sait exactement ce qu'il veut)**

Champ de saisie libre. L'outil vérifie juste que ça tient dans la boîte et propose un ajustement de longueur si besoin, sans réécrire le fond.

### 3.2 Le principe qui rend le compromis honnête

Dans tous les modes, l'outil ne propose **jamais un seul résultat imposé** : il affiche **3 variantes calibrées en longueur**, éditables en un clic. Le rédacteur choisit ou corrige — il ne part jamais d'une page blanche, et il n'est jamais coincé avec un texte imposé.

### 3.3 Ce qu'il faut retenir sur la charge de travail réelle

| Origine du post | Tâche manuelle sur le titre |
|---|---|
| Actu détectée par RADAR | **Aucune** |
| Sujet libre, pas d'actu liée | 2-3 mots-clés (~10 s) |
| Rédacteur a déjà une idée précise | Il tape directement (comme aujourd'hui, mais avec calibrage automatique) |

Vous n'ajoutez donc pas une tâche manuelle systématique — vous remplacez la rédaction complète du titre (aujourd'hui : 100 % manuelle) par soit zéro saisie, soit une saisie de quelques mots. Dans le pire cas (mode 3), vous êtes strictement au niveau d'effort actuel, avec en prime le calibrage automatique de longueur que personne ne fait à la main aujourd'hui.

---

## 4. Taxonomie des gabarits — répondre à la répétitivité

Vous avez identifié le vrai risque : un outil qui produit toujours *le même* montage à 2 images finirait par se voir dans le feed, même s'il respecte parfaitement la charte. La solution n'est pas un gabarit par nombre d'images, mais **une famille de variantes par nombre d'images**, partageant les mêmes tokens (couleurs, police, logo) mais avec des agencements différents.

### 4.1 Famille 1 image

| Variante | Usage | Différence |
|---|---|---|
| **1A — Titre** | Annonce, actu principale | Dégradé bas + titre gras 2-3 lignes (votre Img 1, Img 3) |
| **1B — Paragraphe** | Slide 2+ d'un carrousel, contexte/explication | Même structure, texte plus long, moins gras (votre Img 2, Img 4) |
| **1C — Badge overlay** | Annonce de partenariat/marque | Ajoute un badge circulaire en haut (votre Img 3 — le logo Disney+) |

### 4.2 Famille 2 images (1 principale + 1 bulle)

| Variante | Position bulle | Usage suggéré |
|---|---|---|
| **2A** | Haut-droite, chevauchement léger du bord | Votre Img 6 (Stig + Schumacher) |
| **2B** | Haut-gauche | Alternance pour éviter la monotonie |
| **2C** | Centrée en haut, plus grande, sans chevauchement | Quand le sujet de la bulle est aussi important que l'image principale |

### 4.3 Famille 3 images (1 principale + 2 bulles)

| Variante | Agencement des bulles | Usage suggéré |
|---|---|---|
| **3A** | Côte à côte, légèrement décalées, coin haut-droit | Votre Img 5 (Tom Holland) |
| **3B** | Empilées en diagonale, plus grandes, plus centrées | Votre Img 7 (EA/Battlefield) |
| **3C** | Une en haut-gauche, une en haut-droite, symétriques | Quand les deux bulles ont un poids égal, pas de hiérarchie |

### 4.4 Comment l'outil choisit la variante — pas au hasard, mais pas figé non plus

Trois logiques combinées, dans cet ordre de priorité :

1. **Le fit visuel d'abord.** Si les deux images à mettre en bulle ont des formats très différents (une verticale, une carrée), l'outil privilégie la variante qui les accueille le mieux plutôt que de forcer un recadrage moche.
2. **La rotation ensuite.** Parmi les variantes compatibles, l'outil évite de reproduire l'agencement utilisé sur les 3-4 derniers posts de la même famille — mémoire courte, pas de règle rigide.
3. **Le choix humain toujours en dernier mot.** L'interface affiche 2-3 agencements possibles côte à côte ; le rédacteur clique celui qu'il préfère, ou laisse l'outil trancher.

C'est le même principe que pour le titre : l'automatisation propose, l'humain confirme. Zéro décision irréversible prise seule par la machine.

---

## 5. Description complète — parcours utilisateur

Voici le déroulé, écran par écran, du point de vue de la personne qui l'utilise au quotidien.

### Étape 1 — Origine du post
Deux entrées possibles :
- **Depuis RADAR** : l'utilisateur clique sur un événement détecté dans la liste de veille. Contexte, sources et éléments factuels sont déjà chargés.
- **Depuis zéro** : l'utilisateur choisit « nouveau post » et tape un thème en quelques mots.

### Étape 2 — Dépôt des images
Glisser-déposer 1, 2 ou 3 images. L'outil détecte automatiquement le nombre de slots à remplir et propose une pré-attribution (quelle image comme fond, laquelle comme bulle 1, laquelle comme bulle 2) — l'utilisateur confirme d'un clic ou réajuste.

**Si une image manque** : bouton « Trouver un visuel ». L'outil lance la recherche décrite en §2, affiche 3-5 candidats sourcés, l'utilisateur en choisit un (ou lance l'amélioration HD si le meilleur candidat est flou).

### Étape 3 — Choix du gabarit
En fonction du nombre d'images retenues, l'outil affiche 2-3 variantes possibles (voir §4) en aperçu miniature instantané. Un clic sélectionne.

### Étape 4 — Titre / texte
Selon le mode (§3) : le titre est déjà rempli (venant de RADAR), ou l'utilisateur voit 3 propositions à choisir/éditer, ou il tape directement.

### Étape 5 — Aperçu et ajustements
Rendu HTML instantané (pas d'attente). L'utilisateur peut :
- Glisser une bulle pour l'agrandir/déplacer légèrement dans les limites autorisées par le gabarit
- Changer de variante en un clic sans tout recommencer
- Régénérer le titre
- Permuter les images entre les slots

### Étape 6 — Validation et rendu final
Un clic déclenche le rendu haute fidélité (Chromium, quelques secondes), en tâche de fond — l'utilisateur n'attend pas devant l'écran.

### Étape 7 — Export
Fichier PNG haute résolution + légende + hashtags proposés, déposés automatiquement dans le dossier Drive daté de l'équipe. Publication manuelle sur Instagram, comme convenu (voir document précédent, §2.5).

---

## 6. Personnalisation — répondre à « les templates doivent pouvoir être adaptés »

Trois niveaux d'édition, du plus simple au plus avancé, tous garde-fous inclus pour ne jamais casser la charte graphique :

### 6.1 Ajustement dans les limites du gabarit (usage quotidien, tout le monde)
Glisser une bulle, l'agrandir, changer sa position — mais **dans des bornes définies par le gabarit** (une bulle ne peut pas sortir de la zone sûre, ne peut pas recouvrir le logo). C'est un curseur contraint, pas une liberté totale : ça évite qu'un post généré un vendredi soir dérape visuellement.

### 6.2 Instruction en langage naturel (usage occasionnel)
Un champ texte du type « déplace le titre plus haut », « agrandis la bulle 2 », « passe le dégradé plus sombre ». L'instruction est traduite en un **ajustement des paramètres du gabarit**, pas en une réécriture libre du code — le système ne modifie que les propriétés explicitement autorisées (position, taille, opacité dans une plage définie), jamais la structure elle-même. Ça donne la flexibilité demandée sans ouvrir la porte à un post qui ressemble à autre chose que Le Média Automobile.

### 6.3 Création d'un nouveau gabarit (rare, réservé au graphiste)
Ajouter une 5ᵉ famille ou une nouvelle variante se fait dans un mode dédié, avec aperçu en direct pendant l'édition. Chaque nouveau gabarit est versionné et passe par une validation avant d'être disponible aux autres membres de l'équipe — même logique de porte de qualité que pour les articles de RADAR.

---

## 7. Coûts et intégration en entreprise — confirmation

Rien dans cette analyse ne change le calcul du document précédent :

| Élément | Statut |
|---|---|
| Rendu des gabarits (Chromium/Playwright) | Gratuit, sans limite |
| Détourage (rembg) | Gratuit, local |
| Amélioration HD (Real-ESRGAN) | Gratuit, local |
| Recherche de visuels sourcés | Gratuit (APIs de banques d'images + Wikimedia) |
| Génération de titre (mode 1 et 2) | Coût marginal LLM, déjà budgété dans le projet 2 |
| Stockage / export | Google Drive, déjà couvert |

**Aucun coût supplémentaire introduit par cette spécification.** La complexité ajoutée (recherche de visuels, amélioration HD, variantes de gabarits, édition en langage naturel) est de la complexité **logicielle**, pas de la dépense récurrente.

**Intégration comme outil interne :** hébergé sur la même infrastructure que RADAR (Cloudflare, accès restreint au domaine de l'entreprise), avec les mêmes comptes que les 5-10 personnes de l'équipe. Les gabarits sont stockés comme des fichiers versionnés (comme du code), modifiables sans redéploiement complet — ce qui répond directement à « les templates doivent pouvoir être adaptés » : ils le sont, à froid, sans toucher au reste de l'outil.

---

## 8. Ce qui garantit la qualité et évite le déchet — récapitulatif

| Garde-fou | Empêche |
|---|---|
| Gabarit figé, jamais réinterprété par l'IA | Dérive visuelle post après post |
| Recherche/amélioration avant génération, génération jamais sur du réel | Visuel faux ou usurpation d'image |
| 3 variantes de titre proposées, jamais imposées | Titre générique publié sans relecture |
| Rotation des agencements de bulles | Monotonie visuelle dans le feed |
| Validation humaine à chaque étape clé | Publication d'un post non vérifié |
| Édition contrainte (curseurs bornés, instructions traduites en paramètres) | Un post qui sort de la charte graphique |
| Rendu final en Chromium (fidélité totale), aperçu HTML instantané pour l'itération | Attente qui pousse à valider sans regarder |

Le principe transversal, dans les trois documents produits jusqu'ici, reste le même : **l'automatisation prépare, l'humain décide** — jamais l'inverse.
