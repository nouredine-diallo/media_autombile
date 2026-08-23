# Étape 2 — Plan d'implémentation détaillé

## Objectif
Transformer le Dashboard d'un outil de visualisation en **outil de production** qui élimine les tâches répétitives et réduit la charge cognitive des utilisateurs.

---

## 2.1 — Pré-remplissage STUDIO (Zéro saisie)

### Persona : Le Rédacteur / Community Manager
### Stress : "5 allers-retours copier-coller entre Dashboard et STUDIO"

### Architecture technique

**Flux de données :**
```
Article validé → Encodage Base64 → URL STUDIO → Décodage STUDIO → Affichage
```

**Format de données encodées :**
```typescript
interface StudioPrefillData {
  t: string;      // titre (truncaté à 150 car.)
  s: string;      // source (feed name)
  i: string;      // image URL (du RSS item)
  c: string;      // content_id
  b: string;      // brief headline (si disponible)
}
```

**Implémentation :**
1. Créer `src/lib/studio-prefill.ts` — fonctions d'encodage/décodage
2. Modifier le bouton "Créer un post" dans `events/[id]/page.tsx`
3. Modifier le bouton similaire dans `ready/page.tsx`
4. Gérer le fallback : si pas d'image → logo marque sur fond neutre

**Anti-panique (pas d'image) :**
- Détecter la marque via auto-tagging (étape 2.2)
- Utiliser un gabarit texte avec fond dégradé neutre
- L'URL contient `i=empty` → STUDIO affiche le gabarit "Texte"

### Fichiers à créer/modifier
- `src/lib/studio-prefill.ts` (nouveau)
- `src/app/events/[id]/page.tsx` (modifier bouton)
- `src/app/ready/page.tsx` (modifier bouton)

---

## 2.2 — Auto-Tagging au RADAR (Tri cognitif)

### Persona : Le Rédacteur en Chef
### Stress : "40 événements à lire en diagonale pour savoir lesquels donner à qui"

### Architecture technique

**Dictionnaire de tags :**
```typescript
const TAG_RULES = [
  { tag: 'Électrique', patterns: [/(EV|bZ4X|électrique|electrique|autonomie|borne|recharge|kWh)/i] },
  { tag: 'Toyota', patterns: [/(Toyota|Lexus)/i] },
  { tag: 'Peugeot', patterns: [/(Peugeot|e-208|e-2008|e-308|e-3008)/i] },
  { tag: 'Renault', patterns: [/(Renault|Mégane E-Tech|Scenic|Austral)/i] },
  { tag: 'Stellantis', patterns: [/(Stellantis|Opel|Fiat|Jeep|Citroën|DS)/i] },
  { tag: 'Sécurité', patterns: [/(NCAP|sécurité|airbag|rappel|frein)/i] },
  { tag: 'Ventes', patterns: [/(ventes|chiffre|montée|baisse|marché|part de marché)/i] },
  { tag: 'Concept', patterns: [/(concept|prototype|futur|vision|showcar)/i] },
  { tag: 'Sport', patterns: [/(GTI|RS|AMG|M Performance|cupra|sport)/i] },
  { tag: 'Prix', patterns: [/(prix|€|euros|tarif|coût)/i] },
];
```

**Implémentation :**
1. Créer `src/lib/auto-tag.ts` — dictionnaire + fonction de tag
2. Modifier `src/lib/scoring.ts` — appeler auto-tag après clustering
3. Ajouter table `event_tags` dans le schéma
4. API DELETE `/api/events/tags` pour supprimer un tag
5. Modifier l'affichage des événements (homepage + events page) avec chips

**Anti-panique (tag faux) :**
- Chaque tag est une chip avec bouton (×)
- Un clic supprime le tag de la base
- Feedback immédiat sans rechargement

### Fichiers à créer/modifier
- `src/lib/auto-tag.ts` (nouveau)
- `src/lib/db.ts` (ajouter table event_tags)
- `src/lib/scoring.ts` (appeler auto-tag)
- `src/app/api/events/tags/route.ts` (nouveau)
- `src/app/page.tsx` (afficher chips)
- `src/app/events/page.tsx` (afficher chips)

---

## 2.3 — Dropzone Intelligente pour les Stats

### Persona : La Direction / Responsable Partenaires
### Stress : "Je déteste faire de l'admin"

### Architecture technique

**UX Flow :**
```
Glisser un fichier → Overlay semi-transparent → Drop → Parse → Toast succès → Graphiques mis à jour
```

**Implémentation :**
1. Créer `src/components/SmartDropzone.tsx` — overlay global
2. Modifier `src/app/stats/page.tsx` — utiliser SmartDropzone
3. Gestion d'erreurs via Toast (pas de page d'erreur)
4. Validation côté client avant upload

**Anti-panique (mauvais format) :**
- Toast rouge : "Format refusé : CSV Instagram attendu"
- Toast orange : "Colonne 'Engagement' introuvable"
- Les graphiques précédents restent affichés
- Pas de page blanche

### Fichiers à créer/modifier
- `src/components/SmartDropzone.tsx` (nouveau)
- `src/app/stats/page.tsx` (intégrer dropzone)

---

## 2.4 — Micro-Correction LLM

### Persona : Le Rédacteur
### Stress : "Si je Rejeter, je dois tout réécrire moi-même"

### Architecture technique

**UX Flow :**
```
Article affiché → Champ "Ajustement rapide..." → Ctrl+R → Groq re-génère → Nouvel article affiché
```

**Endpoint :**
```typescript
// POST /api/generate/refine
{
  article_id: number;
  instruction: string;
}
```

**Logique :**
1. Récupérer l'article + brief originaux
2. Concaténer : "Article actuel : {content}\n\nInstruction de correction : {instruction}"
3. Relancer Groq avec le même prompt système
4. Remplacer l'article (ou créer une nouvelle version)
5. Retourner le nouvel article

**Anti-panique (LLM hallucine encore) :**
- Le texte de l'article est éditable directement (contentEditable)
- Un clic dans le texte → mode édition
- "Valider" sauvegarde le texte manuel
- Zéro blocage

### Fichiers à créer/modifier
- `src/app/api/generate/refine/route.ts` (nouveau)
- `src/app/events/[id]/page.tsx` (ajouter champ micro-correction + édition inline)

---

## 2.5 — Limiter la liste + Forcer l'Urgence

### Persona : Tous les utilisateurs
### Stress : "45 événements en production = montagne impossible"

### Architecture technique

**Homepage (Rédacteur) :**
- "En production" : top 5 par score
- Texte : "+ X autres en attente"
- Lien "Voir tout →" vers /events

**Events page (Rédacteur en Chef) :**
- Bouton ⚡ "Forcer l'Urgence" à côté de chaque événement
- Met à jour `events.urgent_until` (nouvelle colonne) = now + 24h
- Les événements urgent_until > now apparaissent en haut

**Table events — colonne ajoutée :**
```sql
ALTER TABLE events ADD COLUMN urgent_until TEXT;
```

**Logique homepage :**
```typescript
// getDashboardAgenda() modifié
const URGENT_LIMIT = 5;
const inProgress = events
  .filter(e => !hasArticle)
  .sort((a, b) => b.score - a.score)
  .slice(0, URGENT_LIMIT);
const hiddenCount = events.filter(e => !hasArticle).length - URGENT_LIMIT;
```

### Fichiers à créer/modifier
- `src/lib/db.ts` (migration + modification getDashboardAgenda)
- `src/app/page.tsx` (limiter + afficher count)
- `src/app/events/page.tsx` (bouton ⚡)
- `src/app/api/events/route.ts` (PUT pour forcer urgence)

---

## Résumé des fichiers

### Fichiers à créer (5)
| Fichier | Description |
|---------|-------------|
| `src/lib/studio-prefill.ts` | Encodage/décodage Base64 pour STUDIO |
| `src/lib/auto-tag.ts` | Dictionnaire Regex + fonction de tag |
| `src/components/SmartDropzone.tsx` | Dropzone globale pour CSV |
| `src/app/api/generate/refine/route.ts` | Endpoint micro-correction |
| `src/app/api/events/tags/route.ts` | API CRUD tags |

### Fichiers à modifier (9)
| Fichier | Modification |
|---------|--------------|
| `src/lib/db.ts` | Tables event_tags, colonne urgent_until |
| `src/lib/scoring.ts` | Appel auto-tag après clustering |
| `src/app/page.tsx` | Limiter liste + chips tags |
| `src/app/events/page.tsx` | Chips tags + bouton ⚡ |
| `src/app/events/[id]/page.tsx` | Bouton STUDIO Base64 + micro-correction |
| `src/app/ready/page.tsx` | Bouton STUDIO Base64 |
| `src/app/stats/page.tsx` | SmartDropzone intégré |
| `src/app/api/events/route.ts` | PUT pour forcer urgence |
| `src/app/api/stats/route.ts` | Messages d'erreur structurés |
