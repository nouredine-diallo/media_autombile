# Guide utilisateur — Le Média Automobile (RADAR + STUDIO)

> **Pour qui ?** Toute personne de l'équipe (rédacteur, validateur, responsable partenaires, direction) qui découvre l'outil.
> **Objectif :** comprendre ce que chaque écran fait, comment les combiner, et atteindre vos objectifs sans chercher.
> Version : 2026-08-28 (révisé) · Vérifié sur le code (`RADAR/`, `studio/`) **et** par test réel en navigateur (dashboard, /ready, /partenaires, /stats, /calendrier, /corrections).

---

## 1. L'outil en 30 secondes

Deux applications qui travaillent ensemble :

| Outil | Rôle | Se trouve où |
|---|---|---|
| **RADAR** (la veille) | Surveille les sources auto, détecte les événements, rédige les articles, suit la publication, les stats et les partenaires | Sur ton poste : `http://localhost:3000` — en ligne : le domaine principal (`media-labs.is-a.dev`) |
| **STUDIO** (le studio) | Transforme 1 à 3 images + un texte en **post Instagram** prêt à publier, comme un montage fait main | Sur ton poste : `http://localhost:3002` — en ligne : le sous-domaine STUDIO |

**Le métier en une phrase :** RADAR trouve *quoi raconter* et écrit le texte d'abord, STUDIO fabrique *le visuel*, et le dépôt se fait dans un dossier Google Drive partagé. L'outil **prépare, il ne publie jamais tout seul** : un humain valide toujours.

**Les briques de vocabulaire (à connaître) :**
- **Item** — un article brut provenant d'une source (RSS constructeur, presse…).
- **Événement** — un sujet détecté (plusieurs items similaires regroupés en un seul dossier de veille).
- **Brief** — la fiche factuelle d'un événement (les faits vérifiés, les sources). **Le brief est la seule autorité factuelle** : rien ne s'invente en dehors de lui.
- **Article** — le texte rédigé à partir d'un brief, prêt à être relu puis validé.
- **Gabarit** — le modèle visuel du post dans STUDIO (1A, 1B, 1C, 2A, 2B, 3A, 3B, CTA).
- **Carrousel** — un post multi-slides (accroche + slides + CTA final).
- **Job d'export** — la tâche de production du visuel final (lancée depuis STUDIO, tu n'as rien à installer).

---

## 2. Se connecter

**RADAR**
1. Ouvre l'URL RADAR. Tu es redirigé vers `/login`.
2. Saisis le **mot de passe partagé** (défini dans la configuration, communiqué par l'équipe — en dev c'est `work`).
3. Choisis ton nom dans la liste : **Daniel, Charlotte ou Test**. Ce nom sert aux verrous d'édition et aux assignations.
4. Tu arrives sur le **Dashboard accueil**.

**STUDIO**
- Pas de nouvel identifiant : la session RADAR est partagée avec STUDIO. Si tu arrives depuis RADAR (bouton « Créer un post »), STUDIO s'ouvre **déjà connecté**.
- En accès direct, STUDIO affiche une page de connexion (même mot de passe).

**Raccourcis d'équipe :** l'identifiant de contenu partagé relie un événement RADAR, un post STUDIO et un partenaire — **rien n'est ressaisi deux fois**.

---

## 3. Le Dashboard (la page d'accueil RADAR)

C'est ton « à faire aujourd'hui ». Il agrège, en haut ce qui est urgent, en dessous le reste :

- **Urgent** — événements marqués urgents (retard, sujet chaud) avec tonnette ambre.
- **En production** — les meilleurs événements **pas encore rédigés** (pas d'article associé), avec un bouton **« Rédiger »** pour les prendre en main. Ce n'est pas une liste d'articles en cours de relecture — c'est la file d'attente de rédaction, triée par score.
- **Prêt à publier** — articles validés : bouton **« Créer un post »** (ouvre STUDIO pré-rempli) ou **« Ouvrir dans Drive »** si déjà exporté (voir la limite Drive au §18 — ce bouton ne change jamais si le Drive n'est pas configuré, même après un export réussi).
- **Échéances** — une seule section qui regroupe trois choses : les prochaines échéances du calendrier (deadlines articles, publications, rapports), une alerte si le seuil de corrections du guide de style est atteint, et les campagnes partenaires en cours. Il n'y a pas de bloc « Tâches partenaires » séparé — c'est ici qu'elles apparaissent.
- **Brouillons du matin** — les actualités auto-générées par le pipeline (vaguement étiquetées « GÉNÉRÉ PAR L'IA ») : relis-les, elles ne sont pas publiées.
- **Statut du pipeline** — indicateur vert/orange/rouge : dernière exécution automatique, nb d'items, nb de visuels. Bouton **« Lancer maintenant »** pour forcer une exécution.
- **Statut Drive** — badge si le dossier Drive est configuré et connecté.

Chaque ligne mène à une action : clique sur un événement pour le traiter, sur un article validé pour l'envoyer dans le studio.

---

## 4. La veille — `/events` (trouver quoi écrire)

La liste des événements détectés par le pipeline, avec :
- le titre (traduit en français quand disponible) ;
- le score de pertinence (densité de sources, fraîcheur, marque) ;
- les sources qui se ressemblent (groupées) ;
- les **mots-clés/tags** ;
- la pastille **urgent** (cliquable pour forcer/déforcer l'urgence) ;
- le nom du membre assigné.

**Comment faire :**
1. Clique sur un événement pour ouvrir sa page de détail.
2. Si plusieurs sources se contredisent ou se ressemblent, tu vois directement le regroupement — tu ne lis pas 10 articles pour comprendre.
3. Marque un événement urgent si la rédaction doit s'en occuper aujourd'hui.
4. Assigne un événement à un membre de l'équipe s'il y a une répartition du travail.

---

## 5. La fiche événement — `/events/[id]` (le cœur du travail)

La page la plus riche : **tout le travail de rédaction se passe ici**. Elle est organisée en colonnes (mode focus avec le raccourci `F`).

1. **Sources** — les items bruts regroupés, avec les visuels sources. Un visuel peut être **rejeté** (bouton rouge sur la vignette) : il est remplacé automatiquement si possible, sinon signalé, pour ne jamais te faire chercher une image à côté de l'outil.
2. **Brief** — la fiche factuelle : titre suggéré, chapô, corps, **faits avec leur source et leur niveau de confiance**, angle conseillé. Bouton pour (re)générer le brief (il n'a pas besoin de LLM : il est bâti sur les faits).
3. **Article** — le texte rédigé à partir du brief :
   - *Générer* : l'article est rédigé dans la voix maison (tutoiement, phrases courtes, ton factuel-complice).
   - *Les faits sont mis en évidence* (**FactHighlighter**) : chaque chiffre est souligné et relié au brief — s'il n'y est pas, c'est une anomalie. Tu coches chaque fait vérifié avant de valider.
   - *Affiner* : tu donnes une consigne (ex. « selon une autre source », « raccourci ») et l'article est retravaillé.
   - *Contrôles auto* : **vérification des chiffres, anti-plagiat, structure, provenance** tournent avant la revue humaine. Un échec bloque l'article — jamais de dégradation silencieuse.
4. **Validation** — quand les faits sont cochés et l'article relu, tu valides. Le bouton **« Valider sans vérifier »** est l'exception explicite pour les articles de confiance (macro-action). Après validation, l'action bar s'affiche (voir §6).
5. **Verrou d'édition** — si un collègue travaille déjà sur l'article, un verrou `locked_by` est posé (badge + rafraîchissement). À 10 personnes c'est suffisant — pas de notification temps réel.

**Le raccourci clavier 1-2-3-4** sélectionne la colonne (sources → brief → article → action), `Ctrl+Entrée` valide.

---

## 6. Prêts à publier — `/ready`

La liste des articles **validés** (historique cumulatif, y compris déjà exportés). Pour chaque article tu as :

- la vignette du visuel source (la meilleure image de l'événement, selon la hiérarchie og:image → twitter:image → page → RSS) ;
- **« Créer un post »** → ouvre STUDIO **avec le titre, le chapô et l'image déjà pré-remplis** (`buildStudioLink`) ;
- **« Ouvrir dans Drive »** → une fois l'article exporté (`exported_at` + `drive_url` renseignés par le callback de STUDIO), le lien Drive remplace le bouton de création ;
- **« Planifier »** → ouvre un sélecteur de date (demain minimum) et crée un événement `publication_instagram` dans le calendrier ; l'article affiche alors « Planifié » ;
- **Associer à un partenaire** → pour les livrables de campagne.

---

## 7. Corrections — `/corrections`

L'outil apprend de tes corrections :
- chaque correction que tu fais sur un article est enregistrée (`generated → corrected`) ;
- l'analyse de motifs montre les **récurrences** (ex. « tel mot revient trop ») ;
- les **règles de style** (banned → expected) s'affichent et s'activent pour que la rédaction suivante évite l'erreur.

**Comment faire :** quand tu corriges un article généré, ton correctif est automatiquement une donnée d'entraînement. Si le nombre de corrections atteint un seuil, le dashboard te rappelle de consulter cette page.

---

## 8. Partenaires — `/partenaires`

Le tracker de **livrables de campagne** :
- **Créer un partenaire** : nom, marque, dates de campagne, livrables, notes, objectif (nombre de posts), format visé (`slide_unique` ou `carrousel`).
- **Associer des articles** aux livrables (depuis `/ready` ou la fiche événement).
- **Compteur de posts** réalisés vs objectif.
- **Rapport PDF** : généré par Playwright et téléchargeable — prêt à être envoyé au partenaire.

**Comment faire :**
1. Ouvre `/partenaires`, crée (ou édite) la campagne avec son objectif.
2. Associe les articles livrés au fur et à mesure.
3. Clique **« Générer le rapport »** quand la période se termine → tu télécharges un PDF qui ne contient que de vrais chiffres (zéro donnée inventée).

---

## 9. Statistiques — `/stats`

L'analyse des **infox publiées sur Instagram** :
- **Dépose le CSV Instagram** (export de la plateforme) dans la zone de glisser-déposer.
- L'outil calcule automatiquement : engagement moyen, taux de sauvegarde, taux de partage, meilleur/pire post, **répartition par format**, tendances descriptives.
- Graphiques : tendance d'engagement, distribution par format, top posts, comparaison de métriques, dispersion des performances.

**Comment faire :** exporte tes données Instagram → dépose le CSV → lis la synthèse → décide ce qu'il faut changer (par exemple, un format qui écrase les autres).

---

## 10. Drive — `/drive`

Un **explorateur** du dossier Drive partagé :
- navigation par dossiers, recherche par nom ;
- **prévisualisation des images** (thumbnails au lieu de simples icônes) ;
- statut de connexion (configuré ? connecté ? boîte mail associée ?).
- C'est ici que vont les posts exportés depuis STUDIO.

---

## 11. Calendrier — `/calendrier`

La **vue semaine** pour organiser la publication :
- types d'événements : `Deadline article`, `Publication Instagram`, `Envoi rapport`, `Campagne partenaire`, `Autre` — chacun avec sa couleur ;
- navigation semaines avant/après, ajout manuel d'un événement ;
- **glisser-déposer** d'un événement pour le déplacer ;
- les publications planifiées depuis `/ready` apparaissent ici automatiquement.

---

## 12. Guide de style — `/style-guide`

Consultation du guide de style de la rédaction (voix, registre, structure). C'est la référence utilisée par la génération : si tu corriges une règle ici, les articles suivants s'y conforment. Ne modifie pas le guide sans documenter le pourquoi (règle projet).

---

## 13. STUDIO — créer un post

**Le parcours :**
1. Depuis RADAR (`/ready` ou fiche événement), clique **« Créer un post »**. Le studio s'ouvre **pré-rempli** : thème/titre, chapô, image, source (c'est le flux RADAR → STUDIO).
   - En direct : ouvre `/nouveau-post` (redirigé vers `/titres`).
2. **`/titres` — la page de création complète** :
   - **Génère les titres** sur un thème (mots-clés) → plusieurs propositions → tu en choisis une (et un surtitre, et un paragraphe 1B si utile). **Tu valides toujours toi-même** — l'outil propose, tu décides.
   - **Choisis le gabarit** (1A image seule, 1B image+paragraphe, 1C surtitre+image+titre, 2A bulle centrée, 2B bulle décalée, 3A deux bulles symétriques, 3B deux bulles asymétriques, CTA de fin). L'outil **suggère** un gabarit auto selon le contenu, toi tu peux en changer.
   - **Uploade les images** (pour les gabarits 1-3) : l'outil les recadre intelligemment (cadrage qui respecte le sujet, fond flou si le sujet est trop large, détourage sujet en 3e couche pour que le véhicule passe devant les bulles), et **te conseille** un positionnement/débordement de bulle mesuré.
   - **Ajuste directement sur l'aperçu** (manipulation des bulles = la géométrie part telle quelle à l'export ; ce que tu vois est exactement ce qui sort).
   - **Exporte** : le visuel final est rendu par Playwright (cellule `data-gabarit`) → upload dans le **Drive partagé** → un **callback silencieux** marque l'article « exporté » dans RADAR.
3. **`/export/[jobId]`** — suivi de l'export en temps réel, sans quitter la page (`/export` fait du polling sur le job) ; confirmation + lien du fichier Drive.
4. **Carrousel (`/titres/carrousel`)** — pour un post multi-slides : décode le préfill RADAR → récupère le paquet carrousel (relais serveur, jamais navigateur→RADAR) → les images sont préparées → une proposition de slides → tu ajustes texte/image **par slide** → export. Maximum 5 images (mesure faite sur les 8 vrais posts : jamais plus de 3 slides de développement).
5. **`/pipeline`** — page technique (upload seul, upscale HD à la demande). N'en as pas besoin au quotidien ; l'upscale HD n'est jamais lancé automatiquement.

**Règle d'or STUDIO :** zéro écart entre l'aperçu et le rendu final — le même composant sert à afficher et à exporter. Si un visuel part, c'est exactement ce que tu as vu.

---

## 14. Les objectifs — comment combiner les fonctionnalités

### Objectif A — « Publier le post du jour » (rédacteur)
```
Dashboard → Urgent / En production / Prêt à publier
   → clique un événement            (/events/[id])
   → brief → article → relis → coche les faits → valide
   → « Créer un post »              (STUDIO s'ouvre pré-rempli)
   → choisis titre + gabarit → images → aperçu → export   (→ Drive)
   → RADAR affiche « Ouvrir dans Drive »
     (si le Drive n'est pas configuré : l'export réussit quand même en local
     — STUDIO propose « Télécharger le dossier » — mais RADAR n'est jamais
     prévenu dans ce cas précis. L'article reste affiché comme non exporté
     et le bouton reste « Créer un post ». Vérifié sur le code (2026-08-28) :
     ce n'est pas un bug d'affichage, le callback vers RADAR n'est
     déclenché que si l'upload Drive a réussi. Voir §18.)
   → (option) « Planifier » pour fixer la date de publication (→ calendrier)
```
**Ne perds jamais de temps** : tout ce qui peut être pré-rempli l'est (titre, chapô, image, source, contenu), le visuel est trouvé par l'outil, et la publication elle-même reste une décision humaine.

### Objectif B — « Livrer une campagne partenaire » (responsable)
```
/partenaires → crée la campagne (objectif, format)
   au fil de l'eau : associe chaque article livré  (depuis /ready ou fiche événement)
   fin de période → « Générer le rapport » → PDF → envoi
```
Relié au reste : les articles sortent des événements RADAR, passent par STUDIO (*slide_unique* ou *carrousel*), et le compteur se remplit dans le tracker.

### Objectif C — « Comprendre ce qui marche » (direction)
```
/stats → dépose le CSV Instagram → lis les tendances calculées (jamais inventées)
   croise avec le calendrier (quand a-t-on publié ?)
   croise avec les partenaires (quels livrables étaient actifs ?)
```

### Objectif D — « Ne pas casser le style »
```
/corrections → consulte les motifs récurrents et les règles actives
   tes corrections nourrissent automatiquement la génération suivante
   /style-guide reste la référence écrite ; documente tout changement
```

### Objectif E — « Organiser la semaine »
```
/ready → « Planifier » les articles validés
   + /calendrier → week-end visible, drag-and-drop, deadlines articles
   → le Dashboard liste les échéances à venir
```

---

## 15. Le pipeline automatique (qui tourne sans toi)

Toutes les 4h (configurable), en arrière-plan :
1. **Ingestion RSS** → nouveaux items (avec images quand la source les fournit : enclosure / `media:content`).
2. **Embeddings locaux** (pour dédupliquer) + **clustering** → détection d'événements.
3. **Scoring composite** (densité, vélocité, fraîcheur, marque) + **auto-tagging**.
4. **Auto-génération matinale** des brouillons (étiquetés IA — à relire et valider).

L'indicateur du Dashboard te dit s'il a bien tourné (vert/orange/rouge) et **« Lancer maintenant »** déclenche une exécution manuelle. Tu n'as rien à surveiller : le rédacteur ne fait que rédiger et valider.

**Hiérarchie des visuels (rappelle-toi) :** RSS (gratuit) → scraping og:image (gratuit) → recherche manuelle (dépannage). L'outil cherche avant toi ; tu ne cherches un visuel que par exception.

---

## 16. Règles maison (à garder en tête)

1. **Rien ne se publie tout seul.** Le dépôt dans Drive est la dernière étape automatisée ; la publication sur le compte Instagram reste une décision humaine.
2. **Le brief est la vérité.** Tout chiffre vient du brief ; un article qui invente est pire qu'un article maladroit.
3. **Le style est maison : tu/toi**, phrases de 15-25 mots, ton factuel-complice (pas corporate).
4. **Les visuels ne se cherchent pas à l'arrache** : l'outil les propose ; le bouton rouge rejette proprement.
5. **Les corrections comptent** : chaque correctif fait mieux écrire la machine.
6. **Zéro écart aperçu/rendu** dans STUDIO : ce que tu vois est ce qui sort.

---

## 17. Raccourcis clavier (RADAR)

| Touche | Action |
|---|---|
| `V` | Veille (/events) |
| `R` | Prêts à publier (/ready) |
| `C` | Corrections |
| `S` | Stats |
| `P` | Partenaires |
| `K` | Calendrier |
| `[` | Rétracter/étendre la sidebar |
| `F` / `Échap` | Activer/quitter le mode focus (fiche événement) |
| `1-4` | Sélectionner une colonne (mode focus) |
| `Ctrl+Entrée` | Valider |
| `?` | Afficher l'aide clavier |

---

## 18. Limites actuelles et bons réflexes

Vérifié sur l'environnement actuel (2026-08-28) — à savoir pour ne pas te surprendre :

- **Contenu en cours de remplissage.** Le pipeline produit les événements de veille ; les articles et les visuels dépendent des données réelles (traductions FR, images RSS, génération). Des pages peuvent être vides tant que le contenu n'est pas passé dans le parcours. C'est normal au démarrage.
- **Export = garder l'onglet ouvert.** Un job d'export est suivi depuis la page ; il vit en mémoire quelques minutes. Évite de recharger la fenêtre pendant le traitement.
- **Drive côté STUDIO.** L'upload vers le dossier partagé nécessite que la configuration Google soit en place. Au quotidien, si tu vois « non configuré », c'est un réglage serveur, pas une erreur de ta part.
- **Export réussi mais RADAR ne le sait pas, si le Drive n'est pas configuré.** Vérifié sur le code (2026-08-28) : que ce soit un post seul ou un carrousel, STUDIO ne prévient RADAR (« exporté ») que si l'upload Drive a réussi. Sans Drive configuré, l'export se termine bien et te propose un dossier à télécharger en local, mais RADAR n'en garde aucune trace — l'article reste listé comme non exporté sur `/ready`. Tant que le Drive n'est pas branché, suis toi-même quels articles tu as déjà exportés en ZIP pour ne pas relancer un export en double.
- **Le compteur « nb de visuels » du pipeline ne reflète pas les images déjà présentes.** Vérifié sur 3 exécutions réelles du cron (2026-08-28) : ce chiffre reste à `0` même quand des dizaines d'items sont ingérés avec une image RSS (enclosure/`media:content`). La recherche automatique d'og:image pour les items sans image ne tourne pas pendant le cron — elle ne se déclenche qu'à l'ouverture d'une fiche événement. Les images RSS, elles, arrivent normalement ; seul le compteur du statut pipeline est à ignorer sur ce point précis.
- **Le lien STUDIO.** Le bouton « Créer un post » t'ouvre le STUDIO selon l'URL configurée ; en dev local, travaille uniquement sur le poste où les deux apps tournent.
- **Quotas IA.** La génération (titres, articles) repose sur un fournisseur gratuit avec un quota journalier. Si le quota est atteint, certains boutons de génération répondent en mode dégradé : tu peux toujours créer l'article manuellement ou réessayer le lendemain. Jamais de résultat faux présenté comme normal.

---

## 19. Si tu es bloqué

- Relis les sections 5 (rédaction), 6 (publication), 13 (studios) — 90% des questions sont là.
- **Le bouton « … » c'est quoi ?** → en cas de doute sur une fonctionnalité, la description ci-dessus fait foi ; sinon demande à Daniel (développeur / support interne).

---

*Document généré à partir du code et des constitutions du projet. En cas de divergence entre ce guide et un écran, l'écran fait foi — signale l'écart pour que ce guide reste juste.*