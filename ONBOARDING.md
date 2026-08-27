# ONBOARDING — Session de travail

> **Fichier d'entrée pour toute nouvelle session.** Lis ce fichier AVANT de commencer.
> Il te donne l'état complet du projet, le workflow de raisonnement, et les fichiers à consulter.

---

## 1. État actuel du projet (26 août 2026)

### Ce qui fonctionne
- **RADAR** (port 3001) : dashboard, liste événements, détail événement, page Ready
- **STUDIO** (port 3002) : création de posts, 6 gabarits, export Google Drive
- **Pipeline RSS** : ingestion, scoring, clustering, fact-checking
- **Workflow RADAR → STUDIO** : prefill complet (titre, image, source, chapeau) + auto-génération des titres
- **Export inline** : polling sur la même page, pas de navigation

### Ce qui a été fait cette session
| Tâche | Statut | Fichier clé |
|-------|--------|-------------|
| buildStudioLink → STUDIO_URL env var | ✅ | `RADAR/src/lib/studio-prefill.ts` |
| Source context dans header STUDIO | ✅ | `studio/src/app/titres/page.tsx` |
| Auto-génération titres après prefill | ✅ | `studio/src/app/titres/page.tsx` |
| Bouton "Confirmer tous les faits" | ✅ | `RADAR/src/components/FactHighlighter.tsx` |
| Export inline sans navigation | ✅ | `studio/src/app/titres/page.tsx` |
| "Valider sans vérifier" override | ✅ | `RADAR/src/app/events/[id]/page.tsx` |
| Post-validation action bar | ✅ | `RADAR/src/app/events/[id]/page.tsx` |
| Désactiver flux non-auto (designboom, dezeen) | ✅ | `RADAR/scripts/disable-bad-feeds.ts` |
| Colonne `enabled` sur table feeds | ✅ | `RADAR/src/lib/db.ts` |
| Plan Priorité 3 (charge cognitive) | ✅ | `TODO.md` § Priorité 3 |

### Ce qui reste à faire
Voir `TODO.md` pour la liste complète. Priorités :
1. **Relancer le pipeline** avec les flux corrigés
2. **Implémenter les changements P3** (réduction charge cognitive)
3. **Attendre reset quota Groq** pour tester le prompt unifié

---

## 2. Workflow de raisonnement (OBLIGATOIRE)

### Avant de coder, TOUJOURS suivre ces étapes :

```
1. BRAINSTORMING  → skill "brainstorming"
   - Comprends le vrai besoin avant de coder
   - Identifie les contraintes ( stack, budget, sécurité )
   - Valide avec l'utilisateur

2. WRITING PLAN   → skill "writing-plans"
   - Écris un plan d'implémentation
   - Décompose en tâches vérifiables
   - Identifie les risques

3. TDD            → skill "test-driven-development"
   - Tests d'abord, code ensuite
   - Vérifie que le build passe

4. VERIFICATION   → skill "verification-before-completion"
   - Lance le lint et le typecheck
   - Vérifie que rien n'est cassé

5. CODE REVIEW    → skill "requesting-code-review"
   - Identifie ce que tu as pu casser
   - Demande un review si nécessaire
```

### Règles absolues
- **Ne JAMAIS sauter ces étapes**, même si la tâche semble simple
- **Ne JAMAIS modifier un gabarit STUDIO sans justification visuelle**
- **Ne JAMAIS changer le comportement RADAR sans vérifier les contraintes**
- **Toute dépendance nouvelle** doit être vérifiée contre la stack figée
- **Tests avant merge** — pas de push sans que `npm run build` passe

---

## 3. Fichiers à lire en priorité

### Pour comprendre l'architecture
| Fichier | Pourquoi |
|---------|----------|
| `CLAUDE_DASHBOARD.md` | Vue d'ensemble — parcours utilisateur, architecture, statut modules |
| `AGENTS.md` | Configuration des agents, plugins, règles transversales |
| `TODO.md` | Toutes les tâches, statuts, blocages |

### Pour comprendre RADAR
| Fichier | Pourquoi |
|---------|----------|
| `RADAR/CLAUDE.md` | Constitution du projet RADAR — interdits, stack, anti-hallucination |
| `RADAR/src/app/page.tsx` | Dashboard principal |
| `RADAR/src/app/events/[id]/page.tsx` | Détail événement (la page la plus complexe) |
| `RADAR/src/lib/studio-prefill.ts` | Workflow RADAR → STUDIO |
| `RADAR/src/lib/content-engine.ts` | Style DNA, détection de type, few-shot |
| `RADAR/src/lib/rss.ts` | Pipeline RSS, getFeeds() |

### Pour comprendre STUDIO
| Fichier | Pourquoi |
|---------|----------|
| `studio/CLAUDE.md` | Constitution du projet STUDIO |
| `studio/src/app/titres/page.tsx` | Page de création (la plus modifiée) |
| `studio/src/lib/titles/router.ts` | Routeur LLM (titres, surtitres, paragraphes) |
| `studio/src/components/gabarits/` | Les 6 gabarits visuels |
| `studio/specStudio.md` | Spécifications des gabarits §4 |

### Pour comprendre le workflow utilisateur
| Fichier | Pourquoi |
|---------|----------|
| `RADAR/src/app/ready/page.tsx` | Page "Prêts à publier" |
| `studio/src/app/export/[jobId]/` | Export et confirmation |
| `studio/src/lib/session.ts` | Session localStorage |

---

## 4. Architecture technique

```
┌─────────────────────────────────────────────────────┐
│                    UTILISATEUR                       │
│                        │                             │
│    ┌───────────────────┼───────────────────┐        │
│    │                   │                   │        │
│    ▼                   ▼                   ▼        │
│ ┌──────┐          ┌──────────┐         ┌────────┐  │
│ │RADAR │──prefill─▶│ STUDIO   │──export─▶│ Drive  │  │
│ │:3001 │          │ :3002    │         │  API   │  │
│ └──┬───┘          └────┬─────┘         └────────┘  │
│    │                   │                            │
│    ▼                   ▼                            │
│ ┌──────────────────────────┐                       │
│ │   SQLite radar.db        │                       │
│ │   (shared via volume)    │                       │
│ └──────────────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

### Données partagées
- **SQLite** : `/opt/media-labs/data/radar.db` (Docker volume)
- **Tables clés** : `feeds`, `items`, `events`, `articles`, `briefs`, `drive_files`
- **LLM** : Groq `openai/gpt-oss-120b` (200K tokens/jour gratuit)

### Variables d'environnement importantes
- `STUDIO_URL` : URL du STUDIO (utilisé par `buildStudioLink()`)
- `DB_PATH` : chemin vers la base SQLite
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` : API Google Drive

---

## 5. Règles de style (LMA)

- **Tutoiement** (pas de vouvoiement) — confirmé par 8 vrais posts
- **Phrases courtes** : 15-25 mots
- **Ton** : factuel-complice, pas corporate
- **Max 2 exemples few-shot** sélectionnés par similarité de mots-clés
- **Types d'articles** : annonce, curiosité, comparatif, essai (détection par scoring)

---

## 6. Blocages connus

| Blocage | Impact | Résolution |
|---------|--------|------------|
| Quota Groq 200K tokens/jour | Ne peut pas tester le prompt unifié | Attendre reset minuit UTC |
| VM OOM sur `npm run build` | Pas de build Docker possible | Optimiser ou augmenter RAM |
| u2net.onnx non installé | Détourage bloqué en prod | Télécharger 176 Mo |
| realesrgan non acquis | Upscale HD bloqué | Acquérir fichiers .param/.bin |
| RSS feeds non configurés | Pipeline ingère du contenu général | ✅ Désactiver designboom/dezeen |

---

## 7. Commandes utiles

```bash
# RADAR
cd RADAR && npm run dev          # Lancer en dev
cd RADAR && npx tsc --noEmit     # Vérifier TypeScript
cd RADAR && npm run lint         # Linter
cd RADAR && npx tsx scripts/disable-bad-feeds.ts  # Désactiver mauvais flux

# STUDIO
cd studio && npm run dev         # Lancer en dev
cd studio && npx tsc --noEmit    # Vérifier TypeScript

# Docker
docker compose up -d             # Lancer les deux apps
docker compose logs -f radar     # Logs RADAR
docker compose logs -f studio    # Logs STUDIO
```

---

## 8. Contacts

- **Développeur** : Daniel (nouredine-diallo)
- **Stack** : Next.js 15, SQLite, Groq, Google Drive API
- **Hébergement** : Oracle Cloud Always Free (VM ARM)
- **Budget** : 0€
