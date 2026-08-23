# TEST RADAR — Rapport complet + Plan restant

**Date :** 21 août 2026
**URL test :** http://localhost:4000
**Mot de passe :** `lma-dashboard-dev`
**Passphrase partenaires :** `lma-partners-dev`
**Noms :** Alexandre, Baptiste, Clément, David, Emmanuel, François, Gabriel, Hugo, Ioannis, Julien

---

## PARTIE 1 — BUGS DÉCOUVERTS ET CORRIGÉS

### BUG 1 : Modèle LLM Groq introuvable
- **Symptôme :** 404 `{"error":{"message":"The model llama-3.3-70b-versatile does not exist"}}`
- **Cause :** Le modèle `llama-3.3-70b-versatile` a été retiré de Groq
- **Fix :** Remplacé par `openai/gpt-oss-120b` (seul gros modèle texte dispo sur Groq)
- **Fichier :** `src/lib/llm.ts:72`

### BUG 2 : Calendar — "SQLite3 can only bind numbers, strings..."
- **Symptôme :** Création d'événement calendrier impossible
- **Cause :** Les champs optionnels (description, end_date, partner_id...) envoyaient `undefined` au lieu de `null`
- **Fix :** `data.description ?? null` pour tous les champs optionnels
- **Fichier :** `src/lib/calendar.ts:42-52`

### BUG 3 : Clustering = 1 seul événement pour 52 items
- **Symptôme :** Tous les articles Toyota groupés dans un seul événement
- **Cause :** Similarité embedding trop basse (0.75) + modèle `multilingual-e5-small` ne différencie pas bien les articles du même feed
- **Fix :** Seuil hybrid : embedding (0.88) + title overlap (0.15). Maintenant **22 événements** logiques
- **Fichier :** `src/lib/scoring.ts:5-17`

### BUG 4 : event_items = 0 lignes (clustering cassé)
- **Symptôme :** Aucun item lié aux événements → pas de sources, pas d'images, pas de briefs
- **Cause :** `DELETE FROM events` bloqué par FK constraint de `stats_imports`
- **Fix :** `db.pragma('foreign_keys = OFF')` avant le nettoyage, `ON` après
- **Fichier :** `src/lib/scoring.ts:38-42`

### BUG 5 : Urgent ⚡ ne se désactive pas
- **Symptôme :** Cliquer ⚡ une 2e fois ne retire pas l'urgence
- **Cause :** Le handler envoyait toujours `force_urgent: true`
- **Fix :** Toggle on/off — vérifie l'état actuel avant d'envoyer
- **Fichier :** `src/app/events/page.tsx:60-76`

### BUG 6 : Pipeline ingest ne mettait pas à jour les événements
- **Symptôme :** Nouvelles actualités importées mais les événements ne changeaient pas
- **Cause :** `/api/ingest` ne lançait que RSS + visual search, PAS le clustering
- **Fix :** Ajouté les étapes 2 et 3 (embed + cluster + score) dans `/api/ingest`
- **Fichier :** `src/app/api/ingest/route.ts:38-47`

### BUG 7 : Article LLM "Titre non généré" + 0 mots
- **Symptôme :** `parseGeneratedArticle()` retournait "Titre non généré" et contenu vide
- **Cause :** Parser ne gérait pas le format markdown `**Titre :**` du modèle `openai/gpt-oss-120b` + préfixes `Titre:`, `Chapô:` non nettoyés
- **Fix :** `cleanLine()` supprime `**`, `###`, `Titre:`, `Chapô:`, `Chapeau:` ; fallback si pas de titre trouvé
- **Fichier :** `src/lib/articles.ts:141-174`

### BUG 8 : Régénération crée des doublons d'articles
- **Symptôme :** Cliquer "Générer" 2× crée 2 articles au lieu de remplacer
- **Cause :** Le code INSERT ne supprimait pas les brouillons existants
- **Fix :** `DELETE FROM articles WHERE event_id = ? AND status = 'draft'` avant INSERT
- **Fichier :** `src/lib/articles.ts:73-76`

### BUG 9 : Article tronqué (79 mots au lieu de 200+)
- **Symptôme :** Le LLM renvoie parfois une réponse courte/tronquée (~100 tokens)
- **Cause :** Modèle flaky — certaines réponses sont vides ou très courtes
- **Fix :** Retry automatique si `wordCount < 10` et `content.length < 100`
- **Fichier :** `src/lib/articles.ts:62-71`

### BUG 10 : Images JS non chargées (toyota-racing-newsroom.com)
- **Symptôme :** 6 items sans images malgré des images sur la page
- **Cause :** Playwright attendait 2s fixes après `domcontentloaded` — trop court pour les sites JS lourds
- **Fix :** Stratégie progressive : `networkidle` (20s) → scroll pour lazy-load → attente sélecteurs JS → `waitForLoadState('networkidle')` final
- **Fichier :** `src/lib/visualSearch.ts:166-230`

### BUG 11 : Pas de détection de doublons proches dans les flux RSS
- **Symptôme :** Un même article publié avec un titre légèrement différent crée un doublon
- **Cause :** `INSERT OR IGNORE` ne détecte que les titres identiques (UNIQUE constraint)
- **Fix :** Vérification Jaccard (similarité mots ≥ 0.75) sur les 500 derniers items avant insertion
- **Fichier :** `src/lib/rss.ts` — fonctions `titleSimilarity()`, `isNearDuplicate()`, `storeItems()`

---

## PARTIE 2 — RÉPONSES À TOUTES LES QUESTIONS

### Q1 : C'est quoi les "Tâches partenaire" sur l'accueil ?
Elles n'apparaissent que quand il y a des **partenaires avec une campagne active** dans la table `partners` (campaign_end >= aujourd'hui). Si pas de partenaire → rien ne s'affiche. Pour les voir : va sur `/partenaires` avec la passphrase `lma-partners-dev`, crée un partenaire avec dates de campagne.

### Q2 : Pourquoi pas d'items urgents ?
Urgent = articles en **brouillon depuis >48h**. Si pas de brouillon vieux de 2+ jours → rien d'urgent. C'est normal.

### Q3 : C'est quoi un brief ?
Un brief = **résumé structuré généré par l'IA** (PAS un article). Il contient :
- **Headline** : titre accrocheur
- **Lede** : premier paragraphe
- **Body** : 3-4 paragraphes factuels
- **Facts** : chiffres vérifiables avec sources et niveau de confiance
- **Angle suggéré** : comment traiter le sujet

Le brief EST généré par du code (pas de LLM), donc ça marche toujours. L'article est ensuite généré à partir du brief via le LLM.

### Q4 : Pourquoi "Aucun visuel trouvé" sur certains événements ?
Deux causes :
1. **event_items vide** (0 liaison) → corrigé, les items sont maintenant liés
2. **Sites JS lourds** (toyota-racing-newsroom.com) : ces sites chargent les images dynamiquement. **Fix appliqué** : Playwright utilise maintenant `networkidle` (20s) + scroll pour lazy-load + attente sélecteurs JS + `waitForLoadState` final. Les 6 items précédemment sans images devraient maintenant en trouver.
3. **Doublons proches** : un même article publié 2× avec un titre légèrement différent créait un doublon. **Fix appliqué** : détection Jaccard (similarité mots ≥ 0.75) avant insertion RSS.

### Q5 : STUDIO link ne marche pas
Normal — STUDIO n'est pas lancé sur `localhost:3001`. Pour tester : `cd /home/land/media_autombile/studio && npm run dev`

### Q6 : C'est quoi les Corrections ?
Le système suit les corrections manuelles que tu fais aux articles IA :
1. Tu génères un article avec l'IA
2. Tu le corriges (modifies le texte)
3. Le système enregistre la paire "généré ↔ corrigé"
4. Il détecte des patterns récurrents
5. Tu peux ajouter ces patterns au Guide de Style

**Le Guide de Style est pris en compte ?** OUI — `buildStyleRulesPrompt()` injecte les règles dans le prompt système du LLM.

### Q7 : Vue personnelle vs globale
Il n'y a qu'**une seule vue** (globale). Tout le monde voit le même dashboard. Le filtre "personnel" se fait via `assigned_to` : ton nom apparaît quand tu prends en charge un événement.

### Q8 : ⚡ Urgent — c'est esthétique ou fonctionnel ?
C'est **fonctionnel** :
- Met `urgent_until = maintenant + 24h`
- L'événement apparaît en haut de l'accueil dans la colonne "Urgent" avec badge rouge
- Expire automatiquement après 24h
- Le 2e clic retire maintenant l'urgence (corrigé)

### Q9 : Assignment — l'équipe voit vraiment ?
- **OUI** : ton nom apparaît en badge bleu sur l'accueil ET la page événement
- **NON** : pas de notification push. C'est passif — les gens voient qui a pris en charge en regardant le dashboard
- Suffisant pour 5-10 personnes qui se parlent IRL

### Q10 : C'est quoi les Tags ?
Labels libres que tu ajoutes aux événements (ex: "WEC", "Electrique"). Ajoutés via le champ texte + Enter sur la page événement. Supprimés via × sur le chip.

### Q11 : Pourquoi pas de bouton "Créer manuellement" ?
Le bouton n'apparaît que **quand un brief existe**. Si le brief n'est pas encore généré → il n'y a pas de bouton. Génère d'abord le brief (ou le brief+article en 1 clic avec "Brief + Article").

### Q12 : CSV export corrections — à quoi ça sert ?
Backup/audit de toutes les corrections. Format : ID, Article, Texte généré, Texte corrigé, Type, Pattern, Notes, Date. Utile pour garder une trace et analyser les erreurs récurrentes de l'IA.

### Q13 : Stats Instagram — ça marche sans Instagram ?
**OUI** — tu peux créer un CSV factice avec des données. Format attendu : Post ID, Caption, Timestamp, Type/Image/Format, Likes, Comments, Shares, Saves, Reach, Impressions. Les taux sont recalculés depuis les chiffres bruts.

### Q14 : Drive — connection Google ?
**NON** — c'est un lecteur de dossier **local** (`drive-sync/`). Pas de connexion Google Drive, pas d'API externe. Tu mets des fichiers dans le dossier avec ton OS, l'interface les liste. Lecture seule (pas d'upload/suppression). Pas lié au calendrier.

### Q15 : Déploiement prod — RADAR + STUDIO ensemble ?
RADAR et STUDIO sont 2 apps séparées. En prod :
```
nginx/Caddy (port 80/443)
├── / → STUDIO (port 3001)
└── /radar → RADAR (port 4000)
```
Les boutons "Créer un post" sont des liens externes vers STUDIO avec params URL pré-remplis.

### Q16 : L'outil s'améliore-t-il au fil du temps ?
**Pas encore automatiquement.** Voici l'état :
| Mécanisme | Améliore ? | Comment |
|---|---|---|
| Guide de Style | OUI | Tu ajoutes des règles → le LLM les respecte |
| Stats Instagram | NON | Affiche les métriques mais ne les utilise pas |
| Corrections | OUI (manuel) | Tu analyses les patterns → tu ajoutes au Guide |
| Visual Search | NON | Cherche des images mais n'apprend pas des rejets |

Pour améliorer automatiquement, il faudrait : stats → prompt, rejet visuel → scoring, corrections → prompt. Pour l'instant c'est **manuel et explicite** (plus sûr, pas de dérive).

---

## PARTIE 3 — RÉSULTATS PIPELINE

### État actuel de la base
| Table | Nombre |
|---|---|
| Items (articles RSS) | 53 |
| Événements | 22 |
| event_items (liens) | 53 |
| Items avec images | 47 |
| Items sans images | 6 (sites JS dynamiques) |

### Pipeline runs
| Run | Type | Items | Events | Images | Date |
|---|---|---|---|---|---|
| #1 | full | 2 | 0 | 40 | 05:20 |
| #2 | full | 0 | 0 | 0 | 06:00 (cron) |
| #3 | full | 1 | 22 | 0 | 08:16 |

### Événements top (par nombre de sources)
| Event | Sources |
|---|---|
| Tateshina Meeting: Zero Traffic Accidents | 17 |
| Rally del Paraguay: Preview | 8 |
| 6 Hours of Sao Paulo: Race | 5 |
| TMC Organizational Structure | 3 |

---

## PARTIE 4 — PLAN DE TEST RESTANT

### Phase 5 : Écriture d'article ✅ TESTÉ
- [x] Parser fix : gère `**bold**`, `Titre:`, `Chapô:` → titre/chapeau corrects
- [x] Génération : 275 mots, contenu complet, 3 paragraphes + conclusion
- [x] Validation : status → "validated", provenance → "généré-relu"
- [x] STUDIO link : `http://localhost:3001?prefill=<base64>` généré correctment
- [x] Régénération : remplace l'article existant (pas de doublon)
- [x] Retry automatique si réponse LLM vide/tronquée

### Phase 6 : Corrections
1. Générer un article
2. Le modifier manuellement
3. Aller sur `/corrections` → vérifier que la correction apparaît
4. Cliquer "Ajouter au Guide de Style"
5. Aller sur `/style-guide` → vérifier que la règle est là
6. Régénérer un article → vérifier que la règle est respectée

### Phase 7 : Calendar ✅ TESTÉ
- [x] Création avec tous les champs → OK
- [x] Création avec champs optionnels null → OK (SQLite bind fix validé)
- [x] CHECK constraint sur event_type fonctionne

### Phase 8 : Partenaires
1. Se reconnecter avec passphrase `lma-partners-dev`
2. Aller sur `/partenaires`
3. Ajouter un partenaire
4. Associer un article validé
5. Générer le PDF rapport

### Phase 9 : Visual Search C3 ✅ TESTÉ
- [x] Rejet : `POST /api/visual-search/reject` avec `item_id` + `rejected_url` → OK
- [x] Item marqué `image_rejected=1`, `image_url=NULL`, `rejection_reason` stockée
- [x] Re-scrape avec blacklist exécuté
- [x] Réponse `null` si aucun alternatif trouvé (comportement attendu)
- [x] `getItemsWithoutImages()` exclut les items rejetés

### Phase 10 : Stats Instagram
1. Créer un CSV factice avec des données :
```csv
Post ID,Caption,Timestamp,Type,Likes,Comments,Shares,Saves,Reach,Impressions
test-1,Découvrez la GR86,2026-08-15,Image,245,12,5,34,3200,4500
test-2,Le nouveau RAV4,2026-08-16,Video,180,8,3,22,2800,3900
test-3,GR Yaris en rallye,2026-08-17,Carousel,320,25,15,67,4500,6200
```
2. Aller sur `/stats`
3. Dropper le CSV
4. Vérifier que les KPIs et graphiques s'affichent

### Phase 11 : Drive
1. Créer des fichiers dans `drive-sync/`
2. Aller sur `/drive`
3. Cliquer "Synchroniser"
4. Vérifier que les fichiers apparaissent
5. Naviguer dans les dossiers

### Phase 12 : Performance
1. Mesurer temps de chargement de `/` (DevTools)
2. Mesurer temps de `/events/{id}`
3. Vérifier les appels réseau (DevTools Network)

### Phase 13 : Pipeline automatique
1. POST `/api/ingest` → vérifier que les 3 étapes s'exécutent (items + images + clustering)
2. Vérifier que les événements sont mis à jour après le pipeline
