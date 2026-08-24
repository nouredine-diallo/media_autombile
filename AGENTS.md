# AGENTS.md — Media Labs Automobile

Ce fichier est le point d'entrée pour tout agent OpenCode travaillant sur ce projet. Il référence les sources de vérité et les plugins actifs.

---

## Sources de vérité (par ordre de priorité)

| Fichier | Portée | Rôle |
|---------|--------|------|
| `RADAR/CLAUDE.md` | RADAR | Constitution du projet RADAR — interdits, stack, anti-hallucination, qualité |
| `studio/CLAUDE.md` | STUDIO | Constitution du projet STUDIO — décisions visuelles, gabarits, auth |
| `CLAUDE_DASHBOARD.md` |全局 | Vue d'ensemble — parcours utilisateur, architecture, statut modules |

**Règle** : en cas de conflit entre ce fichier et un CLAUDE.md, le CLAUDE.md du dossier concerné gagne.

---

## Plugins actifs

### Superpowers (méthodologie)
Méthodologie de développement pour agents. Quand tu reçois une tâche :

1. **Brainstorming** — comprends le vrai besoin avant de coder
2. **Writing plan** — écris un plan d'implémentation
3. **TDD** — tests d'abord, code ensuite
4. **Verification** — vérifie avant de déclarer terminé
5. **Code review** — identifie ce que tu as pu casser

→ Ne jamais sauter ces étapes. Si l'utilisateur demande "fais X", commence par comprendre et planifier.

### Impeccable (design visuel)
Design guidance pour interfaces frontend. Utilise quand tu touches à l'UI du STUDIO :

- `/impeccable critique` — review UX (hierarchy, clarity, emotional resonance)
- `/impeccable audit` — checks techniques (a11y, performance, responsive)
- `/impeccable polish` — passe finale avant shipping
- `/impeccable typeset` — hierarchy typographique
- `/impeccable layout` — spacing, rhythm, visual hierarchy

→ Toute modification visuelle du STUDIO doit passer par Impeccable avant validation.

---

## Règles transversales

1. **Ne jamais modifier un gabarit STUDIO sans justification visuelle.** Utiliser `/impeccable critique` avant et après.
2. **Ne jamais changer le comportement RADAR sans vérifier les contraintes.** Lire `RADAR/CLAUDE.md` §4 (graphe de contraintes).
3. **Toute dépendance nouvelle** doit être vérifiée contre la stack figée (§3 des CLAUDE.md).
4. **Tests avant merge** — pas de push sans que `npm run build` passe.
5. **Un seulMerge** — pas de push sans que `npm run build` passe.
5. **Un seul développeur** — ne pas paralléliser les tâches qui touchent les mêmes fichiers.

---

## Architecture du projet

```
media_autombile/
├── RADAR/              ← App Next.js (veille, articles, pipeline)
│   ├── CLAUDE.md       ← Constitution
│   ├── src/            ← Code source
│   └── docker-compose.yml
├── studio/             ← App Next.js (création de posts)
│   ├── CLAUDE.md       ← Constitution
│   ├── src/            ← Code source
│   └── Dockerfile
├── nginx/              ← Config Nginx (subdomain routing)
├── _agents/            ← Repos d'agents (superpowers, impeccable)
├── CLAUDE_DASHBOARD.md ← Vue d'ensemble
├── opencode.json       ← Config plugins OpenCode
└── docker-compose.yml  ← Orchestration des deux apps
```

---

## Protocole de réflexion multi-perspectives (inspiré ChatDev)

Avant toute décision structurante (architecture, ajout de dépendance, changement de pipeline, design visuel majeur), appliquer le protocole **PVRS** — 4 angles d'analyse séquentiels, comme les phases d'un workflow ChatDev :

### Les 4 rôles (un seul agent, 4 modes)

| Rôle | Question clé | Focus |
|------|-------------|-------|
| **P**roduct Owner | "Est-ce que ça sert l'utilisateur ?" | Valeur métier, parcours, priorité |
| **V**érificateur | "Est-ce que ça casse quelque chose ?" | Contraintes CLAUDE.md, stack figée, interdits, régressions |
| **R**ésolveur | "Quelle est la meilleure approche ?" | Trade-offs, alternatives, complexité réelle |
| **S**écuritaire | "Qu'est-ce qui peut mal tourner ?" | Coût, dépassement, dépendances, risques, dette technique |

### Déroulement

```
1. Énoncer la décision à prendre (1 phrase)
2. P — Product Owner : cette chose ajoute-t-elle de la valeur ? Pour qui ?
3. V — Vérificateur : vérifier CLAUDE.md, stack, interdits. Y a-t-il un conflit ?
4. R — Résolveur : proposer 2-3 approches avec trade-offs, recommander une
5. S — Sécuritaire : risques, coûts, dépendances, dette technique
6. Synthèse : recommandation finale avec les 4 points de vue
7. → Présenter à l'humain pour décision (jamais trancher seul)
```

### Quand appliquer

- Ajout d'une dépendance (même "petite")
- Changement d'architecture (nouveau service, nouvelle API inter-app)
- Modification de pipeline (cron, export, callback)
- Design visuel majeur (nouveau gabarit, changement de layout)
- Tout choix qui engage le long terme

### Quand NE PAS appliquer

- Bug fix ciblé (un fichier, une ligne)
- Traduction / texte
- Refactor pur (sans changement de comportement)
- Mise à jour de dépendance mineure

### Exemple rapide : "Ajouter un cache Redis"

- **P** : Non prioritaire — le SQLite WAL suffit pour 5-10 users
- **V** : Violation stack §3 — Redis n'est pas dans la stack figée
- **R** : Alternative : better-sqlite3 WAL + index (déjà en place)
- **S** : Redis = 1 dépendance Docker supplémentaire, coût mémoire VM ARM
- **Décision** : Rejeter. Pas de Redis.

---

## Contacts

- **Développeur** : Daniel (nouredine-diallo)
- **Équipe** : 5-10 personnes
- **Budget** : 0€
- **Hébergement** : Oracle Cloud Always Free (VM ARM)
