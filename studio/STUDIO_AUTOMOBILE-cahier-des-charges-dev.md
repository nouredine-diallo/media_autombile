# STUDIO_AUTOMOBILE
## Cahier des charges développeur — v1.0
**Développement autonome, sans dépendance à RADAR (projet 2, non développé)**

---

## 0. Lecture rapide — les décisions structurantes

| Question | Décision | Raison courte |
|---|---|---|
| Web app ou logiciel ? | **App web**, hébergée en interne | Zéro install poste par poste, mises à jour centralisées, accessible sur tout OS |
| Cloner un repo GitHub ? | **Non.** Construire léger sur 4-5 bibliothèques ciblées | Aucun dépôt existant ne fait ce que fait STUDIO_AUTOMOBILE (voir doc précédent, §2) ; cloner un gros framework importe sa dette technique et parfois sa licence |
| Sera-t-il lent ? | **Non**, si l'architecture sépare aperçu (instantané) et rendu final (quelques secondes, en fond) | Une image statique n'a rien à voir avec un rendu vidéo — détail en §5 |
| Accès de l'équipe | Compte Google restreint au domaine de l'entreprise, ou VPN maillé gratuit | Zéro coût, zéro gestion de mots de passe |
| Coût d'hébergement | **0 €**, deux options viables détaillées en §4.4 | À choisir selon si vous avez une machine dédiée disponible |

---

## 1. Objectif

Construire un outil interne qui transforme **1, 2 ou 3 images + un texte** en un **post statique prêt à publier**, visuellement indiscernable d'un post monté à la main aujourd'hui, en moins d'une minute de travail humain — contre 15 à 20 minutes actuellement.

**Contrainte de conception permanente :** l'outil ne doit jamais publier ni décider seul. Il prépare, l'humain valide. C'est ce qui garantit que la qualité ne baisse jamais, même à pleine vitesse.

**Contrainte de développement :** RADAR n'existe pas encore. STUDIO_AUTOMOBILE doit donc être **100 % autonome** — capable de fonctionner sans jamais recevoir d'événement de veille — tout en étant conçu pour se brancher dessus plus tard **sans réécriture**. Ce point est traité en détail au §7.6.

---

## 2. Description détaillée

STUDIO_AUTOMOBILE repose sur un principe unique : **le gabarit est un composant, jamais une génération.**

Chaque type de post (image seule + titre, image + paragraphe, image + 1 bulle, image + 2 bulles, avec leurs variantes de positionnement) est un **composant d'interface** codé une fois par un développeur, qui accepte des paramètres : quelle image dans quel emplacement, quel texte, quelle variante. Remplir ces paramètres ne change jamais la structure — seulement le contenu à l'intérieur.

Ce même composant sert à **deux moments** :
1. **Pendant l'édition**, il s'affiche en direct dans le navigateur du rédacteur — zéro latence, c'est du HTML/CSS classique.
2. **Au moment de l'export**, le même composant est capturé en haute fidélité par un navigateur headless pour produire le fichier final.

**C'est l'idée la plus importante de tout ce document.** Parce que c'est *exactement le même code* qui produit l'aperçu et le fichier final, il ne peut jamais y avoir d'écart entre ce que le rédacteur voit en validant et ce qui sort en PNG. Zéro surprise, zéro re-génération ratée.

### 2.1 Ce que l'outil fait

- Reçoit 1 à 3 images, propose automatiquement leur rôle (fond / bulle 1 / bulle 2)
- Détoure une image si le gabarit choisi l'exige
- Recadre intelligemment (garde le sujet centré)
- Améliore la résolution si l'image fournie est de qualité insuffisante
- Propose un gabarit adapté au nombre d'images, avec plusieurs variantes visuelles pour éviter la répétition
- Génère un titre ou une légende dans le style de la maison, à partir d'un thème donné ou d'une saisie manuelle
- Affiche un aperçu modifiable en temps réel
- Produit le fichier final en haute résolution
- Dépose le résultat dans un dossier Drive partagé, avec la légende et les hashtags proposés

### 2.2 Ce que l'outil ne fait pas (et ne doit pas faire)

- Il ne publie pas sur Instagram (publication manuelle, volontairement — voir document précédent)
- Il ne génère pas d'image représentant des personnes ou véhicules réels
- Il ne décide jamais seul du titre final : toujours au moins une confirmation humaine

---

## 3. Parcours utilisateur

### Écran 1 — Nouveau post
Bouton unique « Créer un post ». Deux champs facultatifs en haut : un thème/mots-clés (si le post n'est pas lié à une actualité précise), un lien source (si applicable). Ces champs ne sont pas bloquants — on peut passer directement à l'écran 2 sans rien remplir.

### Écran 2 — Dépôt des images
Zone de glisser-déposer, 1 à 3 emplacements. Dès qu'une image est déposée, une vignette apparaît avec un rôle **pré-assigné automatiquement** (fond / bulle 1 / bulle 2), modifiable par un simple clic sur une pastille.

Si une image manque : bouton **« Trouver un visuel »** qui ouvre un panneau de recherche (sources libres de droit), avec option **« Améliorer la qualité »** sur tout résultat trop flou.

### Écran 3 — Choix du gabarit
Selon le nombre d'images déposées, 2 à 3 vignettes de gabarits s'affichent (les variantes décrites dans le document précédent). Clic = sélection, avec bascule instantanée de l'aperçu.

### Écran 4 — Texte
Trois cas, l'interface s'adapte :
- Un thème a été renseigné à l'écran 1 → 3 propositions de titre apparaissent directement, prêtes à choisir ou éditer
- Rien n'a été renseigné → un champ de saisie libre, avec bouton « Suggérer un titre » qui redemande juste un mot-clé rapide
- Le rédacteur préfère écrire lui-même → il tape directement, l'outil vérifie juste que ça tient dans le cadre

### Écran 5 — Aperçu et ajustements
Le post s'affiche en grand, à l'échelle réelle, **rendu en direct par le navigateur** (donc instantané à chaque modification). Actions possibles sans quitter l'écran :
- Déplacer/redimensionner une bulle dans les limites autorisées
- Changer de variante de gabarit
- Régénérer le titre
- Permuter les images entre les emplacements

### Écran 6 — Validation
Bouton « Valider et exporter ». Lance le rendu final en haute fidélité en tâche de fond (quelques secondes) pendant que l'utilisateur peut déjà commencer un autre post si besoin — pas d'écran de chargement bloquant.

### Écran 7 — Export terminé
Confirmation avec miniature du résultat final, lien direct vers le fichier dans le Drive partagé, légende et hashtags copiables en un clic.

---

## 4. Stack technique

### 4.1 Principe de choix

Chaque brique est choisie pour trois critères simultanés : **gratuite en usage interne**, **licence sans ambiguïté**, **suffisamment simple pour qu'un seul développeur la maintienne**. Pas de plateforme tout-en-un, pas de framework à cloner — un assemblage court et lisible.

### 4.2 Composants retenus

| Couche | Choix | Licence | Rôle |
|---|---|---|---|
| **Langage / runtime unique** | Node.js + TypeScript | — | Un seul langage pour tout le projet ; simplifie la maintenance à un développeur |
| **Interface + composants gabarits** | React | MIT | Les gabarits sont des composants React ; réutilisés tels quels pour l'aperçu et le rendu final |
| **Serveur applicatif** | Next.js (App Router) | MIT | Sert l'interface ET les routes API dans un seul projet |
| **Rendu final haute fidélité** | Playwright (Chromium headless) | Apache 2.0 | Capture le composant React rendu en HTML → PNG pixel-parfait |
| **Détourage** | `@imgly/background-removal` (WASM, tourne côté client ou serveur) | MIT | Pas de dépendance Python, tout reste en JavaScript |
| **Amélioration HD** | Real-ESRGAN (binaire précompilé `realesrgan-ncnn-vulkan`) | Apache 2.0 / BSD (selon variante) | Appelé en ligne de commande depuis le serveur, aucune API payante |
| **Base de données** | SQLite (fichier local) ou Postgres léger | — | Historique des posts générés, gabarits, préférences |
| **Génération de titre** | Appel API vers un routeur LLM (voir §4.3) | — | Mode thème/mots-clés uniquement en v1 (RADAR absent) |
| **Stockage final** | API Google Drive | — | Export vers dossier partagé de l'équipe |
| **Authentification** | OAuth Google (Workspace si disponible) ou comptes invités | — | Accès restreint à l'équipe |

**Pourquoi Next.js plutôt qu'une simple app React + un serveur séparé :** un seul projet à déployer, un seul processus à faire tourner, une seule chose à maintenir pour un développeur solo. C'est un choix de simplicité opérationnelle, pas de performance.

### 4.3 Le point d'attention : Playwright a besoin d'un vrai serveur

Playwright pilote un navigateur Chromium réel. Cela ne fonctionne pas dans un environnement serverless classique type Cloudflare Workers (pas de Chromium disponible nativement) ni sur un hébergement statique. **Il faut un processus Node.js persistant**, ce qui oriente directement le choix d'hébergement au §4.4.

### 4.4 Hébergement — deux options à 0 €, à choisir selon votre contexte

**Option A — Machine dédiée en interne (recommandée si vous en avez une)**

Un ordinateur de bureau ou mini-PC existant, allumé en permanence, sur le réseau de l'entreprise. On y installe le serveur Node.js. Accès via :
- Réseau local directement, si tout le monde travaille sur place
- **Tailscale** (VPN maillé, gratuit jusqu'à 6 comptes utilisateurs, appareils illimités) pour un accès à distance sans configuration réseau complexe

⚠️ Si l'équipe dépasse 6 comptes distincts sur Tailscale, il faudra soit mutualiser des comptes d'accès, soit passer à l'alternative **Headscale** (implémentation open source du même protocole, licence BSD, auto-hébergeable, sans limite de comptes — un peu plus de travail de mise en place).

**Avantages :** zéro dépendance à un fournisseur cloud, vitesse maximale (aucune latence réseau externe), contrôle total.
**Inconvénient :** dépend de la disponibilité physique de la machine (coupure de courant, redémarrage).

**Option B — Machine virtuelle cloud gratuite (Oracle Cloud "Always Free")**

Oracle propose un palier gratuit permanent : à ce jour, **2 cœurs ARM et 12 Go de RAM** utilisables en continu, sans limite de temps. C'est largement suffisant pour Next.js + Playwright + les tâches d'amélioration d'image.

⚠️ **Deux réserves honnêtes à connaître avant de s'engager sur cette option :**
1. Ce palier a été **réduit** courant 2026 (il offrait auparavant 4 cœurs/24 Go) — les chiffres exacts peuvent encore évoluer, à vérifier sur la page officielle d'Oracle au moment de la mise en place.
2. La création d'une instance ARM gratuite se heurte parfois à des **indisponibilités de capacité** selon la région choisie (un message d'erreur « out of capacity » assez fréquemment rapporté). Il faut parfois réessayer ou changer de région.

**Avantages :** accessible depuis n'importe où sans VPN, pas de dépendance à une machine physique de l'entreprise.
**Inconvénient :** mise en place initiale un peu plus technique, capacité parfois difficile à obtenir.

**Recommandation pragmatique :** commencer par l'option A pendant le développement (plus simple, plus rapide à mettre en place), basculer vers l'option B seulement si l'équipe a réellement besoin d'un accès distant fiable sans dépendre d'une machine de bureau.

---

## 5. Vitesse de génération — pourquoi ça ne sera pas lent

Votre inquiétude est légitime, mais elle vient d'une confusion fréquente avec le **montage vidéo**, qui est effectivement lourd (des dizaines d'images par seconde à calculer et encoder). **Un post statique n'a rien à voir.**

### 5.1 Ce qui est instantané (0 seconde perçue)

Tout l'écran 5 (aperçu, déplacement de bulle, changement de variante, régénération de titre visuel) se passe **dans le navigateur, sans aller-retour serveur**. C'est du HTML/CSS/React classique — la même technologie qui fait qu'un site web réagit au clic sans délai.

### 5.2 Ce qui prend quelques secondes (en tâche de fond, jamais bloquant)

| Opération | Temps typique | Quand |
|---|---|---|
| Rendu final Chromium (une capture) | 1 à 3 secondes | Une seule fois, au clic « Valider » |
| Détourage d'une image | 1 à 4 secondes | Une seule fois, à l'import de l'image |
| Amélioration HD (upscale) | 3 à 10 secondes selon la taille | Une seule fois, seulement si demandé |

**Le principe qui protège la vitesse perçue : chaque opération lourde ne s'exécute qu'une fois par image, jamais à chaque interaction.** On détoure une image une fois à l'upload, pas à chaque fois que l'utilisateur bouge la bulle. On ne relance Chromium qu'à la validation finale, pas à chaque clic d'aperçu.

### 5.3 Ce qu'il faut éviter absolument en développement

- Relancer Chromium à chaque frappe clavier dans le titre (piège classique) → toujours prévisualiser en React pur, jamais en capture d'écran répétée
- Appeler l'amélioration HD automatiquement sur toutes les images sans demande explicite → ça ralentit sans bénéfice si l'image était déjà bonne
- Bloquer l'interface pendant le rendu final → toujours en tâche de fond avec notification à la fin

Bien construit, un rédacteur ne perçoit **aucune lenteur** de bout en bout, à l'exception d'une attente de 1 à 3 secondes au moment de valider — comparable à l'enregistrement d'un fichier, pas à un rendu vidéo.

---

## 6. Points d'attention pour dépasser les attentes

### 6.1 La fidélité pixel-parfaite n'est pas négociable
Le composant qui sert de gabarit doit être testé à l'identique sur toutes les résolutions cibles (feed carré, portrait, story). Un écart d'un pixel sur la position du logo, répété sur 50 posts, se voit dans le feed en scroll. Prévoir des tests visuels automatisés (capture de référence + comparaison pixel par pixel à chaque modification du code du gabarit) pour ne jamais régresser silencieusement.

### 6.2 La police et les assets graphiques doivent être exacts
Reprendre du document précédent : vérifier la licence exacte de la police utilisée, s'assurer qu'elle est installée dans l'environnement de rendu (pas seulement sur le poste du designer). Le logo et les éléments de charte (dégradés, épaisseur de bordure des bulles) doivent être extraits au pixel près des posts existants, pas recréés à l'œil.

### 6.3 Les zones de sécurité empêchent les catastrophes silencieuses
Chaque gabarit doit définir une zone où le texte ne peut jamais déborder, et une zone où une bulle ne peut jamais recouvrir le logo. Ces limites sont vérifiées automatiquement avant de proposer le rendu à l'utilisateur — un texte qui déborde ne doit jamais pouvoir être validé sans avertissement.

### 6.4 Le contrôle qualité avant présentation
Avant d'afficher le résultat à l'utilisateur, l'outil vérifie automatiquement : contraste suffisant entre le texte et le fond, absence de visage coupé dans un recadrage, résolution finale suffisante pour l'export. Si un contrôle échoue, l'outil le signale plutôt que de présenter un rendu déjà cassé.

### 6.5 Le carnet de style, encore et toujours
Comme pour RADAR, la génération de titre ne vaut que ce que vaut son guide de style. Même sans RADAR, il faut dès maintenant demander au rédacteur en chef 20-30 exemples réels de titres/légendes pour calibrer le ton — ce travail éditorial est plus déterminant pour la qualité perçue que n'importe quel choix technique.

### 6.6 Ne jamais dégrader silencieusement
Si le quota du service de titre gratuit est épuisé, ou si l'amélioration HD échoue, l'outil doit le dire clairement plutôt que produire un résultat de moindre qualité sans prévenir. Un post signalé « en attente » vaut mieux qu'un post discrètement moins bon publié.

---

## 7. Étapes de développement — pas à pas

Chaque étape a un objectif technique et un objectif qualité, avec un critère de fin d'étape vérifiable.

### Étape 0 — Socle du projet
**Objectif technique.** Initialiser le projet Next.js + TypeScript, mettre en place le dépôt Git, choisir et provisionner l'hébergement (§4.4).
**Objectif qualité.** Aucun encore — c'est de la plomberie.
**Critère de fin.** Une page vide accessible par toute l'équipe via son URL interne, avec authentification fonctionnelle.

### Étape 1 — Premier gabarit, bout en bout
**Objectif technique.** Construire *un seul* gabarit (famille 1A — image + titre) en composant React. Brancher Playwright pour capturer ce composant et produire un PNG. Vérifier que l'aperçu navigateur et le PNG exporté sont identiques au pixel près.
**Objectif qualité.** C'est l'étape la plus critique du projet : elle valide que l'architecture « même composant pour l'aperçu et le rendu » fonctionne réellement. Ne pas avancer tant que ce n'est pas parfait.
**Critère de fin.** Un PNG téléchargeable, avec une image + un titre tapé à la main, visuellement identique à un post existant du Média Automobile pris comme référence.

### Étape 2 — Pipeline image
**Objectif technique.** Ajouter l'upload d'image, le détourage, le recadrage intelligent, l'amélioration HD à la demande.
**Objectif qualité.** Vérifier sur une dizaine d'images réelles et variées (portrait, paysage, mauvaise résolution) que le détourage reste propre et que l'amélioration HD n'introduit pas d'artefact visible.
**Critère de fin.** Une image floue fournie en entrée produit un rendu net et correctement recadré, sans intervention manuelle autre que le clic « Améliorer ».

### Étape 3 — Attribution automatique des rôles
**Objectif technique.** Implémenter l'heuristique qui devine le rôle de chaque image déposée (fond / bulle) selon son format et son contenu.
**Objectif qualité.** L'attribution automatique doit être correcte dans une large majorité des cas ; sinon elle doit rester facilement corrigible en un clic, jamais un obstacle.
**Critère de fin.** Sur 10 essais avec des combinaisons d'images réelles, l'attribution automatique est acceptée sans correction dans au moins 7 cas.

### Étape 4 — Familles de gabarits complètes
**Objectif technique.** Construire les gabarits restants (1B, 1C, 2A/2B/2C, 3A/3B/3C — voir document précédent §4) comme composants React, chacun testé individuellement en pixel-parfait.
**Objectif qualité.** Chaque variante doit être validée visuellement contre un exemple réel du Média Automobile quand un exemple existe, ou contre les tokens de design partagés sinon.
**Critère de fin.** Sélectionner n'importe quelle combinaison de 1, 2 ou 3 images produit un rendu propre dans au moins deux variantes différentes.

### Étape 5 — Génération de titre (mode autonome)
**Objectif technique.** Brancher un routeur LLM simple (un fournisseur gratuit + un repli) pour générer 3 propositions de titre à partir d'un thème saisi. Sans RADAR, ce sera toujours le « mode 2 » du document précédent (thème/mots-clés), jamais le mode 1 (brief automatique).
**Objectif qualité.** Les titres générés doivent respecter la longueur maximale du gabarit sans troncature ni débordement, et refléter le carnet de style (§6.5).
**Critère de fin.** Sur 10 thèmes de test, les 3 propositions générées tiennent toutes dans le cadre et sont jugées acceptables par le rédacteur en chef.

### Étape 6 — Validation et export
**Objectif technique.** Implémenter le rendu final en tâche de fond, l'écran de confirmation, et l'export automatique vers le Drive partagé (voir §4.6 sur le point d'attention Drive).
**Objectif qualité.** Le fichier final doit être identique à l'aperçu vu par l'utilisateur, sans exception.
**Critère de fin.** Un post complet, de l'upload à l'apparition du fichier dans le Drive, prend moins d'une minute d'horloge, dont moins de 5 secondes de traitement serveur.

### Étape 7 — Recherche de visuel et interface complète
**Objectif technique.** Ajouter le panneau de recherche de visuel (banques d'images libres + Wikimedia) pour le cas où aucune image n'a été fournie, avec le bouton d'amélioration HD intégré au flux de sélection.
**Objectif qualité.** Les résultats de recherche doivent toujours afficher leur source et leur licence, sans exception, pour rester traçable.
**Critère de fin.** Un post peut être créé de bout en bout sans qu'aucune image n'ait été fournie par l'utilisateur au départ.

### Étape 8 — Déploiement équipe et test réel
**Objectif technique.** Ouvrir l'accès aux 5-10 membres de l'équipe, avec authentification finalisée.
**Objectif qualité.** **Le test des 10 posts** du document précédent (§5.2) : générer 10 posts avec l'outil, les mélanger à 10 posts faits main, faire trier le graphiste et le directeur. Si le tri est meilleur que le hasard, retourner en correction avant d'aller plus loin.
**Critère de fin.** Le test des 10 posts est réussi (tri au niveau du hasard).

### Étape 9 — Personnalisation avancée (v1.5)
**Objectif technique.** Curseurs de position/taille bornés dans l'interface (§6 du document précédent), édition d'un gabarit existant en mode designer.
**Objectif qualité.** Aucune combinaison de réglages autorisés par les curseurs ne doit pouvoir casser la charte graphique — c'est la définition même de « borné ».
**Critère de fin.** Le graphiste peut ajuster un post sans jamais sortir de la zone de sécurité.

### Étape 10 — Préparation à l'arrivée de RADAR (v2, quand RADAR existera)
**Objectif technique.** Ne consiste **pas à modifier STUDIO_AUTOMOBILE**, mais à s'assurer que RADAR produit un objet structuré simple — un résumé, les faits clés, un angle suggéré — que STUDIO_AUTOMOBILE peut consommer directement pour activer le « mode 1 » de génération de titre (voir §7.6).
**Objectif qualité.** Le passage du mode 2 (thème saisi) au mode 1 (brief automatique) ne doit rien changer à l'interface pour l'utilisateur — juste remplir les champs plus tôt.
**Critère de fin.** Un événement RADAR fictif (créé à la main pour tester) alimente STUDIO_AUTOMOBILE sans aucune modification de code côté STUDIO_AUTOMOBILE.

### 7.6 Le contrat d'interface avec RADAR — à définir dès maintenant, même si RADAR n'existe pas

Pour que l'étape 10 ne soit pas une réécriture, il suffit de définir *aujourd'hui* la forme exacte de ce que RADAR devra un jour produire. Un simple objet, par exemple :

```
{
  "resume": "texte court de l'événement",
  "faits_cles": ["fait 1 avec source", "fait 2 avec source"],
  "angle_suggere": "ce que le post devrait mettre en avant",
  "source_principale": "url"
}
```

Tant que RADAR n'existe pas, STUDIO_AUTOMOBILE fonctionne avec cet objet **rempli à la main par le rédacteur** (ce qui est déjà le « mode 2 »). Le jour où RADAR existe, il n'a qu'à remplir cet objet automatiquement — l'interface de STUDIO_AUTOMOBILE ne change pas d'une ligne. C'est ce détail de conception, décidé maintenant, qui évite tout travail de reprise plus tard.

---

## 8. Récapitulatif des coûts

| Poste | Coût |
|---|---|
| Toutes les bibliothèques logicielles (React, Next.js, Playwright, détourage, upscale) | 0 € — licences permissives, aucun palier payant |
| Hébergement (option A ou B) | 0 € |
| Accès à distance de l'équipe (Tailscale ou réseau local) | 0 € |
| Stockage final (Google Drive) | 0 € (dans la limite du quota Drive déjà disponible) |
| Génération de titre (LLM) | 0 € en usage modéré sur offre gratuite ; à surveiller si le volume augmente |

**Aucune dépense récurrente nécessaire pour développer et faire tourner STUDIO_AUTOMOBILE en interne.**

---

## 9. Ce qu'il faut retenir en une phrase par section

- **Objectif** : automatiser le montage, jamais la décision.
- **Architecture** : un seul composant sert à l'aperçu et au rendu final — c'est ce qui garantit zéro écart de qualité.
- **Stack** : Next.js + React + Playwright + deux outils d'image gratuits, un seul langage, un seul développeur peut maintenir.
- **Hébergement** : une machine toujours allumée, en interne ou sur un palier cloud gratuit permanent.
- **Vitesse** : instantané pendant l'édition, quelques secondes seulement au moment de l'export final, jamais d'attente bloquante.
- **Qualité** : fidélité pixel-parfaite, zones de sécurité, contrôle automatique avant présentation, carnet de style écrit par un humain.
- **RADAR** : pas nécessaire pour démarrer ; un contrat d'interface simple, défini dès aujourd'hui, évite toute réécriture le jour où RADAR existera.
