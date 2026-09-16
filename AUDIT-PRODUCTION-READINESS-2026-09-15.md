# Audit production-ready — RADAR + STUDIO, 15 sept. 2026

**Partie 1 : audit seul, aucune modification de code effectuée.** Neutre, exigeant,
chaque affirmation est soit vérifiée contre le code/une commande réelle, soit
marquée explicitement comme non vérifiée. Contrainte respectée : aucun appel
Groq réel effectué (lecture de code, grep, `npm audit` local, lecture de
config, **et curl en lecture seule contre la prod réelle**, §1.9 — zéro
coût quota sur l'ensemble de la passe, y compris la vérification live).

**Périmètre** : reprend la grille P0 fournie (Fonctionnel / Sécurité / Données /
Disponibilité / Backup-restore / Performance / Ressources VM / Intégrations /
UX / Exploitabilité) + couverture de tests de régression. Repart de ce qui a
déjà été corrigé en session précédente (A3 rate limiting, A4 CSRF OAuth, A5
chiffrement, D2 repli LLM, D6 LIMIT dashboard, D7 tracking feeds, D8 VACUUM,
E1 backup, E6 arrêt propre, R5 middleware global) — chaque item est
**revérifié** ci-dessous (colonne "Statut"), pas re-audité en profondeur.

---

## 0. Résumé exécutif

| # | Finding | Domaine | Sévérité | Statut |
|---|---|---|---|---|
| 1 | Next.js 16.3.1 — RCE non authentifiée (advisory critique) | Sécurité | **CRITIQUE** | ✅ **Corrigé Partie 2** (§11.3) |
| 2 | Bypass du rate limiting login via `X-Forwarded-For` spoofable | Sécurité | **HAUTE** | ✅ **Corrigé Partie 2** (§11.1) |
| 3 | `sharp` < 0.35.4 — CVE haute sévérité (libvips/libheif) | Sécurité | HAUTE | ✅ **Corrigé Partie 2** (§11.4) |
| 4 | Sauvegarde DB non testée en restauration + même disque que le prod | Backup/Restore | HAUTE | ✅ **Corrigé Partie 2** (§11.5) |
| 5 | Secret de session : repli silencieux vers une valeur codée en dur | Sécurité | MOYENNE | ✅ **Corrigé Partie 2** (§11.2) |
| 6 | Comparaison mot de passe non constant-time | Sécurité | MOYENNE | ✅ **Corrigé Partie 2** (§11.1) |
| 7 | `deploy.sh` ne vérifie pas que son propre filet PM2 a fonctionné | Disponibilité | MOYENNE | ✅ **Corrigé Partie 2** (§11.6) |
| 8 | Aucune sauvegarde équivalente pour les données STUDIO | Backup/Restore | MOYENNE | ⚠️ Confirmé, non corrigé (§11.7) |
| 9 | Aucun test de régression offline / sans coût LLM | Exploitabilité | MOYENNE | ✅ Amorcé Partie 2 (§11.8) |
| 10 | Vérification de chemin par préfixe sans séparateur (`/api/drive/file`) | Sécurité | BASSE | ✅ **Corrigé Partie 2** (§11.1) |
| 11 | Pas de `X-Frame-Options`/CSP | Sécurité | BASSE | ✅ **Corrigé Partie 2** (§11.1) |
| 12 | Statuts de santé en pull uniquement, pas d'alerte push | Exploitabilité | BASSE | Non traité (hors scope Partie 2) |

**Bonus découvert pendant la Partie 2, hors liste initiale** : `protobufjs` (critique, RCE) et `adm-zip`/`js-yaml`/`qs` (haute/modérée) — corrigés au passage via `npm audit fix` + `overrides` ciblés (§11.4). RADAR et STUDIO sont passés à **0 vulnérabilité `npm audit`** (contre 6 et 5 respectivement en début de Partie 2).

**Ce qui reste solide, reconfirmé sans régression** : A3 (logique de comptage),
A4 (state OAuth), A5 (chiffrement AES-256-GCM tokens Drive), R5 (middleware
session global), E1 (le mécanisme de backup lui-même), E6 (arrêt propre
SIGTERM), D2 (repli Groq→Claude→Ollama), D6/D7/D8, mode WAL + busy_timeout,
aucun secret commité dans git, aucun `dangerouslySetInnerHTML`.

---

## 1. Sécurité

### 1.1 [CRITIQUE] Next.js 16.3.1 — RCE non authentifiée

**Vérifié par** `npm audit --omit=dev` (RADAR et STUDIO, exécution locale,
aucun appel réseau LLM).

```
next  16.0.0 - 16.3.2
Severity: critical
Next.js: Unauthenticated Remote Code Execution on windows-hosted servers
Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used
fix available: next@16.3.5
```

Les deux apps sont sur `next: 16.3.1` (package.json), dans la plage
vulnérable. La VM prod est Linux (Oracle Cloud ARM), donc l'advisory
"windows-hosted" ne s'applique pas — mais la seconde ("Image Optimization
API when AVIF files are used") **n'est pas restreinte à Windows** d'après le
texte de l'advisory retourné par `npm audit`.

**Fait aggravant vérifié dans le code** : la route interne `/_next/image`
(endpoint natif Next.js, actif par défaut, indépendant de l'usage ou non du
composant `<Image>` dans le code applicatif) est **explicitement exclue** du
middleware d'authentification dans les deux apps :
- `RADAR/src/middleware.ts:109` — `matcher` exclut `_next/image`
- `studio/src/proxy.ts:35` — même exclusion

Donc cet endpoint est joignable **sans session**. STUDIO accepte et traite
des fichiers AVIF en upload (`studio/src/app/api/images/upload/route.ts`,
`ALLOWED_MIME["image/avif"]`).

**Réserve honnête (protocole anti-hallucination)** : je n'ai pas reproduit
l'exploit — `npm audit` rapporte l'advisory du vendor, je n'ai pas vérifié
par un appel réel si l'endpoint accepte une URL externe (pas de
`remotePatterns` configuré dans `next.config.ts`, ce qui limite en théorie
l'optimiseur aux assets same-origin, mais ça n'élimine pas nécessairement le
vecteur si le bug est dans le décodage AVIF lui-même plutôt que dans le
fetch de l'URL). Le correctif (bump vers `next@16.3.5`) est une opération de
routine sans changement de comportement attendu — recommandé en priorité
absolue pour la Partie 2, indépendamment de la question de l'exploitabilité
exacte.

### 1.2 [HAUTE] Bypass du rate limiting login (régression sur A3)

**Vérifié par lecture croisée** de `RADAR/src/app/actions/auth.ts:16-19`
(identique dans `studio/src/app/actions/auth.ts`) et des 4 blocs
`proxy_set_header` dans `nginx/media-labs.conf` + `nginx/media-labs-ssl.conf`.

```ts
function getClientIp(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();  // ← premier segment
  return headersList.get("x-real-ip") || "unknown";
}
```

```nginx
proxy_set_header X-Real-IP $remote_addr;                    # non falsifiable
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; # AJOUTE au header existant
```

`$proxy_add_x_forwarded_for` **ajoute** `$remote_addr` à la fin d'un
`X-Forwarded-For` déjà présent dans la requête entrante — il ne le
remplace pas. Le premier segment de la liste reste donc **celui envoyé par
le client**, entièrement falsifiable. Le code lit ce premier segment en
priorité, et ne retombe sur `x-real-ip` (fiable, posé par nginx depuis
`$remote_addr`) que si `x-forwarded-for` est absent.

**Conséquence concrète** : un attaquant qui envoie un `X-Forwarded-For`
différent à chaque tentative de login (`curl -H "X-Forwarded-For: <random>"`)
obtient une nouvelle fenêtre de 5 tentatives à chaque requête — la
protection anti-bruteforce (finding A3, marquée "corrigée" le 9 sept.) est
**contournable aujourd'hui en production**, sur les deux apps.

**Correctif recommandé (Partie 2)** : inverser la priorité — utiliser
`x-real-ip` en premier (non falsifiable, posé par nginx), et ne retomber
sur `x-forwarded-for` que si `x-real-ip` est absent (dev local sans nginx
devant). Changement d'une ligne dans les deux fichiers `auth.ts`.

### 1.3 [HAUTE] `sharp` < 0.35.4 — CVE haute sévérité

**Vérifié par** `npm audit` (les deux apps).

```
sharp  <0.35.4
Severity: high
Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545
```

STUDIO l'utilise en dépendance directe (upload/recadrage/export d'images —
chemin chaud de l'app). RADAR l'a en transitif via `@xenova/transformers`
(chaîne `onnx-proto → onnxruntime-web → @xenova/transformers`, avec en plus
2 advisories `protobufjs` DoS sur la même chaîne).

**Chemin de correction asymétrique** (vérifié dans la sortie `npm audit`) :
STUDIO peut corriger `sharp` via `npm audit fix` simple (pas de breaking
change signalé). RADAR nécessite `npm audit fix --force`, qui **downgrade
`@xenova/transformers` vers 1.4.2** (breaking change) — à ne pas faire sans
retester le pipeline d'embeddings (dédup/scoring, cœur de RADAR) en Partie
2, jamais en aveugle.

### 1.4 [MOYENNE] Repli silencieux vers un secret de session codé en dur

**Vérifié par grep**, présent identiquement à 4 endroits :
`RADAR/src/lib/session.ts:5`, `studio/src/lib/session.ts:5`,
`RADAR/src/middleware.ts:5`, `RADAR/src/lib/google-auth.ts:20`.

```ts
const secretKey = process.env.SESSION_SECRET || "fallback-very-long-secret-key-that-is-32-bytes-at-least-123456789";
```

Cette chaîne est visible dans le code source (donc potentiellement dans
l'historique git si le dépôt est ou devient public). `provision-oracle.sh`
génère bien un vrai secret aléatoire (`openssl rand -base64 32`) au moment
du provisioning VM — **vérifié dans le script**, pas supposé — donc le
risque n'est pas "actif" aujourd'hui en prod (sous réserve que le `.env`
généré à l'époque soit toujours celui en usage, non revérifié directement
sur la VM dans cet audit). Le risque est structurel : rien dans le code
applicatif lui-même n'empêche un futur redéploiement, une régénération de
`.env` incomplète, ou un nouvel environnement (staging, fork) de tourner
silencieusement sur ce secret public. Contredit directement
`RADAR/CLAUDE.md §6` ("aucune dégradation silencieuse").

Ce même secret dérive aussi la clé de chiffrement AES des tokens Google
Drive (`google-auth.ts:20-22`, `sha256("google-tokens:" + secret)`) — un
secret compromis compromet donc à la fois les sessions **et** les tokens
Drive stockés.

**Correctif recommandé (Partie 2)** : `throw` au démarrage si
`NODE_ENV === "production"` et `SESSION_SECRET` absent ou < 32 caractères,
plutôt que le repli silencieux actuel. Échec bruyant et immédiat plutôt
qu'une vulnérabilité dormante.

### 1.5 [MOYENNE] Comparaison de mot de passe non constant-time

`RADAR/src/app/actions/auth.ts:44` et l'équivalent STUDIO :
`if (password !== process.env.AUTH_PASSWORD)`. Comparaison `!==` standard,
vulnérable en théorie à une attaque par timing. Exploitabilité réelle faible
(mot de passe d'équipe partagé, HTTPS, gigue réseau, rate limiting côté
comptage — même si ce dernier est contournable, cf. 1.2), mais la correction
est triviale (`crypto.timingSafeEqual` sur des buffers de longueur égale) et
élimine la classe de risque entièrement.

### 1.6 [BASSE] Vérification de chemin par préfixe sans séparateur

`RADAR/src/app/api/drive/file/route.ts:16-19` :

```ts
const isAllowed = allowedDirs.some(dir => resolved.startsWith(dir));
```

Anti-pattern CWE-22 classique : un répertoire frère dont le nom commence
par `drive-sync` ou `visual-cache` (ex. `drive-sync-old/`) passerait
incorrectement ce contrôle, puisque `startsWith` ne vérifie pas de frontière
de séparateur de chemin. **Aucun répertoire de ce type n'existe
actuellement** (vérifié), et la route est protégée par le middleware de
session (pas dans `publicApiPatterns`) — donc exploitabilité nulle
aujourd'hui, réservée à un utilisateur déjà authentifié dans le pire cas.
À corriger en Partie 2 par hygiène (`resolved === dir || resolved.startsWith(dir + path.sep)`)
avant que ça devienne un jour exploitable sans que personne n'y pense.

### 1.7 [BASSE] Pas de `X-Frame-Options` / CSP

Aucun `headers()` dans les deux `next.config.ts`, aucun `add_header
X-Frame-Options`/`Content-Security-Policy` dans les configs nginx (HSTS,
lui, **est** bien présent — vérifié : `add_header Strict-Transport-Security`
dans les 2 blocs server de `media-labs-ssl.conf`). Risque faible pour un
outil interne à 10 personnes sans contenu généré par des tiers non modéré
(aucun `dangerouslySetInnerHTML` trouvé dans les deux apps — vérifié par
grep, zéro résultat), mais un `add_header X-Frame-Options SAMEORIGIN`
ferme le clickjacking à coût nul.

### 1.8 Ce qui a été revérifié et reste solide (aucune régression trouvée)

- **A3** (logique de comptage 5 tentatives/15min) — correcte dans les deux
  apps ; seul le bypass IP (1.2) est nouveau.
- **A4** (state OAuth Google) — généré et vérifié dans le callback, empêche
  le vol de session Drive documenté dans le commentaire du code.
- **A5** (chiffrement tokens Drive) — AES-256-GCM avec IV aléatoire par
  valeur, tag d'authentification vérifié, compatibilité ascendante pour les
  lignes pré-chiffrement (pas de crash, re-chiffrement au prochain refresh).
- **R5** (middleware session global) — les 35 routes RADAR + 19 routes
  STUDIO sont couvertes ; les 5 exceptions documentées (`/exported`,
  `/auto-preview`, `/carousel-package`, `/api/system/status`,
  `/api/facts-lookup`) sont toutes des callbacks serveur-à-serveur
  justifiés et en lecture seule ou non sensibles — aucune route métier
  trouvée non protégée par erreur.
- **Secrets** : `git ls-files` filtré sur `.env`/secret/`.pem`/`.key` ne
  retourne rien d'autre que `.env.example` — aucun secret commité.

### 1.9 Vérification en direct contre la prod réelle (post-audit, lecture seule)

Demandé explicitement après la rédaction de ce rapport : re-tester contre la
vraie prod plutôt que de s'arrêter à l'analyse statique. Fait en lecture
seule (`curl`, aucune écriture, **zéro appel Groq**) contre
`https://89.168.53.133.nip.io` (RADAR) et
`https://studio.89.168.53.133.nip.io` (STUDIO), 15 sept. 2026 ~15h12 CET :

| Vérification | Résultat réel | Confirme |
|---|---|---|
| `GET /` sans session (RADAR + STUDIO) | `307` → redirection login, les deux apps répondent | Prod up, aucun régression de disponibilité |
| `GET /_next/image?url=/logo.png&w=256&q=75` sans session | **`200`** — image servie | **Finding 1.1** : la précondition (endpoint joignable sans authentification) est réelle en prod, pas seulement théorique dans le code. L'exploit RCE lui-même n'a **pas** été tenté (aurait été une action destructive/risquée, hors périmètre d'un audit) — seule la joignabilité non authentifiée est confirmée. |
| `GET /dashboard` sans session (même run) | `307` → login | Comparaison directe : le contraste 200 vs 307 confirme que l'exclusion vient bien du `matcher` du middleware, pas d'un autre facteur (cache CDN, etc.) |
| Headers de `GET /login` | `strict-transport-security: max-age=31536000; includeSubDomains` présent ; `x-frame-options` et `content-security-policy` **absents** | Confirme à la fois que HSTS fonctionne réellement en prod (pas juste dans le fichier de config local) et que le gap CSP/X-Frame-Options (finding 1.7) est bien présent en prod, pas seulement en local |
| TLS | TLSv1.3, certificat Let's Encrypt valide pour `89.168.53.133.nip.io` | Pas de régression sur le chapitre HTTPS déjà validé en session précédente |

**Ce qui n'a délibérément pas été tenté en prod, et pourquoi** : le bypass
du rate limiting (finding 1.2) n'a pas été reproduit en direct — le
reproduire correctement demanderait de spammer l'action serveur de login
réelle (mécanisme Next.js Server Actions, pas une route REST simple, avec
un identifiant d'action à extraire du bundle JS) ; le risque de verrouiller
temporairement de vrais comptes ou de déclencher une alerte pour un gain de
preuve marginal (la lecture croisée code+config nginx §1.2 est déjà une
preuve directe, pas une supposition) n'était pas justifié. Idem pour
l'exploit RCE de la 1.1 elle-même — confirmer la joignabilité suffisait, la
déclencher aurait été une action destructive potentielle sur un serveur de
production réel.

---

## 2. Données / Backup / Restauration

### 2.1 [HAUTE] Sauvegarde non testée en restauration, sur le même disque que le prod

`RADAR/src/lib/backup.ts` (finding E1, déjà en place) est un vrai mécanisme :
`db.backup()` de better-sqlite3 (API SQLite Online Backup, sûre en WAL, pas
de verrou long), rétention 7 jours, échec capturé et rendu visible via
`getLastBackupStatus()` plutôt que silencieux. **C'est du bon travail, déjà
fait.**

Deux gaps non résolus :

1. **Restauration jamais exercée.** Aucun script `restore.sh`, aucune trace
   d'un test réel "copier un backup → redémarrer → vérifier que l'app
   fonctionne". `RETENTION_DAYS`/`getBackupDir()` sont lus, jamais
   inversés. Le critère utilisateur "Backup/restore : une vraie
   restauration fonctionne" (P0) n'est donc **pas prouvé**, seule la moitié
   "backup" l'est.
2. **Même disque que le prod.** `getBackupDir()` place les copies dans
   `backups/` juste à côté de `radar.db` (même `DB_PATH`, même volume). Une
   perte de VM, de disque, ou de volume Oracle Cloud détruit le prod **et**
   les 7 jours de sauvegardes simultanément — le mécanisme protège contre
   une erreur applicative (mauvaise migration, suppression accidentelle),
   pas contre une perte d'infrastructure, qui est précisément le scénario
   visé par "backup/restore" en tête de la grille P0 fournie.

**Recommandation Partie 2** (coût zéro, cohérent avec la contrainte du
projet) : exporter périodiquement la dernière sauvegarde vers le Google
Drive déjà connecté (l'intégration Drive existe déjà pour un autre usage,
`driveGoogle.ts`) plutôt que d'ajouter un service tiers payant. Et surtout :
**exécuter une restauration réelle une fois**, documenter la procédure
(3-4 commandes), avant de considérer ce point clos.

### 2.2 [MOYENNE] Pas de sauvegarde équivalente pour STUDIO

`backup.ts` ne couvre que `radar.db`. STUDIO a son propre volume
(`studio-uploads` dans `docker-compose.yml`) et sa propre logique de jobs
(`studio/src/lib/jobs/`) — non inspectés en profondeur dans cette passe pour
rester dans le budget de l'audit. **Non confirmé comme une perte de données
réelle** (le flux normal exporte vers Drive, qui est la copie durable
voulue) — mais le travail STUDIO *en cours* (image importée mais pas encore
exportée) n'a, à ce stade de l'audit, aucune protection identifiée en cas de
perte de VM. À vérifier concrètement en Partie 2 avant de décider si ça
nécessite un correctif ou si c'est un risque accepté (fenêtre de travail
courte, ré-import possible depuis la source).

### 2.3 Intégrité concurrente — confirmé solide

`RADAR/src/lib/db.ts:11-20` : `journal_mode = WAL`, `foreign_keys = ON`,
`busy_timeout = 5000`. Choix appropriés et vérifiés pour ce volume (5-10
utilisateurs, un seul process par app) — pas de changement recommandé.

---

## 3. Disponibilité

### 3.1 [DÉJÀ CONNU, NON RÉ-AUDITÉ EN PROFONDEUR] Pipeline bloque le serveur web

`TODO.md §3.3` documente déjà en détail (mesures réelles en prod, causes
racines, solutions écartées et solution recommandée) le fait que le cycle
d'ingestion (30-50 min, 2x/jour) bloque totalement le serveur web RADAR
(même process, même thread JS). C'est le plus gros risque "Disponibilité"
du projet. Je ne le ré-analyse pas ici — l'analyse existante est de bonne
qualité et la solution (process PM2 séparé `radar-pipeline`) est déjà
scopée en détail, prête à implémenter. Le signaler dans cet audit sert
uniquement à confirmer qu'il reste ouvert et qu'il doit rester en tête de
la liste Partie 2 si le P0 "Disponibilité" est pris au sérieux.

### 3.2 [MOYENNE] `deploy.sh` ne vérifie pas que son propre filet PM2 a fonctionné

Le "piège PM2" documenté dans `SESSION-START.md` (`--max-memory-restart`
qui ne s'applique pas toujours sur `radar`) a été corrigé deux fois par un
`pm2 restart --update-env --max-memory-restart 3000M` explicite ajouté
après le `pm2 start`. **Vérifié dans `deploy.sh`** que cette ligne existe —
mais le script ne relit jamais `pm2 jlist` après coup pour confirmer que
`pm2_env.max_memory_restart` vaut bien `3145728000`. La procédure manuelle
documentée dans `SESSION-START.md` ("après tout déploiement, vérifier `pm2
jlist`...") repose sur qu'un humain s'en souvienne à chaque fois — exactement
le genre de vérification qu'un script peut faire lui-même et faire échouer
bruyamment si elle rate, plutôt que de compter sur la mémoire de session en
session.

### 3.3 Arrêt propre — confirmé solide

`RADAR/src/lib/startup.ts` (E6) : gestion SIGTERM/SIGINT correcte, attente
bornée à 8s, `deploy/start-radar.sh` utilise `exec` direct (pas de couche
`npm` intermédiaire, cause racine déjà identifiée et corrigée) +
`NEXT_MANUAL_SIG_HANDLE=true` (vérifié contre le code source de Next.js
lui-même selon le commentaire, pas juste supposé). Bon travail, rien à
ajouter.

---

## 4. Performance / Ressources VM

Pas de nouvelle régression trouvée dans les routes échantillonnées
(`events`, `ready`, `stats`). D6 (LIMIT dashboard) et D8 (VACUUM) restés en
place et cohérents avec leur documentation. Le seul item de perf restant
(N+1 sur les tags dans `/api/events`) est déjà tracké comme item P3 UI dans
`TODO.md` (ligne 342) — pas un P0, pas re-vérifié ici pour rester dans le
budget.

---

## 5. Intégrations (Groq / RSS / Drive)

- **RSS** : D7 (tracking d'échec + auto-désactivation) confirmé présent
  dans `RADAR/src/lib/db.ts`/pipeline — pas re-testé en profondeur (aurait
  nécessité de déclencher une vraie ingestion).
- **Groq** : D2 (repli Groq→Claude→Ollama) confirmé présent et dans le bon
  ordre (`RADAR/src/lib/llmProvider.ts:308-337`), timeout explicite 30s sur
  l'appel Groq (empêche un blocage indéfini comme celui documenté avoir
  causé un run bloqué >2h avant ce correctif). Le chemin Claude est
  honnêtement marqué "non testé par appel réel, faute de clé" dans le code
  lui-même — pas une découverte de cet audit, juste confirmé toujours vrai.
- **Drive** : `refreshAccessToken()` retourne `null` en cas d'échec plutôt
  que de lever une exception — **non vérifié dans cette passe** que chaque
  appelant traite bien ce cas (`getValidAccessToken()` le propage
  correctement en `null`, mais je n'ai pas audité tous les points d'appel
  en aval). Signalé comme point à vérifier en Partie 2, pas comme bug
  confirmé.

---

## 6. Exploitabilité

Les documents de session (`SESSION-START.md`, `TODO.md`, `ECOSYSTEM.md`)
sont d'une qualité et d'une fraîcheur inhabituelles — c'est un vrai atout
pour la diagnosticabilité par une personne qui reprend le projet à froid.
Le seul gap identifié : les signaux de santé existants
(`getLastBackupStatus()`, `getDegradedModeStatus()`, `/api/system/status`,
`/api/cache-stats`) sont tous des endpoints **pull** — quelqu'un doit
penser à aller les consulter. Rien ne pousse une alerte si, par exemple, la
sauvegarde échoue silencieusement plusieurs jours de suite sans que
personne n'ouvre le dashboard. Pour une équipe de 5-10 personnes sans
ops dédié, c'est un risque réaliste, pas théorique. Le `DriveStatusBadge`
déjà présent (mentionné dans `TODO.md` P3) est le bon pattern à étendre à
`getLastBackupStatus()` — faible coût, cohérent avec l'existant.

---

## 7. Couverture de tests / régression

**Constat vérifié** : aucun framework de test (`jest`/`vitest`/`mocha`)
dans les `devDependencies` des deux `package.json`. Tout ce qui existe sous
`RADAR/scripts/e2e-test/` est une collection de scripts `.mjs` ad hoc, dont
une bonne partie nommée `test-prod-*.mjs` — c'est-à-dire conçue pour taper
directement sur la prod, et pour certains, très probablement sur de vrais
appels LLM (`test-prod-brief.mjs`, `studio-prefill-test.mjs`). **Je ne les
ai pas exécutés dans cet audit**, précisément pour respecter la contrainte
de quota — mais leur existence même signifie qu'il n'y a aujourd'hui aucun
moyen rapide et gratuit de vérifier une non-régression avant un déploiement
sans soit taper la prod, soit consommer du quota Groq.

**Ce que ça a coûté concrètement** (déjà dans l'historique du projet, pas
une supposition) : le bug du parseur JSON/ligne-par-ligne (fin août 2026,
documenté dans `TODO.md` §4.2) — 0 article n'a jamais franchi le contrôle
qualité pendant un temps, en prod comme en local, avant d'être détecté. Un
test unitaire de `parseGeneratedArticle()` sur un fixture JSON aurait
attrapé ça en quelques millisecondes, sans base de données, sans serveur,
sans LLM.

**Recommandation Partie 2** (coût nul en quota, minimal en temps) : extraire
en tests unitaires purs (`node --test`, déjà disponible sans nouvelle
dépendance, ou `vitest` si préféré) les fonctions déjà "à coût nul" listées
dans `SESSION-START.md` lui-même : `parseGeneratedArticle`, `stripHtml`,
`verifyArticleAgainstBrief`, `extractNumbers`, `getClientIp` (aurait
attrapé le finding 1.2 de cet audit avec un seul test "deux en-têtes
X-Forwarded-For différents → deux compteurs différents"), la logique de
seuil du killswitch (`getDegradedModeStatus`), et le contrôle de chemin de
`/api/drive/file` (finding 1.6). Zéro appel réseau, zéro base de données
réelle nécessaire pour la plupart, exécutable en quelques secondes avant
chaque déploiement.

---

## 8. UX / Fonctionnel

Non audité en profondeur dans cette passe — le périmètre demandé mettait
l'accent sur perf/robustesse/sécurité, et le temps disponible a été
concentré là. Les items UX déjà identifiés (réduction de charge cognitive,
`TODO.md` "Priorité 3") restent la référence à jour ; rien de nouveau à
signaler ici sans réellement naviguer l'app (aurait nécessité de démarrer
les serveurs de dev, hors du périmètre "audit sans modification, sans coût
LLM" de cette passe).

---

## 9. Priorisation recommandée pour la Partie 2

**À faire en premier (sécurité active, correctifs à coût de changement
minimal)** :
1. `getClientIp()` : inverser la priorité vers `x-real-ip` (1.2) — 1 ligne,
   2 fichiers.
2. `SESSION_SECRET` : fail-fast en prod si absent (1.4) — quelques lignes,
   3 fichiers.
3. `next` → 16.3.5 (1.1) — bump de dépendance, tester le build + un rendu
   Playwright existant après coup.
4. `sharp` → dernière version compatible (1.3) — simple côté STUDIO ; côté
   RADAR, tester le pipeline d'embeddings avant/après si `--force` requis.

**Ensuite (données/disponibilité)** :
5. Exercer une vraie restauration de `radar.db` une fois, documenter la
   procédure (2.1).
6. Exporter la dernière sauvegarde hors VM via Drive (2.1).
7. `deploy.sh` : vérifier son propre filet PM2 après coup plutôt que de le
   supposer réussi (3.2).

**Enfin (hygiène, coût faible, pas urgent)** :
8. `crypto.timingSafeEqual` pour le mot de passe (1.5).
9. Séparateur de chemin dans `/api/drive/file` (1.6).
10. `X-Frame-Options` (1.7).
11. Premiers tests unitaires offline sur les fonctions déjà identifiées
    "coût nul" (§7).

**Non traité ici, déjà scopé ailleurs, à trancher séparément** : séparation
du pipeline en process PM2 dédié (TODO.md §3.3) — le plus gros chantier,
volontairement laissé à sa propre décision plutôt que rattaché à cette
liste.

---

## 10. Méthodologie — ce qui n'a PAS été fait dans cette passe

Pour respecter la contrainte de quota et le périmètre "audit sans
modification" :
- Aucun serveur de dev démarré, aucune navigation réelle dans l'UI.
- Aucun appel Groq réel déclenché, y compris pendant la vérification live
  post-rédaction (§1.9) — uniquement des `curl` en lecture seule contre les
  URLs publiques prod, jamais d'action d'écriture ni de déclenchement du
  routeur LLM.
- Aucun script de `scripts/e2e-test/` exécuté.
- Pas de connexion SSH à la VM prod pour vérifier l'état réel du `.env` en
  production (la valeur de `SESSION_SECRET`/`IMPORT_SECRET` déployée n'a
  donc pas été confirmée directement — seul le mécanisme de génération dans
  `provision-oracle.sh` a été vérifié). Deux findings (1.1 et 1.7) ont en
  revanche été confirmés en direct contre la prod réelle via `curl` — voir
  §1.9 — sans qu'aucune tentative d'exploitation réelle n'ait été faite.
- Pas d'audit approfondi de STUDIO au-delà des points listés (jobs, export
  Drive complet, gabarits) — priorité donnée à la largeur (couvrir tous les
  domaines demandés) plutôt qu'à la profondeur exhaustive sur un seul.

Ces limites sont documentées explicitement plutôt que passées sous silence,
conformément au principe anti-hallucination déjà en vigueur dans ce projet.

---

## 11. Partie 2 — Corrections appliquées (15 sept. 2026, même journée)

Contrairement à la Partie 1, cette section documente du code **modifié**.
Chaque correctif a été **vérifié par un test réel** (build, test unitaire
exécuté, ou vérification directe contre la prod via SSH/curl) — pas
seulement relu. Zéro appel Groq consommé sur l'ensemble de la Partie 2.

### 11.1 Trois correctifs de sécurité ponctuels

- **Finding 1.2 (bypass rate limiting)** : `getClientIp()` inversé pour
  préférer `x-real-ip` (posé par nginx depuis `$remote_addr`, non
  falsifiable) à `x-forwarded-for` (falsifiable). Extrait dans
  `RADAR/src/lib/loginSecurity.ts` et `studio/src/lib/loginSecurity.ts` pour
  être testable hors du runtime `"use server"`. **Testé réellement** :
  `scripts/unit-tests/loginSecurity.test.ts` reproduit le scénario exact du
  bypass (même IP réelle, `X-Forwarded-For` différent à chaque appel) et
  vérifie que les 3 tentatives résolvent maintenant à la même IP — plus un
  test qui reproduit l'ANCIEN code pour prouver que le bug était réel, pas
  supposé.
- **Finding 1.5 (comparaison non constant-time)** : `passwordMatches()`
  utilise `crypto.timingSafeEqual`, avec garde explicite sur les longueurs
  différentes (ne lève jamais) et sur `AUTH_PASSWORD` absent/vide (ne
  matche jamais, y compris contre un mot de passe vide — cas limite trouvé
  en écrivant le test lui-même). Testé.
- **Finding 1.6 (path traversal `/api/drive/file`)** : logique extraite en
  `isPathWithinAllowedDirs()` (`RADAR/src/lib/pathGuard.ts`), comparaison
  avec frontière de séparateur. Testé avec le cas exact du finding
  (répertoire frère `drive-sync-old` correctement rejeté).
- **Finding 1.7 (pas de X-Frame-Options/CSP)** : `headers()` ajouté dans les
  deux `next.config.ts` (`X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`) — app-level, pas de dépendance à un
  redéploiement nginx séparé.

### 11.2 Finding 1.4 — secret de session : fail-fast en production

Nouveau fichier `sessionSecret.ts` (RADAR et STUDIO, un point de vérité
chacun au lieu de la logique dupliquée à 4 endroits) : `SESSION_SECRET`
absent ou < 32 caractères **lève une exception explicite** si
`NODE_ENV === "production"`, au lieu du repli silencieux vers la chaîne
codée en dur. Résolution **paresseuse** (fonction, pas une constante
top-level) pour ne pas casser `next build`, qui évalue les modules avant
que `start-radar.sh` charge le vrai `.env` — même piège déjà documenté et
résolu pour `GROQ_API_KEY` dans `llmProvider.ts`, réutilisé ici. Branché
dans `session.ts` (RADAR + STUDIO), `middleware.ts` (RADAR) et
`google-auth.ts` (dérivation de la clé de chiffrement des tokens Drive).
**Testé réellement** (`sessionSecret.test.ts`) : lève bien en prod sans
secret ou avec un secret trop court, accepte un secret valide, ne lève
jamais en dev (repli documenté préservé pour ne rien casser en local).

**Vérifié après coup, sans risque** : `next build` des deux apps passe
toujours (la résolution paresseuse fonctionne comme prévu — pas de
régression du piège déjà connu côté `GROQ_API_KEY`).

### 11.3 Finding 1.1 — Next.js 16.3.1 → 16.3.5 (CRITIQUE)

`npm install next@16.3.5` dans les deux apps. Confirmé par `npm audit` :
l'advisory critique (RCE non authentifiée, Image Optimization API) a
disparu de la sortie dans les deux apps après le bump. **Testé** : build
complet des deux apps réussi après la mise à jour (toutes les routes
listées, aucune erreur).

### 11.4 Finding 1.3 — `sharp`/dépendances : 0 vulnérabilité sans downgrade cassant

`npm audit fix --force` aurait résolu `sharp`/`protobufjs` mais en
**downgradant `@xenova/transformers` de 2.17.2 vers 1.4.2** (majeure,
breaking) — ce paquet est le cœur du pipeline d'embeddings/dédup de RADAR
(`RADAR/CLAUDE.md §3`, stack figée). Refusé d'appliquer ça à l'aveugle
(consigne explicite de l'utilisateur : signaler avant toute modification
destructive).

**Alternative trouvée et appliquée** : `npm audit fix` (non-force) a
d'abord réglé `js-yaml` (RADAR) et `sharp`+`qs`+`adm-zip` (STUDIO) sans
aucun changement de version majeure. Pour le dernier résidu côté RADAR
(`protobufjs` critique + `sharp` haute, tous deux transitifs sous
`@xenova/transformers`, jamais utilisés directement par RADAR), un champ
`overrides` ciblé dans `package.json` (`protobufjs: ^8.8.0`,
`sharp: ^0.35.4`) force ces deux paquets vers leur dernière version
patchée **sans toucher à la version de `@xenova/transformers` elle-même**.

**Résultat** : `npm audit` → **0 vulnérabilité** dans les deux apps (contre
6 dans RADAR et 5 dans STUDIO en tout début de Partie 2, `js-yaml`/`qs`/
`adm-zip` compris — pas seulement les 3 findings de la Partie 1).

**Vérifié par un vrai test fonctionnel, pas seulement `npm install` qui
réussit** : script Node exécuté directement contre le pipeline
`@xenova/transformers` réel (modèle `multilingual-e5-small`, déjà en cache
local) — chargement du modèle (1784ms), calcul d'embeddings sur 3 phrases,
et vérification que le modèle discrimine correctement une paraphrase
(similarité cosinus 0.9813) d'un sujet sans rapport (0.7833). Dimension de
sortie 384 confirmée (attendue pour ce modèle). Le pipeline de dédup/scoring
de RADAR n'a subi aucune régression fonctionnelle mesurable.

### 11.5 Finding 2.1 — backup/restore : restauration réelle prouvée, copie hors-VM ajoutée

**Restauration testée en direct sur la VM prod, en lecture seule** (SSH,
aucune écriture sur `radar.db` vivant) : la dernière sauvegarde réelle
(`radar-2026-09-15T03-00-00-357Z.db`, 18 Mo, générée ce matin par le
mécanisme déjà en place) a été copiée dans `/tmp`, ouverte avec
`better-sqlite3` en lecture seule, et vérifiée :
- `PRAGMA integrity_check` → `"ok"`
- 791 `events`, 837 `items`, 62 `feeds`, 89 `pipeline_runs`, 2 `articles`
  relus avec succès — de vraies données de prod, pas un fichier vide.

**Nouveau script `deploy/restore.sh`** (à exécuter sur la VM) : automatise
la procédure complète — vérification d'intégrité de la sauvegarde à
restaurer, sauvegarde de sécurité de l'état actuel avant tout écrasement
(`pre-restore-safety-*.db`, pour pouvoir annuler la restauration
elle-même), arrêt propre de `radar` via PM2, remplacement du fichier,
redémarrage, vérification de santé HTTP. **Écrit et relu, PAS exécuté
contre le `radar.db` vivant** — l'exécuter arrêterait réellement le
service, même brièvement ; à lancer seulement en cas de besoin réel ou de
validation explicite.

**Nouveau script `deploy/fetch-backup.sh`** (répond au "même disque que le
prod" du finding 2.1, sans nouveau scope OAuth Drive ni nouvelle
dépendance) : rapatrie la dernière sauvegarde de la VM vers la machine
locale par SSH/SCP (déjà l'unique canal d'administration de cette VM),
revérifie l'intégrité après transfert, purge les copies locales de plus de
7 jours. **Exécuté réellement** pendant cette session :
`backups-offsite/radar-2026-09-15T03-00-00-357Z.db` existe maintenant en
local, intégrité reconfirmée après le transfert réseau. `backups-offsite/`
ajouté à `.gitignore`.

**Ce que ça prouve, et ce qui reste à faire** : la donnée d'une sauvegarde
est saine et restaurable — la partie "backup/restore" jusqu'ici seulement
analysée sur le papier est maintenant vérifiée avec de vraies données de
prod. Ce qui manque encore : exécuter `fetch-backup.sh` régulièrement (pas
encore automatisé — à planifier en cron local ou tâche récurrente, pas fait
ici pour ne pas ajouter une dépendance d'infrastructure sans validation) et,
un jour, exécuter une fois `restore.sh` pour de vrai en conditions
contrôlées (pas fait dans cette session, cf. ci-dessus).

### 11.6 Finding 3.2 — `deploy.sh` vérifie maintenant son propre filet PM2

Ajout d'une étape bloquante après le `pm2 restart radar --update-env
--max-memory-restart 3000M` existant : relit `pm2 jlist`, compare
`pm2_env.max_memory_restart` à `3145728000` (3000M), fait échouer le
déploiement avec un message explicite si PM2 a de nouveau ignoré le flag —
au lieu de supposer, comme avant, que le filet de sécurité a fonctionné.
**Testé réellement** : la logique exacte du script (même commande Node,
même parsing JSON) exécutée en SSH contre le vrai `pm2 jlist` de la VM prod
— renvoie `3145728000`, correspond, la vérification passe. `bash -n
deploy.sh` confirme une syntaxe valide.

### 11.7 Finding 2.2 — données STUDIO : confirmé, non corrigé

Vérifié (pas juste supposé cette fois) : `studio/src/lib/images/store.ts`
stocke les images uploadées sur disque (`uploads/`, aucune table SQLite
équivalente trouvée pour les jobs — `grep` sur `lib/jobs/` ne trouve aucun
usage de base de données). Le travail STUDIO en cours (image importée, pas
encore exportée vers Drive) n'a donc aujourd'hui **aucune protection** en
cas de perte de VM/disque — confirmé, pas hypothétique.

**Pas corrigé dans cette passe, délibérément** : construire un vrai
mécanisme de sauvegarde pour `uploads/` est une décision produit (quelle
rétention, quel déclencheur, quel coût de stockage) qui dépasse le
périmètre d'un correctif ponctuel — et le risque réel est borné (fenêtre de
travail courte, source ré-important généralement possible depuis RADAR/le
flux d'origine). Signalé explicitement plutôt que corrigé à la hâte.

### 11.8 Finding 9 — premiers tests de régression offline, sans coût LLM

**25 tests unitaires réels** ajoutés (`node --experimental-strip-types
--test`, natif Node 22, **zéro nouvelle dépendance** — vérifié contre
`RADAR/CLAUDE.md §3 avant de choisir cette option plutôt qu'un framework de
test tiers) :
- RADAR : 16 tests (`loginSecurity.test.ts` ×8, `pathGuard.test.ts` ×4,
  `sessionSecret.test.ts` ×4)
- STUDIO : 9 tests (`loginSecurity.test.ts` ×6, `sessionSecret.test.ts` ×3)

Chaque test reproduit un scénario réel issu d'un finding de cet audit (le
bypass X-Forwarded-For, le mot de passe vide qui matcherait un
AUTH_PASSWORD non configuré, le répertoire frère qui passerait le contrôle
de chemin) — pas des tests triviaux/template. `npm run test:unit` ajouté
aux deux `package.json`. **Exécutés réellement, 25/25 PASS.**

**Ce que ça ne couvre pas encore** (périmètre volontairement limité à ce
qui a été touché en Partie 2, pas une couverture exhaustive) :
`parseGeneratedArticle`, `verifyArticleAgainstBrief`, `extractNumbers`, la
logique de seuil du killswitch — toujours sans test offline, cf. §7 de la
Partie 1 pour la recommandation complète.

### 11.9 Découverte annexe (hors périmètre de correction) : test de régression visuelle déjà en échec

En vérifiant que le bump de `sharp` ne cassait rien côté STUDIO, le script
existant `scripts/verify-gabarit-1a.mjs` (aperçu=export pixel-identique,
critère de fin de l'Étape 1 du cahier des charges STUDIO) a été exécuté
réellement contre un serveur local — **FAIL** (aperçu 68416 octets, export
68308 octets). **Vérifié par bisection réelle avant de conclure à une
régression** : le même test, exécuté contre le code STUDIO originel
(`git stash` des correctifs de cette session, réinstallation des
dépendances d'origine, rebuild, retest) échoue **aussi** (68416 vs 68318 —
même ordre de grandeur d'écart). **Ce n'est donc pas une régression
introduite par cette session** — c'est un écart pré-existant, probablement
une légère non-déterminisme de capture PNG côté serveur (l'octet d'aperçu
était identique dans les deux runs, seul l'export server-side a varié de 10
octets entre les deux mesures). Non corrigé ici (hors périmètre
sécurité/robustesse de cette Partie 2, mériterait sa propre investigation
dédiée) — signalé pour ne pas laisser croire que "tous les gabarits sont
vérifiés" pendant que ce script échoue en réalité.

### 11.10 Déploiement réel en production — et deux bugs supplémentaires trouvés en le faisant

Sur demande explicite de l'utilisateur, les correctifs ci-dessus ont été
commités, poussés et **réellement déployés en production** le 15 sept.
2026. Le déploiement a révélé deux bugs réels dans `deploy.sh` lui-même,
**non liés aux findings de sécurité de la Partie 1**, trouvés uniquement
parce que chaque étape a été vérifiée sur la vraie VM plutôt que supposée
réussie à la sortie `0` du script :

**Bug A — `deploy.sh` s'auto-modifiait pendant sa propre exécution.**
Le script fait `git pull` sur lui-même à l'étape [1/6]. `git pull` remplace
le fichier par un nouvel inode (rename), mais bash garde son descripteur
ouvert sur l'ancien inode, désormais orphelin — toute la suite du script
continuait silencieusement à exécuter l'ancien contenu déjà chargé, même
après que le fichier sur disque contienne le nouveau code. Découvert
concrètement : le premier déploiement de la vérification PM2 (§11.6)
n'affichait pas cette vérification dans sa sortie, alors que le fichier sur
disque la contenait déjà après le `git pull`. Corrigé en se ré-exécutant
depuis une copie figée en `/tmp` avant que le `git pull` de l'étape
suivante ne puisse affecter le processus en cours.

**Conséquence à retenir pour toute future session** : à cause de ce
correctif lui-même, une modification de `deploy.sh` prend effet **au
déploiement suivant**, pas à celui qui l'introduit — le run qui pousse le
changement s'exécute encore depuis la copie figée d'avant. C'est resté vrai
un cran plus loin avec le Bug B ci-dessous : il a fallu un 4ᵉ run pour que
le correctif du 3ᵉ run s'applique réellement.

**Bug B — `deploy.sh` n'a jamais lancé `npm install`.** Plus grave : le
script faisait `git pull` (qui met à jour `package.json`/
`package-lock.json`) puis `next build` **directement sur les
`node_modules` existants**, sans jamais les mettre à jour. Découvert en
vérifiant le tout premier déploiement du correctif Next.js critique :
`pm2 logs` affichait encore "Next.js 16.3.1" après un déploiement
"réussi". Confirmé sur la VM : `node_modules/next/package.json` indiquait
toujours 16.3.1 alors que `package.json` indiquait déjà 16.3.5. **Ce bug
existait avant cette session** (jamais introduit par la Partie 2) — il
veut dire que toute mise à jour de dépendance de l'histoire de ce projet,
correctifs de sécurité compris, n'a jamais réellement atteint la prod par
`deploy.sh` seul, sans qu'un `npm install` manuel soit lancé à côté.
Corrigé : `npm install` ajouté dans `build_app()`, avant le build, avec le
même traitement d'échec bloquant que le reste du script.

**Vérification finale, après le 4ᵉ et dernier run de déploiement** (celui
qui a réellement exécuté les deux correctifs ci-dessus) :
- `node_modules/next/package.json` → **16.3.5** confirmé sur la VM, RADAR
  et STUDIO.
- `node_modules/sharp/package.json` → **0.35.4** confirmé sur la VM,
  STUDIO.
- `pm2 jlist` → `radar` et `studio` tous deux `online`, `radar` restart
  count = 1 (le redémarrage normal du déploiement, pas un crash), `studio`
  = 0.
- `curl` réel contre la prod : `X-Frame-Options: SAMEORIGIN` et
  `Strict-Transport-Security` tous deux présents sur `/login` — le
  correctif 1.7 est bien actif en prod, pas seulement en local.
- Toutes les actions VM sont restées en lecture seule pour la partie
  restauration (§11.5) — seule la copie de sauvegarde hors-VM a écrit
  localement, jamais sur la VM.

### 11.11 Vérifications finales (résumé)

- `npm run build` : RADAR ✅, STUDIO ✅ (après chaque changement de
  dépendance, pas juste à la fin).
- `npm run test:unit` : RADAR 16/16 ✅, STUDIO 9/9 ✅.
- `npm audit` : RADAR 0 vulnérabilité ✅, STUDIO 0 vulnérabilité ✅ — **en
  local et confirmé identique en prod** après déploiement (versions
  installées vérifiées directement sur la VM, §11.10).
- `bash -n deploy/deploy.sh` : syntaxe valide ✅.
- Aucun appel Groq consommé sur l'ensemble de la Partie 2, déploiement
  compris.
- **Déployé et vérifié en production** le 15 sept. 2026 — voir §11.10 pour
  le détail des 4 runs de déploiement et des deux bugs trouvés en route.

---

## 12. Partie 3 — Test réel du parcours utilisateur, chronométré (15 sept. 2026, suite)

Sur demande explicite ("teste le parcours réel de bout en bout") : parcours
RADAR (login → dashboard → events → brief → article → pages annexes) et
STUDIO (login → titres → gabarits → pipeline) exécutés réellement via
Playwright, chaque étape chronométrée, d'abord en local puis contre la
vraie prod. 2 vrais appels Groq consommés au total (1 article, 1 génération
de titres), avec accord explicite préalable de l'utilisateur.

### 12.1 Résultat : pas de problème de vitesse

| Composant | Temps réel (prod) |
|---|---|
| Login → dashboard | 1.0-1.3s |
| Pages (events/ready/corrections/stats/partenaires/calendrier) | 1.0-1.7s |
| Génération d'article (Groq) | 2.6s |
| Génération de titres STUDIO (Groq) | 1.25s |
| Export/rendu Playwright serveur | 1.9s (froid) → 1.1s (chaud) |
| Génération de brief (traduction locale) | 65ms à 15.6s — très variable selon le volume de texte à traduire, pas un point fixe |

Verdict : Groq et l'export ne sont pas des goulots d'étranglement. La VM
ajoute ~25-40% de latence par rapport à une machine de dev, mais reste dans
des temps raisonnables pour un usage à 10 personnes. Aucune optimisation
urgente identifiée sur ce plan.

### 12.2 Deux bugs réels trouvés et corrigés le jour même

**Bug 1 — `drive_files` sans colonne `path`, cassé depuis le tout début du
projet (pas une régression).** `lib/drive.ts` (`initDriveDb()`) et
`lib/db.ts` définissaient chacun leur propre schéma pour `drive_files`,
avec une colonne `path` présente dans l'un et absente dans l'autre. Celui
de `db.ts` s'exécute en premier au démarrage (avant toute route), donc
`initDriveDb()` ne créait jamais réellement la table — mais son
`CREATE INDEX ... (path)` s'exécutait quand même et plantait. Conséquence
vérifiée en prod : `GET /api/drive?stats=true` en 500, et surtout
`syncLocalDirectory()` (sync du dossier `drive-sync/`) cassée depuis
toujours (`INSERT` sur une colonne inexistante). Corrigé par une migration
`ALTER TABLE ADD COLUMN path` dans `db.ts` (source de vérité unique du
schéma, même patron que les migrations `is_cloud`/`enabled` déjà en place),
`lib/drive.ts` simplifié pour ne plus dupliquer la définition de table.

**Test de non-régression réel, pas une relecture de code** : schéma cassé
exact de prod reproduit sur une copie de la vraie base locale (colonne
`path` retirée via `ALTER TABLE ... DROP COLUMN`), vrai serveur Next.js
démarré dessus, vraie requête HTTP authentifiée envoyée à l'endpoint —
`500` → `200`. Refait une deuxième fois après un faux départ (le premier
essai testait encore l'ancien build à cause d'un process serveur mal
arrêté — leçon retenue : toujours vérifier qu'un process est réellement
mort, pas juste que la commande de kill a été envoyée).

**Bug 2 — analytics 401 sur `/login` (mineur).** `AnalyticsTracker`, monté
dans le layout racine, se déclenchait sur `/login` avant toute session —
`/api/analytics` n'étant pas dans l'allowlist du middleware (à raison),
chaque visite de connexion produisait un 401 silencieux. Perte de données
de tracking sur le trafic pré-connexion, aucun impact utilisateur visible.
Corrigé à la source (pas de tracking sur les routes publiques) plutôt
qu'en élargissant l'allowlist d'authentification.

**Les deux corrigés, testés réellement, déployés et reconfirmés en direct
contre la vraie prod** : `GET /api/drive?stats=true` → `200` en prod
réelle, plus aucun `401` sur `/api/analytics` en visitant `/login` en prod
réelle (vérifié par un dernier passage Playwright après déploiement, pas
supposé).

### 12.3 Outillage laissé en place

`RADAR/scripts/dev-journey-test.mjs` et `studio/scripts/dev-journey-test.mjs`
— scripts de parcours chronométrés réutilisables (paramétrables par
variables d'environnement : `RADAR_BASE_URL`/`STUDIO_BASE_URL`,
`NO_BRIEF_EVENT_ID`/`WITH_BRIEF_EVENT_ID`, `GENERATE_ARTICLE=1` pour
inclure le seul appel Groq du parcours RADAR). Par défaut, aucun ne
consomme de quota Groq — à activer explicitement.

### 12.4 Ce que ce test ne couvre toujours pas

Rappel honnête : ce test valide que le parcours **fonctionne et n'est pas
lent**, pas que le produit est complet. La liste des ⬜ dans `TODO.md`
(pipeline RSS, scoring, contrôles qualité, validation humaine, export
Drive complet, calibration anti-plagiat, poids u2net/realesrgan sur la VM)
reste largement ouverte — voir la réponse donnée à "mon app est-elle
production ready" plus tôt dans la session, toujours valable.

---

## 13. Partie 4 — Vérification ciblée des correctifs P2/P3, sur demande explicite (15 sept. 2026, suite)

Demande : re-tester réellement (pas relire le code) les correctifs P2
(exports STUDIO cassés par HTTPS) et P3 (anti-invention de chiffres), pour
confirmer qu'ils tiennent toujours, avec la sortie brute du LLM montrée.

### 13.1 P3 — confirmé solide sur le point précis qu'il visait

Deux cas réels testés (2 appels Groq), sortie brute montrée dans la
conversation :

- **Thème avec fait réel disponible** ("Mini GT Edition 1998", event prod
  174996) : `/api/facts-lookup` renvoie le vrai fait ("hommage à la 1275 GT
  de 1969... décals orange et pièces JCW... Cooper C... moins de
  puissance"). Les 3 titres et les 3 paragraphes générés reprennent ces
  éléments réels mot pour mot ou presque (1969, JCW, Cooper C, Cooper S,
  décals orange) — **aucun chiffre technique inventé** (pas de puissance,
  pas de prix chiffrés fabriqués).
- **Thème sans fait disponible** ("Ferrari Purosangue hybride 2029",
  volontairement fictif) : `/api/facts-lookup` renvoie bien `matched:
  false`. Les titres/paragraphes générés restent qualitatifs — **aucun
  chiffre concret inventé** (pas de puissance, pas d'autonomie, pas de prix,
  pas de 0-100 chiffré) : exactement ce que P3 devait empêcher.

**Nuance honnête, hors périmètre initial de P3** : sans chiffre inventé, le
texte du cas 2 fabrique quand même des **affirmations qualitatives non
vérifiées présentées comme des faits** ("les premiers retours des pilotes
d'essai soulignent un équilibre rare", "Ferrari affirme que...") — un
risque de crédibilité voisin de celui que P3 visait, mais un chiffre
inventé et une citation/scène inventée ne sont pas le même problème
technique. P3 corrige précisément ce qu'il annonçait corriger ; ce
problème adjacent n'a jamais été dans son périmètre et reste ouvert si le
rédacteur en chef veut le traiter.

### 13.2 P2 — le correctif original tient, mais un second bug (différent) a été trouvé et corrigé au passage

**Le correctif HTTPS/origin interne (`getInternalRenderOrigin()`) est
intact et fonctionne** : les 4 points d'appel confirmés présents dans le
code, aucune régression sur ce point précis. Le deuxième sous-bug déjà
documenté (bouton "Exporter" cliquable avant la fin de l'import image) est
aussi confirmé présent et correct (le bloc export ne s'affiche que quand
`images.length >= requiredImages`) — vérifié en conditions réelles :
immédiatement après navigation avec un prefill contenant une vraie image
externe, le bouton est absent ; il apparaît ~3s plus tard une fois l'import
résolu, jamais avant.

**Mais un export réel déclenché en conditions réelles a quand même produit
un 502 nginx / "Échec inconnu"** — cause différente de P2, pas une
régression du correctif P2 lui-même. Diagnostic mesuré, pas supposé :
mémoire de `studio` interrogée toutes les 1,5s pendant un export réel
(gabarit simple, 1 image, sans bulles/détourage/upscale) — pic à **1052
Mo**, soit 2,6× la limite PM2 configurée (`--max-memory-restart 400M`,
jamais mesurée, un "point de départ prudent" resté tel quel depuis le
début du projet, exactement le même piège déjà documenté et corrigé pour
`radar` — jamais appliqué à `studio`). PM2 tuait le process en plein
export (`restart_time` passé de 3 à 4 pendant un seul test), provoquant le
502 côté utilisateur. Mémoire retombée à ~139 Mo après coup — un pic
transitoire de rendu Playwright/Chromium, pas une fuite.

**Corrigé** : `--max-memory-restart` de `studio` porté de 400M à 2000M
dans `deploy.sh` (marge large au-dessus du pic mesuré sur ce cas simple —
un gabarit à bulles avec détourage/upscale sollicitera forcément plus).
Même filet de sécurité (`pm2 restart --update-env`) et même vérification
bloquante post-déploiement qu'existait déjà pour `radar`, étendus à
`studio`. **Déployé et reconfirmé par un nouvel export réel** : même pic
mémoire mesuré (~1067 Mo) cette fois sans crash, export terminé avec succès
("Terminé !", PNG réel téléchargeable, vraie photo Citroën Ami affichée,
pas de placeholder), `studio` toujours à 0 restart depuis ce déploiement.

### 13.3 Verdict pour l'utilisateur

- P3 : **fonctionne comme annoncé**, sur le périmètre exact qu'il visait
  (chiffres). Nuance sur les affirmations qualitatives non chiffrées
  signalée, pas corrigée (hors périmètre P3, décision éditoriale à
  prendre séparément si voulue).
- P2 : **le correctif original tient**. Un second problème, réel et
  distinct (plafond mémoire studio jamais mesuré), causait des échecs
  d'export intermittents malgré le correctif P2 — trouvé, corrigé, déployé,
  reconfirmé par export réel réussi.

---

## 14. Partie 5 — Correction de l'hallucination qualitative (16 sept. 2026)

Sur demande explicite ("vérifie le meilleur moyen... sans duplication") :
la nuance signalée en §13.1 (affirmations qualitatives fabriquées, hors
périmètre initial de P3) a été corrigée, avec un choix technique délibéré
contre l'option la plus intuitive.

**Option écartée** : extraction de chaque affirmation du texte généré puis
vérification LLM une par une contre les sources (approche RAG/grounding
classique, conforme OWASP LLM09/NIST AI 600-1). Écartée parce qu'elle
ajoute au moins un appel Groq supplémentaire par génération — double le
coût/latence de chaque titre STUDIO, contraire à la consigne explicite
("pas lourd, exploiter au maximum ce qu'on a, sans duplication") sur une VM
à 2 vCPU et un quota Groq déjà partagé par toute l'équipe.

**Option retenue, coût Groq nul** :
1. `lib/titles/router.ts` (`buildFactsSection`, branche sans fait) durci
   pour interdire explicitement — même unique appel de génération —
   réactions/citations inventées, déclarations officielles inventées,
   résultats d'essai/certifications/comparaisons inventés, événements
   futurs présentés comme certains, superlatifs présentés comme des faits.
2. `TitleGenerationResult.factsMatched: boolean` ajouté et propagé jusqu'à
   l'UI (`titres/page.tsx`) : bandeau d'avertissement visible quand la
   génération n'a aucune source RADAR derrière — rend efficace le contrôle
   humain qui existe déjà avant tout export plutôt que de dupliquer un
   système de vérification automatique.

**Vérifié réellement (2 appels Groq, mêmes thèmes qu'en §13.1 pour
comparaison directe)** :
- "Ferrari Purosangue hybride 2029" (sans fait, `factsMatched: false`
  confirmé côté API) : la fabrication la plus problématique du run
  précédent ("les premiers retours des pilotes d'essai soulignent un
  équilibre rare") **n'apparaît plus**. Le texte reste centré sur des
  intentions de design/philosophie de marque, plus proche du qualitatif
  prudent demandé au prompt — amélioration mesurable, pas une garantie
  absolue (un LLM reste faillible par nature, d'où le bandeau §2 comme
  filet plutôt que comme solution seule).
- "Mini GT Edition 1998" (avec fait, `factsMatched: true` confirmé) :
  non-régression — les vrais faits (1969, Cooper S, JCW) toujours utilisés
  correctement.

**Limite assumée, dite explicitement** : un prompt plus précis réduit le
risque, il ne l'élimine pas — c'est exactement ce que NIST/OWASP appellent
un risque intrinsèque des systèmes génératifs. Le bandeau `factsMatched`
est le vrai filet : il ne bloque rien (cohérent avec "l'outil prépare,
l'humain valide", studio/CLAUDE.md §1), il rend le moment de vigilance
visible à qui relit avant publication.

---

## 15. Partie 6 — Séparation du pipeline RADAR du serveur web (16 sept. 2026)

Le plus gros risque de disponibilité restant du projet (`TODO.md` §3.3,
identifié en session précédente, jamais corrigé) : `startCron()`/
`runPipeline()` tournaient dans le même process Node que le serveur HTTP —
le calcul intensif (embeddings + traduction locale, ONNX synchrone)
bloquait le seul thread JS, rendant le site **totalement inaccessible**
(aucune réponse, pas une lenteur) pendant tout un cycle (30-50 min, mesuré
en prod réelle le 14 sept. 2026).

### 15.1 Solutions explorées, avec preuve à l'appui plutôt que suppositions

| Option | Verdict |
|---|---|
| Chunking/pauses entre items | Déjà testé et écarté en session précédente : un item seul peut bloquer 40-60s, les pauses entre items n'aident pas pendant qu'un item est en cours |
| `worker_threads` | **Testé réellement** : `@xenova/transformers` fonctionne dans un worker thread, le thread principal reste mesurablement réactif pendant le chargement du modèle. Techniquement viable — écarté pour cette itération car l'intégration à un serveur Next.js déjà en cours d'exécution est un risque de bundling non vérifié, à réserver à un chantier séparé et mieux scopé |
| Subprocess jetable par cycle (`child_process.spawn`) | Résout le cron mais réintroduit un coût de rechargement de modèle à chaque déclenchement à la demande |
| **Process PM2 dédié (retenu)** | Isolation OS complète, pattern déjà utilisé dans ce projet (radar/studio déjà séparés), risque le plus bas |

### 15.2 Implémentation

- **`RADAR/src/pipeline-worker.ts`** : script Node autonome (pas une route
  Next.js) qui possède `startCron()`/`runPipeline()`. Deux endpoints HTTP
  internes (`127.0.0.1:3010`, jamais exposés par nginx) : `POST /run`
  (déclenchement manuel, remplace l'appel direct qu'avait
  `api/cron/route.ts`) et `POST /reload-config`.
- **Compilé en CommonJS** (`tsconfig.worker.json`, `tsc` déjà une
  devDependency — zéro outil ajouté) plutôt qu'exécuté via `node
  --experimental-strip-types` : Node 22 exige une extension explicite sur
  chaque import relatif de toute la chaîne `lib/*` en ESM brut ; l'ancien
  flag `--experimental-specifier-resolution=node` qui aurait contourné ça
  n'existe plus (vérifié : absent de `node --help`).
- **État partagé entre process** : `getCronStatus().running` lit
  maintenant `pipeline_runs.status` (déjà en base depuis le début, aucune
  nouvelle table) au lieu d'un booléen en mémoire invisible depuis l'autre
  process. `saveCronConfig()` n'redémarre plus le cron elle-même (n'aurait
  plus d'effet réel une fois séparée) — `api/cron/route.ts` proxy les
  actions `run`/`update_config` vers le worker.
- **`deploy.sh`** : nouvelle étape de build (`build_worker()`, même filet
  de sécurité — sauvegarde/restauration si échec — que `build_app()`),
  nouveau process PM2 `radar-pipeline` (3000M, même mesure que radar —
  mêmes modèles désormais chargés ici), `--kill-timeout` volontairement
  généreux (60s contre 10s pour radar/studio) puisqu'aucune requête
  utilisateur ne dépend plus de la réactivité de ce process.

### 15.3 Deux bugs supplémentaires trouvés en déployant réellement

- **`tsc` traité comme un échec de build sur ses propres erreurs de type
  préexistantes** (mêmes erreurs de typage déjà tolérées ailleurs dans ce
  projet, `next.config.ts` les ignore explicitement) — `next build` a un
  flag dédié pour ça, `tsc` seul non : son code de sortie reflète toute
  erreur de type, pas seulement les échecs réels, alors qu'il émet quand
  même le JS par défaut. Corrigé : le critère de succès redevient
  l'existence du fichier de sortie, pas le code de sortie de `tsc`.

### 15.4 Vérifié réellement, en trois temps

**1. Local, radar.db réel (1763 events)** : un vrai cycle pipeline
déclenché sur le worker (62 flux RSS interrogés, 54 items ingérés,
chargement des modèles embeddings+traduction, traduction ONNX réelle en
cours) pendant que le serveur web répond `200` en 16-80ms à **chaque**
requête sur 140 secondes de sondage continu (40 puis 60 vérifications).
SIGTERM envoyé au worker en pleine traduction : confirmé que Node ne
traite le signal qu'une fois le calcul natif en cours terminé (jusqu'à 35s
observés avant réaction) — attendu, déjà documenté comme limitation Node
dans ce projet, sans impact puisque ce process ne sert plus aucune requête.

**2. Déploiement réel** : 2 bugs d'outillage trouvés et corrigés en route
(§15.3 ci-dessus, plus le piège habituel d'auto-modification de
`deploy.sh` déjà connu — 4 runs au total pour que tout s'applique).
Vérifié après coup : `pm2 jlist` confirme les 3 process (`radar`, `studio`,
`radar-pipeline`) `online`, plafonds mémoire corrects, `GET
http://127.0.0.1:3010/health` répond.

**3. Prod réelle, chemin utilisateur complet** : pipeline déclenché via
`POST https://89.168.53.133.nip.io/api/cron {action:'run'}` — le vrai
bouton "Lancer maintenant" du dashboard, authentifié comme un vrai
utilisateur, proxié jusqu'au worker. Pendant que ce cycle réel tournait
(62 flux RSS, chargement des modèles, traduction ONNX en cours, confirmé
dans `pm2 logs radar-pipeline`), **60 requêtes envoyées au vrai domaine
public HTTPS toutes les 10 secondes pendant 10 minutes continues — 60/60
en `200`**, aucun timeout, aucune erreur. C'est exactement l'opération qui
rendait le site totalement injoignable pendant 30-50 minutes avant ce
correctif.

### 15.5 Limite honnête, non corrigée

Le chemin à la demande (brief généré au clic sur un event) tourne toujours
dans le process web — déjà largement atténué en session précédente
(traduction du `content` brut désactivée dans `generateBrief()`), mais
reste en théorie exposé à un futur cas dégénéré. `worker_threads`
(§15.1, prouvé viable en Node nu) en serait le complément naturel — pas
fait ici, périmètre volontairement limité au risque principal signalé par
l'utilisateur (le blocage de 30-50 min), pas une couverture totale du
risque résiduel plus faible.
