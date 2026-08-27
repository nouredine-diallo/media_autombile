# Écosystème éditorial v2 — Plan d'intégration (à confirmer)

> **Statut : proposition, aucun code écrit.** Ce document répond à la demande "analyse tout, classe par tri, dis-moi la meilleure option sur chaque point, documente." Il ne remplace pas `TODO.md` — il le précède : c'est la couche de décision qui doit être tranchée avant de transformer quoi que ce soit ici en tâches `TODO.md`.
>
> Méthode suivie : chaque affirmation ci-dessous a été vérifiée contre le code réel ou testée en direct (curl sur les flux, lecture des fichiers cités) — pas de supposition présentée comme un fait. Là où une affirmation reste une estimation, c'est marqué explicitement. Angles croisés dans l'analyse : édition/curation, ingénierie pipeline, design de gabarit, UX du poste de travail — un seul raisonnement, pas des agents séparés, pour que la synthèse reste cohérente (voir note en bas de document).

---

## Mise à jour — 2026-08-27 : décisions tranchées + 2 chantiers exécutés

Réponses reçues à toutes les questions bloquantes du §4 sauf une (voir ci-dessous), plus deux chantiers déjà implémentés et vérifiés (pas seulement planifiés) parce qu'ils étaient entièrement spécifiés et à faible risque.

### Fait — Gabarit 1C restauré (famille 1 = 3 gabarits, comme demandé)

Ta clarification : 1A (image+titre), 1C (surtitre+image+titre — l'ancien "1B" d'avant le rebuild), 1B (image+long paragraphe — le nouveau, déjà construit). Vérification du code, pas supposition :

- `Gabarit1B.tsx` **était déjà** reconstruit selon la vraie spec (image + paragraphe, bloc noir ≥40%, aligné à gauche si long, gras intraparagraphe) — fait avant cette session, correspond exactement à ta description. Rien à faire ici.
- L'ancien gabarit "surtitre + titre" n'existait plus nulle part (pas dans `archive/`, pas dans l'historique Git — un seul commit couvre tout `Gabarit1B.tsx`). **Mais** `TitleFooter.tsx` (le bloc partagé par 1A et tous les autres) avait déjà un prop `eyebrow` non branché, mesuré sur une vraie référence (`inspi/`, post Mercedes) — et `titres/page.tsx` avait déjà toute la logique de sélection du surtitre câblée dessus, avec le commentaire explicite *"Surtitre sélectionné (ancien gabarit 1B, gardé pour compatibilité)"*. Le travail restauré était donc déjà à moitié fait, juste jamais raccordé.
- **Correctif appliqué** (2 fichiers, zéro nouveau fichier composant, zéro duplication) :
  - `Gabarit1A.tsx` : ajout d'un prop `eyebrow?` optionnel, transmis à `TitleFooter`. Sans lui, 1A reste strictement identique (le prop est absent par défaut sur ses routes dédiées).
  - `registry.tsx` : nouvelle entrée `"1c"` qui réutilise `Gabarit1A` tel quel (pas de nouveau composant), avec les champs Image/Cadrage/Surtitre/Titre. Un correctif nécessaire au passage : `Gabarit1A` porte en dur `data-gabarit="1a"` dans son propre JSX (utilisé par l'export Playwright pour trouver l'élément à capturer) — sans envelopper le rendu dans un `data-gabarit="1c"` de mêmes dimensions, l'export de 1C expirait au bout de 30 s en cherchant un sélecteur qui n'existait jamais. Corrigé.
- **Vérifié, pas juste écrit** :
  - `scripts/verify-gabarit-1a.mjs` → **PASS, pixel-identique** (aucune régression sur 1A).
  - `scripts/verify-gabarits-etape4.mjs` → 1a/1b/2b/3a/3b PASS ; 2a a échoué une fois sur un écart de 26 octets puis est repassé PASS au ré-essai — non lié à ce changement (je n'ai touché ni `Gabarit2A.tsx` ni son entrée du registre), flaky déjà présent avant cette session.
  - Export réel testé via `POST /api/render/1c` : PNG 1080×1350 généré, surtitre au-dessus du titre, identique à l'aperçu navigateur.
  - `npx tsc --noEmit` et `npm run lint` : propres sur les deux fichiers touchés.

Sélectionnable dès maintenant sur `/titres` → "1C — Surtitre + image + titre" apparaît dans le sélecteur de gabarit (dérivé automatiquement du registre, aucun changement d'UI supplémentaire nécessaire).

### Fait — 3 sources françaises ajoutées et vérifiées de bout en bout

Confirmées : Caradisiac, L'Argus, LeBlogAuto. Ajoutées via `scripts/add-french-feeds.ts` (même convention que `add-diverse-feeds.ts` existant), puis **testées avec le vrai parseur `fetchFeed()` de RADAR** (pas juste curl) :

| Source | Items | Image extraite (exemple) |
|---|---|---|
| Caradisiac | 10 | ✅ `images.caradisiac.com/...` |
| L'Argus | 30 | ✅ `images.largus.fr/...` |
| LeBlogAuto | 10 | ✅ `leblogauto.com/wp-content/...` |

Actives dans la table `feeds` (`enabled=1`, priorité 1). Elles seront ingérées au prochain passage du cron (`0 */4 * * *`, déjà vérifié tournant).

### ACEA : exclu, comme demandé. Rien fait.

### Google News RSS : **je déconseille l'intégration telle quelle — nouvelle vérification, pas un refus de principe**

Tu as confirmé vouloir "tout ce qui concerne l'actualité automobile sur Google". Testé en direct avec une requête large (`news.google.com/rss/search?q=automobile...&hl=fr&gl=FR`) : **ça fonctionne très bien comme contenu** — 100 items/jour, du vrai français, des sources qu'on ne suit pas encore (Auto Plus, AutoScout24, L'Automobile Magazine). Le problème n'est pas éditorial, il est technique et vérifié :

**Chaque `<link>` de Google News est un lien de redirection interne à Google** (`news.google.com/rss/articles/CBMi...`), pas l'URL de l'article réel. Testé (`curl -IL`) : ce lien redirige... vers une autre page `news.google.com`, pas vers le site source — la résolution vers l'article réel se fait par JavaScript côté client sur cette page intermédiaire. Le pipeline `scrapeArticleImages()` de RADAR va sur l'URL de l'`<item><link>` pour trouver les visuels : avec un lien Google News, il scraperait la page-relais de Google, pas l'article — ni texte utile ni image ne remonterait, alors que le flux aurait l'air de fonctionner (200, items présents). Une dégradation silencieuse exactement du genre que `RADAR/CLAUDE.md` interdit.

Deux options si tu veux quand même ce contenu, aucune anodine :
1. Ajouter une étape de résolution de lien (ouvrir chaque URL avec Playwright, attendre la redirection JS, récupérer l'URL finale) avant de scraper — un coût réel (un navigateur headless de plus par item) pour un mécanisme que Google modifie/durcit régulièrement sans préavis, donc fragile dans le temps.
2. Ne suivre que les items dont le titre se termine par un nom de source qu'on identifie et qu'on veut suivre spécifiquement (ex. "- Auto Plus"), et à ce moment-là ajouter directement le flux RSS natif d'Auto Plus s'il existe — plus simple, plus stable, mais ne couvre pas "tout Google" comme demandé.

**Je n'ai rien ajouté côté Google News en attendant ta décision** — dis-moi si tu veux l'option 1 malgré le coût, ou si on se limite aux flux natifs (option 2, ou juste les 3 sources déjà confirmées).

### Score de pertinence — proposition concrète (tu m'as laissé le choix)

Bonne nouvelle vérifiée : **un score composite existe déjà** (`scoring.ts`, `computeCompositeScore`), 0-100, déjà utilisé pour trier `/events` — densité de sources, vélocité (< 24h), fraîcheur, prestige de marque, mots-clés d'intérêt, diversité des flux. Ce n'est pas à réinventer, c'est à réutiliser :

- **"5 pertinents du jour"** = les 5 événements du jour avec le plus haut `events.score`, **hors les 2 auto-générés** (voir plus bas) — évite d'afficher deux fois la même actu.
- **"+5 / +10 pour explorer plus"** = même mécanisme que `hiddenInProgressCount` déjà sur le Dashboard ("+527 autres en attente"), mais en dépliage sur place plutôt qu'en lien vers `/events` — récupérer 15 événements côté serveur, n'en afficher que 5, un bouton révèle les 5 puis 5 suivants sans nouvel appel réseau.
- **Les 2 auto-générés le matin** : les 2 scores les plus hauts, tout court (avant filtrage des 5) — c'est ce qui garantit qu'ils sont "les plus pertinents" comme tu le demandes. Ils sortent de la liste des "5 à traiter" une fois transformés en brouillon (déjà "traités", exactement la même logique que "Prêt à publier" aujourd'hui).
- Le score ne sait pas encore distinguer les 4 axes éditoriaux (Société/Sport/Industrie/Gaming) — ça viendra avec la classification (§3.1, Option 1 recommandée). Pas bloquant pour démarrer : le classement par score seul est déjà correct, la classification affinera l'étiquette affichée, pas le tri.

**Marqué explicitement provisoire** (comme le veut `RADAR/CLAUDE.md` §4.3 pour tout seuil non mesuré sur données réelles) : c'est une proposition de combinaison, pas une vérité mesurée — à ajuster une fois en usage si le "top 5" ne correspond pas au jugement éditorial réel.

### Partenaires : slide unique confirmé

Cible de campagne = un nombre de publications **et** un type de format parmi `{slide unique, carrousel}` — les deux dans le même petit formulaire structuré proposé en §3.6, pas un système séparé.

### Téléchargement groupé pour les carrousels — confirmé, c'est la bonne méthode

Ta proposition (un post carrousel = un seul dossier téléchargé, jamais les slides séparément) est la bonne, et elle ne demande **aucun nouveau mécanisme** : STUDIO a déjà exactement ce pattern pour les posts à une image (`studio/CLAUDE.md` §6b, "Package d'export" — un dossier par `content_id`, image(s) + légende `.txt` groupées, déposées ensemble sur Drive). Pour un carrousel, la même logique s'étend naturellement : `slide-1.png, slide-2.png, ..., legende.txt`, un seul dossier, une seule entrée Drive, un seul `content_id`. Pas d'alternative à considérer sérieusement (zipper n'apporterait rien, Drive organise déjà par dossier ; télécharger séparément est exactement ce que tu veux éviter).

---

## Mise à jour — 2026-08-27 (suite) : Google News écarté, bug de voix corrigé, 4e gabarit restauré, logique de slides clarifiée

Réponse reçue à la dernière question bloquante, plus un bug corrigé et un chantier de conception avancé (analyse faite, rien d'irréversible codé sur ce dernier point tant que tu ne confirmes pas l'algorithme).

### Google News : écarté définitivement, comme demandé

"On ajoute pas Google et on se concentre sur les 3 sources." Confirmé — aucune intégration Google News, ni option 1 (résolution de lien via Playwright) ni option 2 (filtrage par source). Le flux reste : Caradisiac + L'Argus + LeBlogAuto uniquement, déjà actifs et vérifiés (section précédente).

### Fait — Bug de voix (tutoiement/vouvoiement) corrigé

**Le bug, confirmé par lecture du code, pas supposition** : `lib/llm.ts` (génération d'articles) disait `Tutoiement systématique ("tu", pas "vous")` dans son prompt système, mais `lib/translate.ts` (traduction FR) disait `Vouvoiement` — les deux textes passent par le même pipeline éditorial et se contredisaient silencieusement depuis le début, sans qu'aucun contrôle ne le détecte (ce n'est pas un des contrôles listés en `RADAR/CLAUDE.md` §7, qui vérifie les chiffres/plagiat/structure/provenance, pas la cohérence de registre).

**Correctif minimal, sans duplication** (2 fichiers, une seule source de vérité) :
- `lib/llm.ts` : nouvelle constante exportée `VOICE_REGISTER = 'Tutoiement systématique ("tu", pas "vous")'`, posée juste après la config Groq. Le prompt système de génération la référence désormais (`${VOICE_REGISTER}`) au lieu de la valeur en dur.
- `lib/translate.ts` : importe `VOICE_REGISTER` depuis `lib/llm.ts` et l'utilise dans son prompt, à la place de `Vouvoiement`.
- N'importe quel futur prompt éditorial qui a besoin de la règle de voix l'importe de la même constante — plus possible de la retaper et de la faire diverger une seconde fois.
- Vérifié : `npx tsc --noEmit` propre sur les deux fichiers (l'erreur de type préexistante à la ligne ~240 de `llm.ts`, sans rapport avec ce correctif, est toujours là — signalée pour mémoire, pas traitée ici).

**Non traité, à part** : `lib/llm.ts` contient une clé Groq en dur en valeur de repli (`process.env.GROQ_API_KEY || 'gsk_...'`) commitée dans Git. Repéré en cours de route, hors du périmètre de cette demande — signalé pour que tu décides si on la retire (elle devrait être révoquée côté Groq si elle est encore valide, une valeur de repli codée en dur n'a pas sa place indépendamment de ce chantier).

### Fait — 4e gabarit restauré : CTA / fin de carrousel

Tu as fourni 5 captures d'écran (`inspi/Capture d'écran 2026-08-27 0106xx-0107xx.png`) montrant un carrousel réel complet (titre "Pendant six mois, cette famille a fraudé les péages...") : slide 1 en 1C, slides 2-4 en 1B, **slide 5 dans un gabarit qui n'existait pas encore dans le registre** — plein cadre, pas de bandeau noir, message centré en haut, logo en bas. C'est la brique manquante pour "un carrousel = plusieurs slides ET toujours une fin standardisée", donc construite immédiatement plutôt que listée comme chantier futur (mesure directe sur capture, pas de valeur inventée) :

- Nouveau fichier `GabaritCTA.tsx` — mesures prises par seuillage de luminance sur la référence (texte entre 11,6% et 22,9% de hauteur, centré ; logo entre 92,3% et 96,1%, **identique** à la position du logo `TitleFooter` donc mêmes constantes réutilisées telles quelles, aucune retouche).
- Message par défaut préchargé (`CTA_DEFAUT`) : "Tu veux suivre toute l'actu automobile ? Alors abonne-toi dès maintenant à Le Média Automobile !" — texte identique mot pour mot sur les 8 posts réels de `inspi/TEXTPOST.txt`, jamais reformulé d'un post à l'autre. Champ éditable dans l'UI (`CLAUDE.md` §2 studio : l'outil prépare, il ne décide jamais), mais préchargé plutôt que vide.
- Enregistré dans `registry.tsx` sous l'id `"cta"`, apparaît automatiquement dans le sélecteur `/titres` (dérivé du registre, aucun changement d'UI supplémentaire).
- **Vérifié, pas juste écrit** : `scripts/verify-gabarits-etape4.mjs` étendu avec les cas `1c` et `cta`, suite complète relancée : **8/8 PASS** (`1a, 1b, 1c, cta, 2a, 2b, 3a, 3b`), aperçu et export strictement pixel-identiques sur chaque gabarit. `npx tsc --noEmit` et `npm run lint` propres.

La famille "1" a maintenant ses 3 variantes sélectionnables (1A, 1B, 1C) **et** le carrousel dispose de sa slide de fin dédiée (CTA) — les 4 briques visuelles nécessaires à composer n'importe lequel des 8 posts de référence existent maintenant dans le registre.

### Analyse — nombre de slides de développement : dépend de la substance, pas seulement du nombre de visuels (ta correction)

Ta remarque : "la génération de carrousel ne dépend pas uniquement du nombre de visuels trouvés mais aussi si l'actualité est pertinente à développer en plusieurs slides ou si une seule slide suffit." Confirmée par les 8 posts réels de `inspi/TEXTPOST.txt`, comptés un par un plutôt que supposés :

| Post | Slides de développement (1B) |
|---|---|
| Forza Horizon | 0 |
| Fraude au péage | 3 |
| F1 / Disney | 0 |
| Verstappen | 0 |
| Pub parents | 0 |
| Maserati V8 | 2 |
| Collier diamant | 2 |
| Comportement parking | 3 |

Anatomie confirmée : **titre (1A ou 1C) → 0 à 3 slides de développement (1B) → CTA, toujours**. Jamais plus de 3, jamais de carrousel sans CTA final. Ça correspond exactement à ta description ("parfois c'est juste le gab 1A/1C et la CTA").

**Bonne nouvelle vérifiée en lisant le code (`RADAR/src/lib/brief.ts`, fonction `generateBody`), pas supposée** : le corps du brief que RADAR génère aujourd'hui **varie déjà naturellement entre 0 et 3 paragraphes** selon la substance réelle de l'événement — ce n'est pas une structure fixe malgré les commentaires "Premier/Deuxième/Troisième paragraphe" qui pourraient le laisser penser :
- 1er paragraphe : seulement si `facts.length > 0` (les faits extraits existent).
- 2e paragraphe : seulement si des résumés de sources exploitables existent.
- 3e paragraphe : seulement si `facts.length > 3` (assez de faits pour un 2e niveau de détail).

Un événement pauvre en faits peut donc déjà produire 0 ou 1 paragraphe ; un événement riche en produit jusqu'à 3 — **exactement le signal de substance dont l'algorithme de slides a besoin, déjà présent, sans qu'aucune modification de `brief.ts` soit nécessaire.**

**Algorithme proposé (à confirmer avant implémentation, pas encore codé)** : nombre de slides 1B = nombre de paragraphes non vides dans `brief.body` (découpage sur `\n\n`, déjà le séparateur utilisé), chaque paragraphe devenant le texte d'une slide 1B, plafonné à 3 (jamais observé au-delà sur les 8 références). Le nombre de visuels disponibles n'intervient plus comme facteur de décision du nombre de slides — il reste seulement une contrainte : s'il manque une image pour habiller un paragraphe qui mériterait une slide, ce paragraphe est fusionné dans la slide précédente plutôt que de générer une slide 1B sans photo dédiée. Zéro paragraphe → zéro slide 1B, le carrousel passe directement du titre au CTA (couvre les 4 posts "0 slide" du tableau ci-dessus).

**Confirmé (2026-08-27, "tout me va")** : algorithme validé tel que décrit ci-dessus — nombre de slides 1B = nombre de paragraphes non vides de `brief.body`, plafonné à 3, fusion dans la slide précédente si un paragraphe validé n'a pas de visuel dédié disponible. Passe de "proposition" à "règle à implémenter" pour le chantier 3.3.

### Seuil de pertinence : confirmé

Tu as confirmé la proposition du score composite existant (`computeCompositeScore`) telle que décrite dans la section précédente — pas de nouveau chantier ici, la proposition passe de "à valider" à "validée", reste marquée provisoire pour ajustement une fois en usage réel (`RADAR/CLAUDE.md` §4.3).

---

## 0. Deux constats hors périmètre, mais qui ne peuvent pas attendre

**A. Clé API Groq en dur dans le code, avec une vraie valeur.**
`RADAR/src/lib/llm.ts:13` :
```ts
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
```
Ce n'est pas un exemple — c'est une clé qui ressemble à une clé Groq valide, committée dans le dépôt Git (donc dans l'historique, même si retirée demain). **Recommandation : la révoquer sur console.groq.com dès que possible, générer une nouvelle clé, la mettre uniquement dans `.env.local`, et supprimer le fallback en dur** (le code doit échouer explicitement si `GROQ_API_KEY` est absent, jamais se rabattre sur une clé embarquée). Je ne l'ai pas testée pour savoir si elle est encore active — pas la peine de vérifier, le risque est le même dans les deux cas.

**B. Un vrai bug de voix, silencieux depuis le début.**
- `RADAR/src/lib/translate.ts` (traduction FR des titres/résumés anglais) instruit le LLM : *"Vouvoiement"*.
- `RADAR/src/lib/llm.ts:47` (rédaction des articles) instruit le LLM : *"Tutoiement systématique"*.
- Le guide de style confirmé (ONBOARDING.md) dit : *"Tutoiement (pas de vouvoiement) — confirmé par 8 vrais posts."*

`translate.ts` a donc le mauvais registre depuis sa création. Ce n'est pas la cause de "ce n'est pas du bon français" que tu évoques au point 2 (le vouvoiement ne rend pas une traduction mot-à-mot), mais c'est une incohérence de marque vérifiable, corrigeable en une ligne, sans rapport avec le reste de ce plan — je le signale séparément pour ne pas le noyer dans la discussion stratégique ci-dessous.

---

## 1. La vraie dépendance qui change l'ordre de tout

Tu as listé les points 1 à 6 dans un ordre. Après vérification du code, **cet ordre ne peut pas être l'ordre d'exécution.** Voici pourquoi, avec preuves :

- Le point 2 demande un carrousel qui alterne **1A ou 1C** en ouverture, **1B** au milieu, **1A** en fin.
- Vérifié dans `studio/src/components/gabarits/` : `Gabarit1C.tsx` **n'existe pas**. Zéro fichier.
- Vérifié dans `studio/specStudio.md` (source de vérité citée par `studio/CLAUDE.md`) : le vrai 1B est *"même structure que 1A, texte plus long, moins gras"* — mais le `Gabarit1B.tsx` actuellement codé est un ancien build "surtitre + titre" qui ne correspond à **aucune** des deux définitions (ni l'ancienne, ni la tienne du message précédent). C'est un chantier déjà identifié et jamais terminé (`TODO.md`, Objectif 2).
- Vérifié dans `RADAR/src/lib/visualSearch.ts` (`getBestImageForEvent`) : le pipeline ne conserve **qu'une seule image par événement** aujourd'hui, alors qu'un carrousel de 2 à 5 slides en a besoin de plusieurs.

**Conséquence directe : le point 6 (perfectionner les gabarits famille 1) n'est pas un point parmi six — c'est le prérequis technique des points 2 et 3.** Construire la logique de carrousel avant que 1B/1C existent réellement produirait soit un carrousel avec les mauvais gabarits, soit un carrousel qui ne peut pas être fini. Le plan ci-dessous respecte cet ordre réel, pas l'ordre de ta liste.

**Bonne nouvelle vérifiée en contrepartie** : la partie qui semblait la plus lourde du point 2 — trouver plusieurs visuels par actualité — est presque déjà faite. `scrapeArticleImages()` retourne déjà un tableau d'images candidates par page source ; le pipeline actuel jette tout sauf `images[0]`. Le vrai travail n'est pas "construire un scraper multi-image", c'est "arrêter de jeter ce qu'on a déjà trouvé" — un chantier d'ampleur très différente de ce que le point 2 laissait supposer.

---

## 2. Ordre de priorité recommandé (remplace l'ordre 1→6 du message)

| # | Chantier | Pourquoi ici | Dépend de |
|---|---|---|---|
| 1 | **Sources & classification** (ton point 1) | Zéro dépendance technique, gain immédiat, corrige un vrai trou (voir §3.1) | — |
| 2 | **Gabarits famille 1 réels** (ton point 6) | Prérequis bloquant de 3 et 4 | — |
| 3 | **Brief + carrousel** (ton point 2) | Peut démarrer dès que le point 2 (gabarits) est prêt | Gabarits famille 1 |
| 4 | **Génération A-Z du matin** (ton point 3) | N'a de sens que si le point 3 (carrousel) est fiable | Brief + carrousel |
| 5 | **Corrections + Guide de style** (ton point 4) | Indépendant, gain rapide, faible risque | — |
| 6 | **Partenaires** (ton point 5) | Indépendant, gain modéré, faible risque | — |

5 et 6 peuvent être traités n'importe quand — je les mets en dernier seulement parce qu'ils ont le moins d'effet de levier sur "amplifier le flow de travail quotidien", pas parce qu'ils sont difficiles.

---

## 3. Analyse détaillée par chantier

### 3.1 Sources & classification (ton point 1)

**État vérifié (curl direct, aujourd'hui) :**

| Source proposée | URL réelle du flux | Statut | Langue | Notes |
|---|---|---|---|---|
| Caradisiac | `https://www.caradisiac.com/rss.xml` | ✅ 200, 10 items, images incluses | FR | L'URL que tu as donnée (`/actualite/toute-l-actu-auto/?`) n'est pas un flux RSS ; le vrai flux est différent, trouvé via `<link rel="alternate">` sur leur page d'accueil |
| L'Argus | `https://www.largus.fr/RSS` | ✅ 200, 30 items, images incluses | FR | Idem : l'URL donnée est une page HTML, pas un flux. Le vrai flux est `/RSS` (majuscules) |
| LeBlogAuto | `https://www.leblogauto.com/feed/` | ✅ 200 (redirige depuis `/feed`) | FR | Fonctionne tel quel |
| ACEA | `https://www.acea.auto/feed/` | ✅ 200 | Communiqués institutionnels, ton corporate | À part — voir note ci-dessous |
| Autosport | `https://www.autosport.com/rss/all/news/` | ✅ 200 (l'URL donnée redirige ici) | EN | Déjà dans `feeds` avec une URL légèrement différente (`/rss/feed/`) — à vérifier laquelle des deux est encore valide |
| The Race | `https://www.the-race.com/rss/` | ✅ 200 | EN | — |
| Motorsport.com | racine `/rss/` renvoie une page HTML, pas un flux | ⚠️ Seuls les flux par section marchent (ex. `/rss/f1/news/`) | EN | Déjà dans `feeds`, à corriger vers un flux par section |
| Google News RSS | pas d'URL donnée | — | — | Technique valable (`news.google.com/rss/search?q=...&hl=fr&gl=FR`) mais nécessite une requête par thème — **question ouverte, voir §4** |

**Trou confirmé, pas supposé** : la table `feeds` actuelle (68 lignes) est composée à 100 % de sites anglophones "enthusiast" (Jalopnik, Speedhunters, Petrolicious, Supercar Blondie, duPont Registry, Hemmings…) et de newsrooms constructeurs. **Zéro source française, zéro source qui correspond aux quatre axes éditoriaux que tu décris** (Société/Fait-divers, Sport/Business, Industrie/Tech, Gaming/Pop-culture). Le blocage B4 déjà noté dans `TODO.md` ("flux non configurés pour le projet") est donc plus grave que ce que le TODO laissait penser — ce n'est pas juste 2 flux hors-sujet à désactiver (designboom/dezeen, déjà fait), c'est l'absence totale de la bonne matière première.

**Classification par thème/registre — état vérifié** : `RADAR/src/lib/auto-tag.ts` existe déjà, mais c'est un tagueur par mot-clé/marque (Toyota, Électrique, Prix, Sport…), **pas** un classement selon les 4 axes éditoriaux. Il n'y a aujourd'hui aucune notion de "Société" / "Sport & Business" / "Industrie & Tech" / "Gaming & Pop culture" dans le code.

**Options pour la classification, triées :**

1. **Classification LLM courte, un appel par événement** (recommandé) — un prompt de ~10 lignes, une des 4 catégories en sortie, coût minime (quelques dizaines de tokens), s'adapte aux nuances qu'un regex ne peut pas capter (ex. distinguer une brève F1 "sport" d'une brève F1 "business/partenariat"). S'intègre dans le pipeline existant au même endroit que `translateToFrench`.
2. Étendre `auto-tag.ts` avec des règles regex par thème — gratuit, rapide à écrire, mais rigide : les catégories que tu décris sont sémantiques (une brève sur un parking mal garé n'a pas de mot-clé fixe), un système à base de motifs va mal classer une bonne partie des cas "Société/Comportement" en particulier.
3. Hybride (regex pour préfiltrer, LLM seulement sur les cas ambigus) — meilleur rapport coût/qualité à terme, mais plus complexe à construire d'entrée ; à envisager en v2 si le volume LLM devient un problème réel, pas avant.

**"5 pertinents par jour" — recommandation d'implémentation** : calculé côté serveur (pas au chargement de la page), affiché comme une nouvelle section sur le Dashboard existant (dans le prolongement direct de la section "Échéances" déjà construite) — pas une nouvelle page, pas un nouveau concept de navigation. Le reste (les ~500+ autres événements) reste accessible tel quel sur `/events`, qui fonctionne déjà comme la vue "tout voir" — rien à construire de ce côté, la fonctionnalité "aller voir le reste si on veut" existe déjà.

---

### 3.2 Gabarits famille 1 (ton point 6 — devient le chantier n°2)

**Écart vérifié entre 3 sources, à trancher avant de coder quoi que ce soit** — c'est le point où je bloque réellement, pas une formalité :

| Source | Définition de 1B | Définition de 1C |
|---|---|---|
| `studio/specStudio.md` (source de vérité déclarée) | "Même structure que 1A, texte plus long, moins gras" | "Badge overlay — annonce de partenariat/marque, badge circulaire en haut (ex. logo Disney+)" |
| `studio/CLAUDE.md` (journal de bord, tentatives précédentes) | "Image + paragraphe" (jamais construit selon cette définition) | Jamais construit, "aucun second pattern observé" |
| Ton message | "Bloc noir 40 à 50 % de l'écran, texte plus petit systématiquement aligné à gauche, mots-clés en gras" ; **1C utilisable en alternative à 1A pour l'ouverture** | Implicitement : un gabarit d'ouverture, pas un badge de partenariat |

Ces trois descriptions ne sont pas interchangeables. En particulier, ta description de 1C (utilisable en ouverture, comme 1A) contredit directement `specStudio.md` (badge de partenariat uniquement, jamais en position 1). Le protocole anti-hallucination du projet (`studio/CLAUDE.md` §4.3) interdit explicitement d'inventer une charte graphique ou de deviner un gabarit — **je ne trancherai pas ça seul.**

**Question ouverte n°1 (bloquante) : quelle est la bonne définition de 1B et 1C ?**
Le plus sûr, cohérent avec la méthode déjà utilisée avec succès sur ce projet (mesure sur de vrais posts publiés, jamais à l'œil) : si tu as 2-3 vrais posts Le Média Automobile qui utilisent un slide de développement (1B) et, si ça existe, un post qui ouvre sur autre chose qu'un 1A classique, je mesure dessus exactement comme ça a été fait pour 1A/2A/2B/3A/3B (position du bloc noir, alignement, taille de police) plutôt que de partir de ta description ou de la mienne. C'est la méthode qui a déjà fonctionné sur ce projet — la reproduire est le choix le plus sûr, pas un choix par défaut faute de mieux.

**Une fois la définition tranchée, le travail lui-même est balisé et à faible risque :**
- Reconstruire `Gabarit1B.tsx` selon la définition confirmée (remplace l'actuel "surtitre+titre", déjà identifié comme hors-spec dans `TODO.md` Objectif 2).
- Construire `Gabarit1C.tsx` neuf (n'existe pas).
- Étendre le pipeline pour conserver plusieurs images candidates par item (`visualSearch.ts` en a déjà — voir §1), pas juste `images[0]`.
- Vérification par régression pixel (aperçu = export), exactement le protocole déjà utilisé pour les 6 gabarits existants (`scripts/verify-gabarits-etape4.mjs`) — pas une nouvelle méthode à inventer.

---

### 3.3 Brief + génération de carrousel (ton point 2 — devient le chantier n°3)

**Le brief plus court, en français "par le sens"** : la mécanique demandée existe déjà et fonctionne dans son principe — `RADAR/src/lib/translate.ts` a explicitement pour instruction *"Traduction naturelle, PAS mot à mot"*. Le vrai correctif nécessaire est ponctuel : fixer le bug de registre (§0.B) et vérifier que le brief lui-même (`lib/brief.ts`, qui agrège les faits) est bien découplé du style de restitution — à ajuster, pas à reconstruire.

**Le carrousel selon le nombre de visuels — options triées, une fois les gabarits prêts (§3.2) :**

1. **Étendre le pipeline pour stocker N images par item (déjà scrapées, juste jetées aujourd'hui), puis une règle de composition simple : 1 image → 1A + CTA ; 2-3 images → 1A/1C, 1B, CTA ; 4-5 images → 1A/1C, 1B×2-3, CTA.** Recommandé : coût de développement modéré (le plus dur — le multi-scraping — est déjà fait), respecte exactement l'anatomie que tu décris, réutilise l'architecture de statut déjà en place (`articles.status`).
2. Laisser le rédacteur choisir le nombre de slides manuellement dans STUDIO, RADAR ne fait que proposer un pré-remplissage — plus simple à construire, mais ne répond pas à la demande explicite de génération automatique du dossier.

**Stockage du dossier + description associée — recommandation** : ne pas inventer une nouvelle notion de "dossier". Le projet a déjà un identifiant pivot pour ça — `content_id` — utilisé pour lier RADAR ↔ STUDIO ↔ Drive ↔ callback d'export (`RADAR/CLAUDE.md` §9b). Le dossier exporté (déjà : image + légende .txt par export, voir `studio/CLAUDE.md` §6b "Package d'export") devient simplement la version "plusieurs images" du même mécanisme, retrouvable par le même `content_id`. Pas de nouvelle table, pas de nouveau système de fichiers à inventer.

**Mise à jour de l'accueil** : l'événement passe de "à trier" à "traité" — recommandation : réutiliser la machine à états qui existe déjà (`articles.status` : draft → validated → exported), pas un nouveau statut parallèle. La miniature représentative sur le Dashboard existe déjà comme concept (section "Prêt à publier" affiche déjà une vignette `Thumb` par article) — l'étendre pour représenter un carrousel (première image) est une extension, pas une nouvelle brique.

---

### 3.4 Génération complète du matin pour les 2 actualités les plus pertinentes (ton point 3 — chantier n°4)

Compatible avec l'interdit central du projet ("rien ne se publie sans validation humaine") tant que la génération s'arrête à l'étape "brouillon prêt à valider dans STUDIO" — ce qui est exactement ce que tu demandes ("l'utilisateur a juste à valider ou modifier"). Aucun conflit de principe.

**Dépendance réelle** : ce chantier n'a de sens qu'une fois 3.2 et 3.3 solides — générer automatiquement un carrousel de A à Z avec des gabarits qui ne sont pas encore prêts produirait un brouillon à jeter, pas un gain de temps.

**Implémentation recommandée une fois prêt** : un pas de plus dans le cron existant (`[CRON] Scheduled with interval: 0 */4 * * *`, déjà vérifié tournant en production) — après le scoring du matin, si un événement dépasse le score de pertinence ET que les contrôles automatiques (§7 du cahier des charges : chiffres vérifiés contre le brief, anti-plagiat, structure) passent, le brouillon complet est généré. **Ne jamais contourner ces contrôles pour ce chemin automatique** — l'interdit `RADAR/CLAUDE.md` §2 ("ne jamais laisser un article passer à la revue humaine si le contrôle automatique détecte une anomalie") s'applique ici plus que jamais, puisque personne n'aura relu la sélection avant l'ouverture de STUDIO.

**Coût à surveiller, pas un bloquant** : ce chantier ajoute des appels LLM (classification + traduction + brief + rédaction de chaque slide × 2 événements × tous les jours) au-dessus du volume actuel. Le statut actuel n'est pas dégradé (`degraded: false` vérifié), et le routeur multi-fournisseur (§3.1 `RADAR/CLAUDE.md`) est déjà conçu pour ce genre de montée en charge — mais c'est un point à mesurer une fois en prod, pas à deviner maintenant.

---

### 3.5 Corrections + Guide de style (ton point 4 — chantier n°5)

**Vérifié : ces deux pages sont déjà plus liées que leur séparation en pages ne le laisse penser.**
- `/corrections` écrit déjà dans la table `style_rules` via un bouton "Ajouter au Guide de Style" (présent 2 fois : liste des corrections, et dans `CorrectionInterface` sur la page événement).
- `/style-guide` n'est rien d'autre que la liste de lecture/gestion de cette même table `style_rules`, qui est injectée dans le prompt de génération (`buildStyleRulesPrompt`, appelé par `lib/llm.ts`).

Ce ne sont donc pas deux fonctionnalités à rapprocher — c'est **une seule fonctionnalité affichée sur deux pages**, ce qui explique exactement le "paraît plus compliqué qu'il ne devrait l'être" que tu ressens.

**Option recommandée : fusionner en une seule page à onglets** — "Corrections" (liste + promotion vers une règle) / "Règles actives" (contenu actuel de `/style-guide`) / "Analyse" (patterns, déjà construit). Risque faible : aucune donnée ni API à changer, seulement la présentation. Impact réel : une seule destination dans la Sidebar au lieu de deux, un seul mental model ("la voix éditoriale") au lieu de deux pages dont le lien n'était pas visible.

---

### 3.6 Partenaires (ton point 5 — chantier n°6)

**Vérifié** : `partners.deliverables` est un champ texte libre, sans structure. `post_count` est un simple compteur, sans objectif à comparer. L'association article↔partenaire est déjà accélérée (fait en Phase 3 : bouton direct depuis `/ready` et la page événement) mais reste 1 par 1, un partenaire à la fois.

**"Config plus simple mais plus grande portée" — recommandation** : ne pas construire un CRM. Ajouter une **cible structurée minimale** (ex. "4 publications avant le 30/09") à côté du texte libre existant (qui reste pour le contexte), et afficher une barre de progression `post_count / cible` déjà calculable avec les données existantes. Les campagnes apparaissent déjà automatiquement au calendrier (mécanisme déjà vérifié en Phase 3, `getCalendarEvents` synthétise les campagnes partenaires à la volée) — rien à ajouter de ce côté, c'est déjà "plus grande portée" sans travail supplémentaire.

---

## 4. Questions bloquantes — j'ai besoin de ta décision avant de documenter la suite en tâches

1. **1B / 1C — quelle définition ?** Précisé en §3.2. Idéalement : des vrais posts Le Média Automobile à mesurer, comme pour les gabarits déjà construits.
2. **Sources à activer** : je confirme Caradisiac + Largus + LeBlogAuto (FR, vérifiés, fonctionnels) — les ajoute-t-on tous les trois sans condition, ou veux-tu valider chaque flux toi-même d'abord (le protocole `RADAR/CLAUDE.md` §8 demande une vérification humaine avant ajout, je peux avoir vérifié la forme technique mais pas la ligne éditoriale) ?
3. **ACEA** : c'est un flux de communiqués institutionnels (lobby des constructeurs), pas un média — pertinent pour "Industrie/Tech" mais un registre très différent des trois autres. Le garde-t-on ?
4. **Google News RSS** : quelles requêtes/thèmes exactement veux-tu suivre par ce biais ? Sans ça je ne peux pas vérifier les flux (chaque requête donne une URL différente).
5. **Seuil de "pertinence" pour les 5 du jour et les 2 auto-générés du matin** : ce sont des seuils métier — `RADAR/CLAUDE.md` §4.3 interdit explicitement de les inventer. Qui les fixe, et sur quelle base (score déjà existant dans `events.score` ? un nouveau calcul ?) ?
6. **Cible de partenariat** : un nombre de publications suffit, ou faut-il aussi un type de format (carrousel vs slide unique) dans la cible ?

---

## 5. Note de méthode

Cette analyse a été menée en un seul raisonnement plutôt qu'en agents séparés : le but demandé ("un écosystème cohérent, pas des fonctionnalités séparées") dépend justement de voir les dépendances croisées entre les 6 points (ex. §1 n'apparaît qu'en croisant les points 2 et 6) — un travail que des agents cloisonnés par domaine auraient produit fragmenté, chacun ignorant les contraintes des autres. J'ai en revanche changé d'angle explicitement à chaque section (curation éditoriale en §3.1, ingénierie pipeline en §3.3-3.4, design de gabarit en §3.2, ergonomie de poste de travail en §3.5-3.6) pour ne pas juger chaque chantier avec le même critère.

**Prochaine étape, une fois les questions du §4 tranchées** : je transforme les chantiers confirmés en plan `docs/superpowers/plans/` au format tâche-par-tâche (comme le plan RADAR→STUDIO déjà dans ce dossier), prêt à exécuter dans l'ordre du §2.

---

## 6. Chantier 3 (Brief + carrousel) — état réel du code, avant d'écrire une ligne

Chantier 3 est débloqué (gabarits famille 1 + CTA prêts, algorithme de slides confirmé). Avant de coder, vérification complète du chemin RADAR→STUDIO existant (single-image) pour ne rien casser — le "sans casser" que tu demandes systématiquement suppose de connaître exactement ce qui tourne déjà.

**Constat principal : le mécanisme actuel est single-image de bout en bout, à 4 endroits différents, pas un seul.**

1. `scrapeArticleImages()` (`RADAR/src/lib/visualSearch.ts`) retourne déjà un **tableau** d'images candidates triées par pertinence — mais les deux call sites (`findImagesForItems`, `reSearchImageForItem`) ne gardent que `images[0]` et jettent le reste. Rien n'est stocké au-delà : la colonne `items.image_url` est un simple TEXT, pas de table multi-image.
2. Même quand un événement a plusieurs items (sources), la requête SQL qui remonte l'image vers l'article utilise `LIMIT 1` (`db.ts`) — un deuxième goulot d'étranglement, indépendant du premier.
3. `studio-prefill.ts` encode tout (titre, source, image, contentId, titre du brief) dans un seul paramètre d'URL base64 — un champ `i` (une image, ou `'empty'`), pas un tableau. `brief.body` (les paragraphes) n'est même pas transmis aujourd'hui.
4. Côté STUDIO, `ExportJob` (`jobs/store.ts`) et `uploadToDrive()` sont conçus pour **un seul PNG** : un buffer, un nom de fichier, un appel Drive, un callback `{ driveUrl, driveFileId }` singulier vers RADAR (`articles.drive_url`, une seule colonne TEXT).

**Point important, à corriger dans la doc existante** : `studio/CLAUDE.md` §6b décrit un "dossier par publication" sur Drive — vérifié dans le code réel, **ça n'existe pas**. Image et légende sont déposées à plat dans le même dossier Drive partagé, regroupées seulement par nom de fichier identique. Le "dossier par carrousel" que tu as confirmé comme bonne méthode demande donc une vraie création de sous-dossier Drive (API `files.create` avec `mimeType: 'application/vnd.google-apps.folder'`), pas une extension de quelque chose qui existe déjà.

**Découpage proposé en 4 étapes indépendamment livrables** (chacune testable seule, aucune ne casse le chemin single-image existant tant que la précédente n'est pas branchée dessus) :

| Étape | Contenu | Risque | Casse l'existant ? |
|---|---|---|---|
| A | Nouvelle table `item_images` (item_id, url, source, rank, largeur, hauteur) ; les deux call sites de `scrapeArticleImages()` stockent tout le tableau au lieu de `images[0]` seul. `items.image_url` reste alimenté en parallèle (= premier rang) pour ne rien casser côté lecture actuelle. | Faible — additif pur | Non |
| B | Découpage de `brief.body` en paragraphes (déjà séparés par `\n\n`) exposé par une nouvelle fonction, ex. `getBriefSlides(eventId)` → `{ hook, dev: string[], } ` (plafond 3, fusion si pas de visuel dispo pour un paragraphe, cf. §"Analyse" ci-dessus). | Faible — lecture seule, aucune écriture | Non |
| C | Nouvel envelope de handoff RADAR→STUDIO : au lieu de tout encoder dans l'URL, RADAR expose `GET /api/events/[contentId]/carousel-package` (titre, images[], slides de dev, CTA par défaut) ; `studio-prefill.ts` passe seulement `contentId` + un flag `carousel=1`, STUDIO va chercher le reste par API. Le chemin actuel (`?prefill=` avec image unique) reste utilisé tel quel pour les posts à une image — nouveau chemin en plus, pas en remplacement. | Moyen — nouvelle route, nouveau contrat | Non (chemin actuel intact) |
| D | STUDIO : `ExportJob` accepte `slides: {gabaritId, fields, buffer}[]` au lieu d'un buffer unique ; `uploadToDrive` crée un sous-dossier par export et y dépose chaque slide + une légende ; callback RADAR élargi (`drive_url` devient l'URL du **dossier**, pas d'une image — compatible avec la colonne TEXT existante, aucune migration de schéma nécessaire côté RADAR). | Plus élevé — touche le chemin d'export qui tourne déjà en prod | Risque réel si mal isolé — à protéger par le flag `carousel=1` de l'étape C, jamais emprunté par un export single-image existant |

**Ce que je te demande de confirmer avant de coder** (architecture, pas éditorial — mais ça touche un chemin qui tourne déjà en prod, donc je m'arrête dessus par principe `RADAR/CLAUDE.md` §10) :
1. **Étapes A et B** : aucun risque, je peux les faire immédiatement sans attendre — dis-moi si tu préfères que j'attende quand même.
2. **Étape C (nouvelle route + nouveau contrat de handoff)** : d'accord pour introduire un `/api/events/[contentId]/carousel-package` en plus du `?prefill=` actuel (jamais en remplacement) ?
3. **Étape D (Drive)** : d'accord pour créer réellement des sous-dossiers Drive (jusqu'ici jamais fait malgré ce que dit `studio/CLAUDE.md`), avec le flag `carousel=1` isolant strictement ce chemin du chemin single-image qui tourne déjà ?

Si "tout me va" couvre aussi ce découpage, je démarre par A+B (aucun risque), puis C, puis D dans cet ordre — chaque étape vérifiée et rapportée avant de passer à la suivante, comme pour les chantiers précédents de cette session.

---

## Mise à jour — 2026-08-27 (suite) : étapes A, B, C, D implémentées et vérifiées

Confirmation reçue ("TOUT ME VA") pour le découpage ci-dessus. Les quatre étapes sont faites, chacune testée réellement (pas juste écrite), sans casser le chemin single-image existant.

### Étape A — toutes les images candidates sont conservées

Nouvelle table `item_images` (`item_id, url, source, rank, width, height`), additive — `items.image_url`/`image_source` restent alimentés en parallèle (rang 0), aucun code de lecture existant à changer. `findImagesForItems()` et `reSearchImageForItem()` (`RADAR/src/lib/visualSearch.ts`) stockent désormais tout le tableau retourné par `scrapeArticleImages()` au lieu de jeter tout sauf `images[0]`. Vérifié par un test direct (insertion + lecture + ré-initialisation du schéma idempotente), puis nettoyé.

### Étape B — rappel : déjà faite et confirmée pertinente-gated (section précédente)

### Étape C — nouveau handoff carrousel, en plus du `?prefill=` existant

- `GET /api/events/[contentId]/carousel-package` (nouveau) : renvoie titre, toutes les images connues de l'événement (dédupliquées, avec repli sur `items.image_url` pour les items sans ligne `item_images`), les slides de dev (`getBriefSlides`), le score et l'indicateur `pertinent`. Ne renvoie **pas** de texte de CTA — il appartient déjà à STUDIO (`CTA_DEFAUT`), le dupliquer créerait deux sources de vérité.
- `buildCarouselStudioLink()` (nouveau, `studio-prefill.ts`) : même enveloppe `?prefill=` que l'existant + `&carousel=1`. Le lien sans ce drapeau continue de fonctionner à l'identique.
- **Vérifié avec de vraies données** : testé sur un article temporaire pointant vers un événement réel du jour (score 95, pertinent) — la route renvoie 25 images dédupliquées (repli sur `image_url`, aucune ligne `item_images` pour cet item plus ancien) et 3 slides de dev. Nettoyé après test.
- **Découverte en testant, corrigée** : `events.score` était bloqué à 0 pour les 565 événements existants — un vrai bug silencieux dans `cron.ts` (l'étape scoring échouait et n'était logguée qu'en `console.error`, jamais visible ailleurs). Corrigé : recalcul immédiat des scores réels (11 à 95 désormais) et l'erreur de ce bloc est maintenant remontée dans `pipeline_runs.error`, déjà lu par `PipelineStatus.tsx` — si ça re-casse, ce sera visible.
- **Découverte plus large, signalée mais non corrigée (hors périmètre de cette tâche)** : `clusterItemsIntoEvents()` supprime et reconstruit **entièrement** `events`/`event_items` à chaque cycle cron, sans préserver les événements qui ont déjà un brief/article généré. Conséquence vérifiée sur ce jeu de données : **tous** les articles/briefs existants pointent vers un `event_id` qui n'existe plus (plage d'événements vivants 2784-3348, aucun article n'a un `event_id` dans cette plage). Ma route gère déjà ce cas proprement (404 explicite, jamais un plantage), mais c'est une fragilité de fond qui touche potentiellement toute fonctionnalité qui doit relier un article ancien à son événement d'origine — **à traiter comme un chantier à part, décision d'architecture (faut-il figer/exclure du nettoyage un événement qui a une descendance ?), pas une correction que je tranche seul.**

### Étape D — export carrousel côté STUDIO

- `jobs/store.ts` : `ExportJob` élargi (`slidesSpec`/`slides` optionnels), `gabaritId`/`fieldValues` désormais optionnels mais **inchangés en usage** pour un job single-image. Nouvelle `createCarouselJob()`.
- `drive/upload.ts` : nouvelle `uploadCarouselToDrive()` — crée un **vrai** sous-dossier Drive (`mimeType: application/vnd.google-apps.folder`) et y dépose chaque slide + une légende unique. Réutilise une primitive extraite (`uploadBufferToFolder`) plutôt que dupliquer la logique d'upload déjà présente dans `uploadToDrive` (single-image, inchangée, dépose toujours à plat dans le dossier racine).
- **Correction au passage sur `studio/CLAUDE.md` §6b** : le "dossier par publication" qu'il décrivait pour le cas single-image n'a jamais été réellement construit (vérifié dans le code) — image et légende sont déposées à plat. Le carrousel est donc le premier chemin à créer un vrai dossier.
- `export/route.ts` : `POST /api/export` détecte `slides[]` dans le body et bascule sur `processCarouselExportJob()` — chemin entièrement séparé de la validation/traitement single-image existant, jamais emprunté sans ce champ. Callback RADAR réutilisé tel quel (`{ driveUrl, driveFileId }` — l'URL/l'id du **dossier** au lieu d'une image), donc **aucune migration de schéma RADAR nécessaire**.
- **Différence assumée avec le chemin single-image** : si Drive échoue sur un carrousel, le job passe en `error` (jamais en `done` sans lien récupérable) — il n'existe pas encore de route de téléchargement direct pour un lot de slides (zip local), donc un "done" sans Drive serait un succès en apparence mais irrécupérable. Signalé, pas construit dans cette passe.
- **Vérifié de bout en bout, en conditions réelles** (serveur de dev, session authentifiée, 3 vrais gabarits dont les nouveaux 1C et CTA) : `POST /api/export` avec `slides` → 202 → rendu des 3 slides confirmé (`slideCount: 3`) → échec Drive **explicite et visible** (`GOOGLE_SERVICE_ACCOUNT_*` absents dans cet environnement de dev, comme pour le chemin single-image) plutôt qu'un faux succès silencieux. La création réelle du dossier Drive n'a pas pu être testée en conditions réelles ici (pas de identifiants dans cet environnement, même limite déjà documentée pour le chemin existant) — le code suit l'appel standard `drive.files.create({mimeType: 'application/vnd.google-apps.folder'})`, même client Drive déjà utilisé et vérifié ailleurs.
- **Suite de régression complète relancée après tous les changements** : `scripts/verify-gabarits-etape4.mjs` → **8/8 PASS** (1a, 1b, 1c, cta, 2a, 2b, 3a, 3b), aperçu = export sur chacun. Le chemin single-image n'a bougé d'aucun pixel.

### Ce qui reste, non fait dans cette passe (signalé, pas oublié)

- **L'interface `/titres` ne pilote pas encore le carrousel** : ce chantier a construit la mécanique d'export (rendu multi-slide, dossier Drive, handoff RADAR) — pas un nouvel écran pour composer/éditer un carrousel de plusieurs slides à la main dans STUDIO. C'est un vrai chantier UI à part, qui mérite sa propre mesure contre des références réelles (comme chaque gabarit l'a été) plutôt qu'une improvisation dans la foulée.
- **Téléchargement local d'un carrousel** (repli si Drive indisponible) : pas construit, voir "Différence assumée" ci-dessus.
- **La fragilité `event_id` orphelin** (étape C) : signalée, décision d'architecture à trancher séparément.

---

## Mise à jour — 2026-08-27 (suite) : plan d'intégration complet pour ce qui manque sur les points 1 à 5

Demande : un plan d'intégration complet pour ce qui reste sur les points 1 à 5 (le point 6 — cadrage gabarit 1 — est explicitement mis de côté : il repose sur un système de recadrage intelligent déjà construit avant cette session, à rouvrir séparément avec de vrais exemples si le besoin se confirme, pas à traiter dans ce plan). Objectif explicite : un écosystème cohérent, pas cinq chantiers cloisonnés — donc avant le détail par chantier, le principe qui les relie tous.

### Principe directeur : un seul moteur d'assemblage, pas cinq briques isolées

Le point 2 (assembler un carrousel à partir d'un brief) n'est pas qu'"un chantier parmi cinq" — c'est la fondation technique dont dépend directement le point 3 (génération A-Z du matin ne peut produire un brouillon complet que si l'assemblage existe et est fiable), et dont la qualité perçue conditionne la valeur de tout le reste. Les points 1, 4 et 5 sont indépendants de lui, mais le point 1 (score, "5 pertinentes") et le point 3 (score, "2 auto-générées") partagent déjà la même source de vérité (`events.score`, `computeCompositeScore`) — les traiter avec des règles différentes romprait la cohérence déjà actée ("les 2 auto-générés ne comptent pas dans les 5, et doivent être les plus pertinents").

### Graphe de dépendances réelles

```
Chantier 2 (moteur d'assemblage + écran carrousel)
   └──> Chantier 3 (auto-génération A-Z du matin) — ne démarre qu'une fois 2 vérifié EN USAGE, pas juste testé

Chantier 1 (classification + dashboard "5 pertinentes")  — indépendant, peut avancer en parallèle de 2
Chantier 4 (fusion Corrections/Guide de style)             — indépendant, faible risque, faible effort
Chantier 5 (Partenaires)                                   — indépendant, faible risque, faible effort
```

**Ordre recommandé** : 2 d'abord (le plus gros levier, débloque 3) → 1 en parallèle (indépendant) → 3 une fois 2 éprouvé → 4 et 5 n'importe quand, à caser dans les interstices — ils ne bloquent rien et rien ne les bloque.

### Friction transverse à anticiper AVANT de coder le détail (sinon elle revient sur 3 chantiers différents)

**La fragilité `event_id` orphelin, déjà signalée à l'étape C, devient bloquante ici — pas juste gênante.** `clusterItemsIntoEvents()` supprime et reconstruit tous les événements à chaque cycle cron. Une classification thématique (chantier 1) ou un statut "traité" (chantier 2) calculés pour un événement n'ont donc aucune garantie de survivre au cycle cron suivant — le champ serait recalculé dans le vide ou perdu. **Décision à prendre avant d'écrire la classification ou le statut "traité" persistant** : soit exclure du nettoyage tout événement qui a une descendance (brief/article), soit reporter la classification/le statut sur l'article plutôt que sur l'événement (l'article, lui, ne disparaît jamais). La deuxième option est la moins risquée — elle ne touche pas au comportement de clustering existant, jamais revalidé, potentiellement fragile pour d'autres raisons. **Recommandation : stocker la classification et le statut carrousel sur `articles`, pas sur `events`.**

---

### Chantier 2 (reste) — Moteur d'assemblage carrousel + écran `/titres`

Ce qui existe déjà (fait) : gabarits 1A/1B/1C/CTA, images multiples stockées (`item_images`), slides de dev filtrées par pertinence (`getBriefSlides`), route de handoff (`carousel-package`), mécanique d'export multi-slides + dossier Drive (STUDIO). Ce qui manque pour que ça forme une chaîne automatique :

- **2.1 — Règle d'assignation image → slide (à confirmer, pas à deviner).** Proposition : la meilleure image (rang 0) va au hook (1A/1C), la suivante disponible à chaque slide de dev dans l'ordre, la dernière (ou une image d'ambiance réutilisée) au CTA. Si moins d'images que de slides de dev prévues par `getBriefSlides`, le nombre réel de slides de dev est plafonné au nombre d'images disponibles moins 2 (hook + CTA) — jamais une slide 1B sans photo dédiée. Cette règle est nouvelle, pas mesurée sur des posts réels comme les gabarits l'ont été (il n'existe pas encore de posts générés par ce pipeline) — à valider à l'usage sur les premiers vrais carrousels produits.
- **2.2 — Choix 1A vs 1C pour le hook.** 1C a besoin d'un surtitre — rien ne le génère aujourd'hui. **Recommandation : démarrer systématiquement en 1A**, ajouter la génération de surtitre comme amélioration séparée une fois le reste stable, plutôt que d'inventer maintenant une règle de décision non mesurée.
- **2.3 — Le besoin caché : réécrire chaque paragraphe du brief en texte de slide.** `brief.body` est un texte de brief (factuel, dense — voir l'exemple Chevrolet Tahoe généré pour les tests, illisible tel quel sur un carrousel). Sans réécriture, un carrousel auto-assemblé afficherait du texte de brief brut sur les slides 1B, pas un texte de post. **Nouveau besoin non identifié dans les 6 points d'origine, mais nécessaire pour que 2 et 3 aient une vraie valeur** : une étape LLM courte, un paragraphe → une légende de slide (ton tutoiement du guide de style, phrase courte, mot-clé en gras comme décrit dans ton anatomie de carrousel). Peut réutiliser le routeur LLM déjà en place (`lib/llm.ts`), pas une nouvelle dépendance.
- **2.4 — Nouvelle fonction d'assemblage côté RADAR.** `buildCarouselSlides(eventId): { gabaritId, fieldValues }[]`, combine 2.1+2.2+2.3, exposée en enrichissant la route `carousel-package` déjà construite (elle renvoie aujourd'hui les ingrédients bruts — images, paragraphes — pas un assemblage prêt). RADAR **propose** un assemblage complet ; STUDIO l'affiche comme pré-remplissage modifiable, jamais comme décision figée (cohérent avec "l'outil prépare, il ne décide jamais").
- **2.5 — Écran `/titres` carrousel.** Le morceau le plus lourd : afficher N cartes de slide (gabarit, image, texte éditable), garder l'ordre narratif fixe (pas de réordonnancement — l'anatomie est toujours accroche → développement → CTA), permettre d'échanger l'image d'une slide (réutiliser le sélecteur d'image déjà construit pour le flux single-image) et de régénérer une légende individuellement, aperçu par slide (réutiliser le pattern d'aperçu déjà existant), bouton final "Exporter ce carrousel" qui appelle `POST /api/export` avec `slides[]` (déjà construit et vérifié). **Recommandation de forme** : des cartes empilées verticalement dans le même esprit que l'écran `/titres` actuel, pas un assistant slide-par-slide — minimise les nouveaux patterns d'interaction à apprendre pour l'opérateur.
- **2.6 — Statut "traité" + vignette accueil.** Une fois le carrousel exporté, réutiliser `articles.status`/`exported_at` (déjà existant) pour faire sortir l'événement de la pile "à trier" ; vignette = première image du carrousel, réutiliser le composant `Thumb` déjà utilisé pour "Prêt à publier".
- **2.7 — Stockage/retrouvage de la légende.** La légende finale existe déjà dans le dossier Drive (`legende.txt`, étape D). Pour qu'elle soit retrouvable **depuis RADAR** sans dépendre de Drive (traçabilité, `RADAR/CLAUDE.md` §6), **recommandation : ajouter une colonne `articles.carousel_slides TEXT`** (JSON de l'assemblage final utilisé, texte + gabarit + image par slide) — additif, faible risque, cohérent avec le pattern de migration déjà en place.

### Chantier 1 (reste) — Classification thématique + dashboard "5 pertinentes"

- **1.1 — Classification LLM des 4 axes.** Nouvelle fonction `classifyEventAxis` (réutilise le routeur LLM `lib/llm.ts`, pas une nouvelle dépendance), prompt avec les 4 catégories exactes que tu as données (Société/Comportement/Fait Divers ; Sport Automobile & Business ; Industrie/Produit/Tech ; Gaming & Culture Pop) — calibrée sur tes propres exemples réels (arnaque au péage → Société, Verstappen/Disney/collier → Sport, Maserati V8 → Industrie, Forza Horizon → Gaming), pas des exemples inventés. **Stockage recommandé sur `articles`, pas `events`** (voir friction transverse ci-dessus) — donc calculée au moment de la génération du brief/article, pas juste après le scoring.
- **1.2 — Dashboard "5 pertinentes + explorer plus".** Top 5 `events.score` du jour (hors les 2 auto-générées une fois le chantier 3 en place), étiquetées par axe, bouton "+5/+10" qui déplie sur place un lot de 15 déjà récupéré côté serveur (déjà conçu, juste pas codé).

### Chantier 3 — Génération A-Z du matin pour les 2 plus pertinentes (dépend du chantier 2)

- **3.1** — Nouveau pas dans `cron.ts`, après `calculateScores()` : sélectionner les 2 meilleurs scores globaux (pas parmi les 5 du dashboard), lancer brief → assemblage carrousel (2.4) automatiquement.
- **3.2** — Passage obligatoire par les contrôles automatiques existants (`RADAR/CLAUDE.md` §7 : chiffres vérifiés contre le brief, anti-plagiat, structure, provenance) avant présentation — un échec de contrôle sur ce chemin automatique doit être **visible** (log clair, événement qui retombe simplement dans la pile manuelle), jamais contourné pour "quand même produire un brouillon".
- **3.3** — `articles.provenance = 'généré'` sur ce chemin (colonne déjà existante, valeur à bien positionner).
- **3.4** — Traitement visuel distinct sur le dashboard ("à valider" plutôt que "à traiter") pour ces 2 brouillons déjà prêts.
- **3.5** — Coût LLM à surveiller une fois en prod (déjà signalé, pas un bloquant, le routeur multi-fournisseur existe pour absorber la montée en charge).

### Chantier 4 — Fusion Corrections + Guide de style (indépendant, faible risque)

- Page unique à onglets (Corrections / Règles actives / Analyse), même données (`style_rules`), aucune API à changer. Une seule entrée dans la Sidebar au lieu de deux.

### Chantier 5 — Partenaires (indépendant, faible risque)

- Ajouter `partners.target_count INTEGER` et `partners.target_format TEXT` (slide unique / carrousel) à côté du champ libre `deliverables` existant (migration additive). Barre de progression `post_count / target_count` dans l'UI. Aucun changement à la synthèse calendrier (déjà fonctionnelle).

### Ce que ce plan ne tranche pas — à confirmer avant d'écrire du code

1. La règle d'assignation image→slide (2.1) et le plafonnement du nombre de slides par le nombre d'images disponibles.
2. Démarrer sans surtitre (toujours 1A) plutôt que d'inventer une règle de décision 1A/1C (2.2).
3. Ajouter une étape de réécriture LLM brief→légende de slide (2.3), qui n'était pas explicite dans la demande d'origine.
4. Stocker la classification et le statut "traité" sur `articles` plutôt que sur `events`, à cause de la fragilité `event_id` (friction transverse).
5. Ajouter `articles.carousel_slides` pour la traçabilité de la légende (2.7).

---

## Mise à jour — 2026-08-27 (suite) : décisions tranchées, chantier 1 mis en attente, 2.3 implémenté et vérifié

Réponse reçue : 2.2 confirmé (toujours 1A pour le hook, pas de décision 1A/1C automatique). Chantier 1 (classification + dashboard) **mis en attente, non attaqué**. 2.3 tranché par une question factuelle posée par l'utilisateur — vérifiée avant d'agir, pas supposée. Les points restés ouverts (2.1, 4, 5 de la liste ci-dessus) laissés à mon jugement, "point de vue utilisateur du média + code minimum cohérent sans duplication".

### 2.3 — Vérifié : `brief.body` n'est pas généré par un LLM, donc laissé tel quel

Question posée : le brief de base passe-t-il par un LLM ? **Vérifié en lisant le code** (`generateBody()`, `RADAR/src/lib/brief.ts`) : non — c'est une concaténation déterministe de faits/résumés extraits, aucun appel LLM. Conclusion appliquée telle que demandée : **`brief.ts` n'a pas été touché.**

Le texte qui apparaît réellement sur les slides du carrousel devait donc venir d'ailleurs — et c'est là qu'un LLM intervient déjà dans le pipeline (génération d'article, 150-500 mots, pensé pour un site qui n'existe pas). Plutôt que d'empiler une deuxième passe de réécriture par-dessus un texte long (ce qu'aurait été mon 2.3 d'origine — deux appels LLM, une vraie duplication), **un seul nouvel appel LLM, court par construction dès le départ** :

- **`generateCarouselParagraphs()`** (nouveau, `RADAR/src/lib/llm.ts`) — réutilise la détection de type et le few-shot déjà existants (`detectArticleType`, `selectFewShot`, aucune nouvelle donnée de calibrage), même `VOICE_REGISTER`, mêmes règles anti-invention ("jamais un fait hors du brief") que la génération d'article. Diffère uniquement par le format demandé : 1 à 3 paragraphes courts, pas de titre/chapô/conclusion (déjà gérés par les gabarits), pas d'émoji, pas d'appel à s'abonner (la slide CTA fixe s'en charge déjà — sinon duplication éditoriale).
- **`getCarouselSlides()`** (remplace l'ancien `getBriefSlides()` synchrone) — même seuil de pertinence (40, inchangé), **zéro appel LLM si l'événement n'est pas pertinent** (coût nul, vérifié : 0ms). Si pertinent, résultat mis en cache dans une nouvelle colonne `briefs.carousel_text` — une deuxième lecture de la même actu ne repaie jamais l'appel LLM (vérifié : 2ᵉ appel en 0-1ms contre ~2,6s pour le premier).
- **Bug réel découvert et corrigé en testant** : le modèle (`openai/gpt-oss-120b`) est un modèle "raisonneur" — déjà documenté comme piégeux dans `studio/CLAUDE.md` §1.1 pour ce même modèle. Avec un budget de tokens serré (400, proportionné au texte court demandé), il consommait tout son budget en raisonnement invisible et renvoyait une chaîne vide — vérifié en isolant l'appel brut. Corrigé en portant `max_tokens` à 1200 (le texte visible reste court, c'est la marge de raisonnement qui manquait) — revérifié, réponse non vide et conforme au format demandé.
- **Vérifié de bout en bout sur un événement réel** (score 95) : 3 paragraphes courts, factuels, en français, aucun fait hors du brief, mise en cache confirmée. Route `carousel-package` mise à jour pour appeler cette nouvelle fonction asynchrone. `npx tsc --noEmit` propre sur tous les fichiers touchés (seule l'erreur de type pré-existante et non liée, déjà signalée plus haut dans ce document, reste présente ailleurs dans `llm.ts`).

### Points laissés à mon jugement — décisions prises

- **2.1 (règle image→slide)** et **5 (`articles.carousel_slides`)** : pas encore implémentés dans cette passe — 2.3 était le point qui débloquait le texte des slides, l'assignation des images et le stockage de l'assemblage final restent à faire pour que le moteur d'assemblage (2.4) soit complet.
- **4 (stocker sur `articles` plutôt que `events`)** : confirmé comme direction à suivre quand la classification (chantier 1) ou un statut "traité" persistant seront implémentés — non applicable pour l'instant puisque le chantier 1 est en attente et qu'aucun statut persistant n'a encore été ajouté.

### Chantier 1 — explicitement non attaqué

Classification thématique et dashboard "5 pertinentes" : **rien fait**, sur demande explicite ("N'ATTAQUE PAS LE CHANTIER 1").

---

## Mise à jour — 2026-08-27 (suite) : chantiers 2 (reste), 3, 4, 5 — implémentés et vérifiés

Demande : finir tous les points manquants sauf le chantier 1, "en fond et en forme" (backend + UI), meilleure intégration selon nos conventions. Fait, dans cet ordre.

### Chantier 2 (fin) — assemblage carrousel + écran STUDIO

**Découverte qui a changé le découpage prévu** : l'assemblage `{gabaritId, fieldValues}[]` (2.4) ne pouvait pas être calculé côté RADAR comme prévu — les URLs d'image ne deviennent utilisables par un gabarit qu'une fois passées par le pipeline de recadrage de STUDIO (`croppedUrl`/`backdropUrl`), qui n'existe que côté STUDIO. RADAR fournit les ingrédients (déjà fait, `carousel-package`) ; l'assemblage réel se fait donc côté STUDIO, une fois les images importées.

- **Nouvel écran `/titres/carrousel`** (STUDIO, fichier séparé de `/titres` — zéro risque sur le flux single-image déjà éprouvé) : récupère le paquet carrousel, importe les images, assemble et affiche une carte éditable par slide (aperçu réel du gabarit, texte modifiable, sélecteur d'image), bouton d'export.
- **Règle d'assignation image→slide (2.1)** : meilleure image → accroche, dernière (distincte si possible) → CTA, celles du milieu → développement. Le nombre de slides de dev réel est plafonné par le nombre d'images restantes, jamais par le texte seul.
- **Bug réel découvert en testant avec de vraies URLs, corrigé** : un `fetch()` navigateur vers une image externe est bloqué par CORS dès que l'hébergeur ne renvoie pas `Access-Control-Allow-Origin` (constaté avec de vraies sources) — le même problème existe en théorie dans le flux single-image existant (`titres/page.tsx`, import du prefill), non corrigé là pour ne rien risquer sur ce chemin déjà en production. Pour le carrousel : nouvelle route serveur `POST /api/images/import-urls`, qui fait le fetch **côté serveur** (pas soumis à CORS) et réutilise telles quelles les fonctions de recadrage déjà existantes (`cropToAspectSmart`, `retirerBandes`) — aucune logique de pipeline dupliquée.
- **Étape 2.6 (statut "traité" + vignette)** : vérifiée, déjà pleinement fonctionnelle sans aucun code nouveau — le dashboard RADAR (`page.tsx`) bascule déjà génériquement sur `exported_at && drive_url` pour afficher "Ouvrir dans Drive", et `drive_url` pointe désormais vers le **dossier** du carrousel (étape D). Le mécanisme existant couvrait déjà ce cas.
- **Étape 2.7 (traçabilité de la légende)** : callback STUDIO→RADAR élargi (`carouselTexts`, champ optionnel, absent = comportement single-image inchangé) ; nouvelle colonne `articles.carousel_slides` (JSON, additive) sur RADAR.
- **Bouton carrousel câblé** dans `events/[id]/page.tsx`, à côté du bouton single-image existant (renommé "Slide unique →" / nouveau "Carrousel →") — les deux formats restent disponibles, cohérent avec la confirmation "slide unique" pour les partenaires.
- **Vérifié de bout en bout, en conditions réelles** (2 apps démarrées, vraie liaison RADAR→STUDIO, vraies images externes) : paquet récupéré, 5 images importées et recadrées, 5 slides assemblées (1A → 3×1B → CTA) avec le bon texte, aperçu visuel correct (capture d'écran vérifiée). Suite de régression gabarits toujours 8/8 PASS après tous ces changements.

### Chantier 3 — génération A-Z du matin pour les 2 plus pertinentes

- Nouvelle fonction partagée `generateAndVerifyArticle()` (`articles.ts`) — élimine une duplication déjà présente entre `POST /api/generate` et ce nouveau chantier (génération + vérification numérique + stockage, auparavant écrit deux fois).
- `runMorningAutoGeneration()` (nouveau, `autoGenerate.ts`), appelée depuis `cron.ts` : ne s'exécute qu'à l'heure 8h (**TODO seuil provisoire**, à ajuster sur un usage réel), qu'une fois par jour (vérifie qu'aucun article `provenance='généré'` n'existe déjà pour aujourd'hui).
- Sélectionne les 2 meilleurs `events.score`, génère brief+article, applique le contrôle qualité existant (`verifyArticleAgainstBrief`). **Interdit absolu appliqué à la lettre** (`RADAR/CLAUDE.md` §2) : si le contrôle échoue (chiffres incohérents ou score de confiance sous 70 — **TODO seuil provisoire**), le brouillon est **supprimé**, jamais présenté à la revue humaine avec un avertissement.
- L'article reste au statut `draft` même quand tout passe — la validation humaine dans RADAR (bouton "Valider") n'est pas court-circuitée, seule la rédaction est automatisée.
- **Vérifié réellement, pas juste écrit** : test direct sur l'événement du jour classé n°2 (score 92) — le contrôle qualité a détecté un article incohérent (score de confiance 18, chiffres du brief absents de l'article) et la logique de rejet a été exercée manuellement pour confirmer qu'elle supprime bien le brouillon. Bon test négatif : la fonctionnalité qui existe pour ça a été prise en défaut par un vrai cas, pas un cas fabriqué.

### Chantier 4 — Corrections + Guide de style fusionnés

- `/corrections` porte désormais 3 onglets : Liste, Analyse des patterns (inchangés), **Règles actives** (contenu de l'ancien `/style-guide`, code adapté sans changement de comportement). Support `?tab=rules` pour lien direct.
- `/style-guide` devient une redirection vers `/corrections?tab=rules` — aucun lien existant cassé.
- Sidebar : une seule entrée ("Voix éditoriale" au lieu de "Corrections" + "Guide de style" séparés).
- Petit bonus cohérent avec la fusion : le bouton "Ajouter au Guide de Style" depuis une correction rafraîchit maintenant le compteur de l'onglet Règles actives sans changer d'onglet.
- **Vérifié dans le navigateur** (RADAR authentifié) : 3 onglets présents, onglet Règles actives affiche les vraies règles existantes, redirection `/style-guide` → `/corrections?tab=rules` fonctionnelle.

### Chantier 5 — Partenaires : cible structurée

- `partners.target_count` (nombre) + `partners.target_format` (`slide_unique` | `carrousel`) — migration additive, à côté de `deliverables` (texte libre conservé).
- Formulaire étendu (2 nouveaux champs), barre de progression `post_count / target_count` avec badge de format, affichée uniquement si une cible est définie.
- **Vérifié dans le navigateur** : partenaire de test créé avec cible 4/carrousel, barre "0 / 4 publications · carrousel" affichée correctement, donnée nettoyée après vérification.

---

## Mise à jour — 2026-08-27 (suite) : P0/P1/P2 — rendre visible ce qui tournait déjà en silence

Suite à l'audit UI (captures dashboard + STUDIO), plan reprioritisé par l'utilisateur et exécuté intégralement, avec vérification visuelle réelle à chaque étape (pas juste le backend).

### P0 — risque silencieux du bouton "Ouvrir STUDIO"

Vérifié avant d'agir : router ce bouton via `createManualArticle()` s'est révélé plus invasif que supposé — cette fonction exige un `event_id` réel (donc un brief existant), que ce bouton générique n'a par construction jamais. Fabriquer un faux événement pour ce cas aurait pollué la veille. **Retenu : l'alternative que tu avais toi-même proposée** — label changé en "Ouvrir STUDIO (sans lien)" + tooltip explicite ("non traçable, non associable à un partenaire"). Vérifié dans le DOM rendu, pas juste écrit.

### P1 — rendre visible ce qui tourne déjà

- **Langue/source à côté du score (`/events`)** : la donnée existait déjà (`getEventsWithItems` calcule `feed_names` depuis longtemps) mais n'était jamais lue côté UI — vrai "quick win", zéro nouvelle requête. Vérifié en capture : "Toyota Global +9", "Bring a Trailer", "Hagerty +2" apparaissent maintenant à côté de chaque score, rendant immédiatement visible le déséquilibre de sources signalé plus tôt.
- **Badge "généré auto"** : le badge de provenance existait déjà (générique, gris) — rendu visuellement distinct (vert + icône) uniquement pour `provenance='généré'`, sur `/events/[id]`. Pas d'emoji (🤖 remplacé par l'icône vectorielle `Sparkles` déjà du jeu d'icônes — `icons.ts` interdit explicitement l'emoji dans l'UI, une première version l'utilisait par erreur, corrigée avant de committer).
- **Section "Brouillons du matin"** : nouvelle, sur le modèle de "Articles validés". Nécessitait un vrai ajout de données — les brouillons rejetés par le contrôle qualité sont supprimés (§2 absolu), donc invisibles côté `articles` ; ajout de 2 compteurs sur `pipeline_runs` (`auto_gen_attempted`, `auto_gen_passed`) écrits par `runMorningAutoGeneration`, lus par le dashboard. Affiche "X/Y ont passé le contrôle qualité" + la liste de ceux qui ont passé, ou un message explicite si aucun n'est passé. **Testé les deux branches réellement** (données de test insérées, capturées, nettoyées) : avec 1 brouillon passé et avec 0.
- **Bug réel trouvé et corrigé en testant** : `generateArticleSmart` (repli utilisé quand `generateChained` échoue) plantait systématiquement (`buildDirectPrompt(brief, brief, ...)` au lieu de `buildDirectPrompt(type, brief, ...)`) — une erreur de code pré-existante, sans lien avec cette session, mais qui compromettait directement la fiabilité du chantier 3 que je venais de construire et bloquait ma propre vérification. Corrigée (1 ligne) — au passage, elle faisait aussi disparaître la dernière erreur de type pré-existante signalée depuis le début de cette session.

### P2 — "Articles validés" au lieu de "Prêt à publier"

Retenu l'option (b) + un ajout minimal : renommé partout (Sidebar, `/ready`, dashboard) pour ne plus laisser croire que la liste se vide après export — **et** ajouté un badge "Exporté" + le même bouton "Ouvrir dans Drive" déjà présent sur le dashboard, manquant sur `/ready` (vérifié : c'était bien absent là, une vraie incohérence entre les deux vues de la même donnée). Pas de nouvel onglet "Historique" — aurait ajouté une destination de navigation pour un besoin non confirmé.

### Vérification systématique "l'UI suit-elle" — pas seulement le backend

Chaque point a été vérifié en conditions réelles dans le navigateur (Playwright, capture d'écran ou lecture DOM), pas seulement par `tsc`/lint : le bouton STUDIO (tooltip lu dans le DOM rendu), les 2 branches de la section brouillons du matin, le rendu des noms de flux sur `/events`, le renommage sur `/ready` et le dashboard. Données de test créées pour ces vérifications, systématiquement supprimées après coup.

---

## Mise à jour — 2026-08-27 (suite) : Agent A (RADAR) — thème rouge de marque + terrain Claude

Rôle "Agent A" pris pour RADAR uniquement, découpe en 2 agents par app validée (zéro fichier partagé avec STUDIO/Agent B). Deux tâches faites et vérifiées.

### Thème couleur — pas un remplacement mécanique aveugle, un vrai bug trouvé

Vérifié avant d'agir (pas supposé) : `--brand`/`--accent` étaient déjà rouges (`#E62020`) mais **pas un des 3 rouges confirmés** — remplacés par `#CA3E3E` (actif/texte, le plus clair des trois, nécessaire pour la lisibilité en encre sur fond sombre déjà documentée dans le commentaire du fichier) / `#8F2626` (hover) / `#8B1D1D` (pressed, la teinte exacte mesurée sur le logo).

**Découverte en auditant `--studio` (violet)** : ce token est correctement violet à 3 endroits légitimes (le lien Sidebar vers STUDIO, les boutons "Slide unique"/"Carrousel" — vraie navigation inter-app, comportement voulu, non touché) — mais **mal utilisé à 6 autres endroits** qui n'ont rien à voir avec STUDIO : le bouton "Ajouter au Guide de Style" (`/corrections` et 2 fois sur `/events/[id]`), le bouton "Copier l'URL" sur `/drive`, le spinner de génération d'article, et le bouton/champ "Ajustement rapide". C'était très exactement ton observation "boutons violets (corrections)" — confirmée, corrigée (passés en rouge de marque), pas un remplacement au hasard. Vérifié en capture avant/après.

### Terrain Claude préparé, Groq reste actif

Nouveau module `lib/llmProvider.ts` : point d'entrée unique `chatComplete()`, bascule sur `LLM_PROVIDER` (défaut `'groq'`, comportement inchangé — vérifié par un vrai appel qui a atteint la vraie limite de quota Groq, donc passe bien par le vrai client). `LLM_PROVIDER=claude` sans `ANTHROPIC_API_KEY` lève une erreur explicite immédiate, jamais un repli silencieux vers un autre fournisseur — vérifié. Les 5 appels Groq de `lib/llm.ts` passent maintenant tous par ce point d'entrée unique (`generate`, `generateChained` ×2, `generateArticleSmart`, `generateCarouselParagraphs`) ; `generateTitlesSmart` (appel `fetch` brut, config JSON-mode spécifique) volontairement non touché — hors périmètre de cette préparation, à traiter séparément si besoin. `@anthropic-ai/sdk` ajouté (MIT, gratuit, officiel — conforme aux 3 critères `RADAR/CLAUDE.md` §3). Implémentation Claude non testée faute de clé, marqué explicitement comme tel dans le code (protocole anti-hallucination §4.1).

### Vérifications

`tsc`/`eslint` propres (parité exacte avec la base pré-session, vérifiée par comparaison `git stash`). Suite STUDIO non concernée (aucun fichier touché côté STUDIO ce tour-ci). Screenshots avant/après pris pour le thème, nettoyés après usage. Le prompt complet pour l'Agent B (STUDIO) a été remis à l'utilisateur en réponse directe, pas dans ce document.

---

## Mise à jour — 2026-08-27 (suite) : plan Drive ↔ Calendrier/Échéances + réinitialisation

### Réinitialisation pour démonstration

Sur demande explicite : `articles`, `briefs`, `event_items`, `events`, `item_images`, `items`, `pipeline_runs` et `calendar_events` vidés (script `scripts/reset-pipeline-data.ts`, conservé pour un futur reset). Conservé intact : `feeds` (57), `partners`, `corrections`, `style_rules`, `google_tokens`, `drive_files`.

**Bug bloquant trouvé et corrigé en relançant le pipeline** : `translate.ts` retentait un appel LLM raté toutes les 10s **sans aucune limite** — avec le quota Groq quotidien épuisé par les tests de cette session, ça aurait bloqué indéfiniment. Plafonné à 2 tentatives, repli sur le titre anglais ensuite (comportement déjà prévu, juste jamais atteint).

### Plan — lier Drive aux échéances/calendrier

**Constat qui change la difficulty réelle du chantier** : `calendar_events` a déjà une colonne `content_id`, et `articles.drive_url` est déjà rempli à l'export. Le lien technique événement-calendrier → dossier Drive **existe déjà en base**, il n'est simplement jamais affiché. Deux chantiers séparés, de difficulté très différente :

**A — Afficher le lien Drive déjà présent (quasi gratuit)**
- `getDashboardAgenda()`/l'API calendrier : joindre `articles.drive_url` via `calendar_events.content_id = articles.content_id`.
- Sur chaque carte calendrier/échéance dont l'article est exporté : bouton "Ouvrir le dossier Drive" (même pattern que le dashboard/`/ready` déjà en place).
- Aucune nouvelle donnée, aucun risque — un JOIN + un bouton conditionnel.

**B — Explorateur Drive visuel intégré (le vrai manque, plus lourd)**
- **Prérequis qui n'est pas du code** : un vrai client OAuth Google Cloud (Console Google Cloud → identifiants OAuth 2.0, écran de consentement configuré) — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` sont vides aujourd'hui. Ça ne se fait pas depuis ce siège, ça demande un accès à ton compte Google Cloud. Sans ça, tout le reste de B reste inerte.
- Une fois les identifiants réels obtenus : le flux OAuth existe déjà (`lib/google-auth.ts`, bouton "Connecter Google Drive" sur `/drive`) — rien à reconstruire, juste à activer.
- Nouveau composant "explorateur" : liste des dossiers Drive de l'utilisateur connecté (`drive.files.list`, déjà une dépendance du projet via `googleapis`), navigation par dossier, sélection.
- Nouvelle action "Lier un dossier Drive" sur une carte calendrier/campagne partenaire : stocke le lien choisi (nouvelle colonne, ex. `calendar_events.manual_drive_url`, additive) — pour les cas où l'export ne vient pas de STUDIO (dossier créé à la main, campagne partenaire externe).
- Champ d'application recommandé, sans sur-construire : le calendrier et les campagnes partenaires (les deux endroits où "quel dossier correspond à quelle date" a un vrai sens) — pas une refonte de `/drive` en gestionnaire de fichiers complet.

**Ordre recommandé** : A d'abord (aucun prérequis externe, gain immédiat) ; B seulement une fois les identifiants OAuth réels obtenus — sinon c'est du code qui attend une clé, comme Claude actuellement.

### Pipeline relancé — confirmation

364 événements réels ingérés, **tous avec un score > 0** (confirme le correctif de scoring de tout à l'heure, plus un incident isolé) — quelques titres déjà traduits en français malgré le quota Groq presque épuisé (le plafond de tentatives a permis de finir sans bloquer). **Bug annexe trouvé, non bloquant** : `cacheCleanup.ts` lève une erreur `foreign key mismatch` sur `stats_imports` en fin de cycle (déjà attrapée, juste logguée, pipeline pas affecté) — signalé, pas corrigé dans cette passe.

### UI/UX — première amélioration livrée, méthode changée sur demande

Sur demande explicite, plus de service cloud tiers (Superdesign) : les principes viennent de deux dépôts fournis (`bitjaru/styleseed`, `educlopez/ui-craft`), lus directement (READMEs + fichiers de référence `dashboard.md`, `finish-bar.md`, `color.md`, `layout.md`, `craft-intent.md`) plutôt qu'installés comme systèmes actifs dans le projet — les règles sont appliquées à la main, aucune nouvelle dépendance ajoutée.

**Premier correctif, le plus flagrant** : les 3 tuiles du dashboard (Événements/En rédaction/Validés) avaient exactement le même poids visuel — repéré par `ui-craft/dashboard.md` comme *"the single most recognizable AI-generated dashboard shape"* (grille de cartes égales, l'œil ne sait où se poser). Corrigé : `StatTile` accepte un prop `primary`, appliqué à "Validés" (l'indicateur d'accomplissement du jour) — fond teinté à SA propre couleur sémantique (vert succès, jamais le rouge de marque réservé aux actions, cf. le commentaire déjà présent dans `ui/index.tsx`), chiffre à 34px contre 22px pour les deux autres (ratio 1,5× minimum recommandé par `layout.md`). Vérifié visuellement (donnée de test insérée puis supprimée) : l'œil va bien directement sur "Validés" en un coup d'œil.

**Reste à faire si tu veux continuer** (matière déjà collectée, pas encore appliquée) : différenciation similaire sur les lignes de "En production"/"Articles validés" (points de statut colorés plutôt que texte plat), vérification des 3 niveaux d'élévation de surface (déjà probablement conformes, à re-mesurer), passage en revue des 10 points de la "Finish Bar" d'ui-craft sur une page à la fois plutôt que tout l'app d'un coup (recommandation du dépôt lui-même : "run it on a vertical slice, ship, repeat").

---

## Mise à jour — 2026-08-27 (suite) : étape 2 — robustesse, sécurité, parcours (en cours)

### Concurrence — SQLite déjà en WAL, un vrai trou comblé

`journal_mode = WAL` déjà actif (bon, autorise plusieurs lecteurs pendant une écriture). **Manquant : `busy_timeout`** — sans lui, deux écritures qui se chevauchent exactement échouent immédiatement (`SQLITE_BUSY`) plutôt que d'attendre. Ajouté (`busy_timeout = 5000`). **Testé réellement, pas supposé** : 5 vrais processus Node séparés (pas de simples promesses dans le même process — un vrai test multi-process) écrivant simultanément sur le même fichier, 500 écritures au total, 0 échec, avec et sans le correctif sur cette machine — le correctif n'a pas fait échouer de test existant, et reste une bonne pratique standard SQLite même si mon test n'a pas réussi à provoquer la collision qu'il prévient (charge/disque insuffisants ici pour la déclencher). Pas de découverte, une garantie posée en prévention.

### Revue de sécurité — une vraie faille haute sévérité trouvée et corrigée

Sous-agent dédié lancé sur le diff complet des deux apps (méthodologie du skill `security-review` : identification puis filtrage des faux positifs). **1 faille confirmée :**

**SSRF (Server-Side Request Forgery) — `studio/src/app/api/images/import-urls/route.ts`** (route que j'ai construite cette session pour le carrousel). Elle acceptait n'importe quelle URL d'un utilisateur authentifié (mot de passe partagé `work`) et la récupérait **depuis le serveur**, sans valider le schéma, sans résoudre l'hôte pour écarter les cibles privées, sans vérifier le type de contenu avant traitement — contrairement à sa route sœur `api/images/import/route.ts` (protégée par un secret serveur-à-serveur distinct, elle). Un utilisateur aurait pu faire interroger par le serveur le service de métadonnées cloud (`169.254.169.254`, expose des identifiants sur Oracle/AWS/GCP) ou tout autre service interne au VPC.

**Corrigé** : validation du schéma (http/https uniquement), résolution DNS de l'hôte avec rejet des plages privées/loopback/lien-local/métadonnées AVANT le fetch, `redirect: "manual"` (empêche le contournement classique où l'hôte public redirige vers une cible privée après coup), validation du type de contenu (`image/*`) avant traitement. **Vérifié avec 3 cas réels** : une vraie image externe passe toujours (1 image importée), le service de métadonnées + localhost + l'autre app (port 3000) sont bloqués (0 image), un schéma `file://` est bloqué (0 image). Suite de régression gabarits toujours 8/8 PASS après le correctif.

**Trouvaille annexe** : la clé Groq codée en dur (déjà signalée en début de session, jamais corrigée) avait été recopiée telle quelle dans le nouveau `lib/llmProvider.ts` au lieu d'être éliminée. Corrigé : plus de valeur de repli, la variable d'environnement est désormais obligatoire (erreur explicite au démarrage si absente).

### Parcours utilisateur — un maillon testé, une observation UX (pas un bug)

Testé en conditions réelles (vraie session, vrai navigateur) : Dashboard → clic "Rédiger" → fiche événement → sélection de l'article → liens "Slide unique"/"Carrousel" → décodage du lien pour vérifier que le `content_id` traverse tout le trajet sans se perdre. **`content_id` intact de bout en bout, vérifié par décodage réel du lien produit.**

**Observation, pas un bug** : un article n'est jamais présélectionné automatiquement même s'il n'y en a qu'un — l'opérateur doit cliquer dessus pour faire apparaître le panneau de revue (et donc les boutons Slide unique/Carrousel). Ça a fait échouer mon premier essai de test avant que je comprenne que c'était le comportement voulu. À signaler si ça déroute aussi de vrais utilisateurs — présélectionner automatiquement quand il n'y a qu'un seul brouillon serait un changement mineur, pas fait dans cette passe.

### Reste à couvrir avant de considérer l'étape 2 terminée

- Parcours complet côté STUDIO (login → `/titres` → export ; `/titres/carrousel` de bout en bout avec un vrai export une fois le quota Groq/Drive disponibles).
- `/corrections` (3 onglets), `/partenaires` (CRUD), `/calendrier`, `/drive`, `/stats` — navigation et absence d'erreur, pas encore repassés en revue depuis les derniers changements.
- Charge à 5 utilisateurs sur un scénario plus réaliste que des écritures brutes (vraies requêtes HTTP concurrentes sur les routes API).
- Checklist "même en prod" (Point 7 déjà identifié comme le plus obligatoire) : parité env local/prod, logs d'erreur consultables, Cloudflare Access limité aux comptes prévus.

### Vérifications transverses finales

- `npx tsc --noEmit` propre sur RADAR et STUDIO (seules les 2 erreurs pré-existantes déjà signalées plus haut dans ce document subsistent, non liées à ce chantier).
- `npx eslint` propre sur tous les fichiers touchés cette session (2 erreurs réelles trouvées et corrigées : un `setState` synchrone dans un effet React, une apostrophe non échappée — toutes deux dans le nouvel écran carrousel).
- `scripts/verify-gabarits-etape4.mjs` : 8/8 PASS après l'ensemble des changements de cette session.
- Toutes les données de test créées pendant les vérifications ont été supprimées après usage.
