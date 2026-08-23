# Sources RSS — RADAR (Étape 0)

**Critère de fin :** au moins 10 sources RSS/communiqués identifiées.
**Dernière vérification :** 2026-08-18

---

## 1. Salles de presse constructeurs (flux RSS officiels)

### 1.1 Groupe Stellantis (Peugeot, Citroën, DS, Opel, Fiat, Jeep, Alfa Romeo, Maserati)

| Marque | URL RSS | Langue |
|---|---|---|
| **Stellantis Corporate** | `https://www.media.stellantis.com/me-en/corporate/rss` | EN |
| **Peugeot** (France) | `https://www.media.stellantis.com/fr-fr/peugeot/rss` | FR |
| **Citroën** (France) | `https://www.media.stellantis.com/fr-fr/citroen/rss` | FR |
| **DS Automobiles** | `https://www.media.stellantis.com/fr-fr/ds/rss` | FR |
| **Opel/Vauxhall** | `https://www.media.stellantis.com/uk-en/opel/rss` | EN |

> **Note :** Stellantis utilise le même hébergeur media.stellantis.com pour toutes ses marques. Les URLs varient par le préfixe pays/langue (`fr-fr`, `uk-en`, `em-en`, etc.).

### 1.2 Groupe Volkswagen (VW, Audi, Porsche, Škoda, Seat/Cupra)

| Marque | URL RSS | Langue |
|---|---|---|
| **Volkswagen Group** | `https://www.volkswagen-group.com/en/press-releases` (pas de RSS natif, à scraper) | EN |
| **Volkswagen Newsroom** | `https://www.volkswagen-newsroom.com/en` (push service par email, pas de RSS) | EN |

> **Note :** VW Group n'offre pas de RSS natif — nécessite Playwright pour scraping.

### 1.3 BMW Group (BMW, Mini, Rolls-Royce)

| Marque | URL RSS | Langue |
|---|---|---|
| **BMW PressClub Global** | `https://www.press.bmwgroup.com/global/article/list/5236` (pas de RSS natif, à scraper) | EN |

> **Note :** BMW PressClub n'offre pas de RSS natif — nécessite Playwright.

### 1.4 Mercedes-Benz

| Marque | URL RSS | Langue |
|---|---|---|
| **Mercedes-Benz Media** | `https://media.mercedes-benz.com` (pas de RSS natif, à scraper) | EN |

> **Note :** Pas de RSS natif — nécessite Playwright.

### 1.5 Toyota

| Marque | URL RSS | Langue |
|---|---|---|
| **Toyota Global** | `https://global.toyota/export/en/allnews_rss.xml` | EN |
| **Toyota USA Newsroom** | `https://pressroom.toyota.com/rss-feeds/` (plusieurs flux) | EN |

### 1.6 Honda

| Marque | URL RSS | Langue |
|---|---|---|
| **Honda Global IR** | `https://global.honda/en/investors/rss.html` | EN |

> **Note :** Flux IR uniquement — pas de flux presse produit.

### 1.7 Renault Group

| Marque | URL RSS | Langue |
|---|---|---|
| **Renault Group** | `https://group.renault.com/fr/actualites/` (pas de RSS natif, à scraper) | FR |

> **Note :** Pas de RSS natif — nécessite Playwright.

---

## 2. Institutions et régulateurs

| Organisme | URL RSS | Langue | Type |
|---|---|---|---|
| **ACEA** (Association des constructeurs européens) | `https://www.acea.auto/feed/` (à vérifier) | EN | Communiqués, chiffres de marché |
| **Euro NCAP** | `https://www.euroncap.com/feed/` (à vérifier) | EN | Tests de sécurité, résultats |
| **CCFA** (Comité des constructeurs français) | `https://ccfa.fr/feed/` (à vérifier) | FR | Immatriculations France/Europe |
| **PFA** (Plateforme Automobile France) | `https://www.pfa.automobile.fr/feed/` (à vérifier) | FR | Analyse marché, lettres mensuelles |

---

## 3. Presse spécialisée (signal uniquement, pas source de texte)

> **Rappel du cahier des charges §3.2 :** "Presse spécialisée — utilisée uniquement comme signal de ce qui est chaud, jamais comme source de texte (contrainte du droit voisin)."

| Site | URL RSS | Usage |
|---|---|---|
| **Automobile Magazine** | `https://www.automobile-magazine.fr/rss` | Signal de tendance |
| **Caradisiac** | `https://www.caradisiac.com/rss/` | Signal de tendance |
| **AutoActu** | `https://www.autoactu.com/rss/` | Signal de tendance |
| **汽车之家 (Autohome)** | `https://www.autohome.com.cn/rss/` | Signal marché chinois |

> **Note :** Ces sources ne JAMAIS utilisées comme source de texte pour les briefs. Elles servent uniquement à mesurer la "vélocité" (nombre de mentions = signal de chaleur).

---

## 4. Résumé par priorité

| Priorité | Source | RSS natif | Scrape requis |
|---|---|---|---|
| **1 - Critique** | Stellantis (toutes marques) | ✅ | — |
| **2 - Haute** | Toyota Global | ✅ | — |
| **3 - Haute** | Euro NCAP | À vérifier | — |
| **4 - Haute** | CCFA (immatriculations FR) | À vérifier | — |
| **5 - Moyenne** | ACEA | À vérifier | — |
| **6 - Moyenne** | VW Group | ❌ | ✅ Playwright |
| **7 - Moyenne** | BMW PressClub | ❌ | ✅ Playwright |
| **8 - Moyenne** | Mercedes-Benz Media | ❌ | ✅ Playwright |
| **9 - Moyenne** | Renault Group | ❌ | ✅ Playwright |
| **10 - Signal** | Presse spécialisée (FR) | ✅ | — |

---

## 5. Prochaines étapes

1. **Vérifier les flux "À vérifier"** — certains sites peuvent avoir des RSS qui ne sont pas documentés
2. **Tester la lisibilité** de chaque flux avec un parseur RSS standard en Node.js
3. **Implémenter le scraping Playwright** pour les sources sans RSS natif (VW, BMW, Mercedes, Renault)
4. **Hiérarchiser par fiabilité juridique** conformément au cahier des charges §3.2 :
   - Niveau 1 : Salles de presse (communiqués officiels)
   - Niveau 2 : Institutions (ACEA, PFA, Euro NCAP)
   - Niveau 3 : Presse spécialisée (signal uniquement)
   - Niveau 4 : Reddit/forums (détection précoce)

---

## 6. Notes techniques

- Le parseur RSS en Node.js (`rss-parser` ou équivalent) peut lire les flux natifs.
- Pour les sites sans RSS, Playwright sera utilisé pour extraire les titres et dates des communiqués.
- Chaque item doit être stocké avec : titre, date, URL, source, marque (si applicable), contenu brut.
- La déduplication par embeddings (§3.3 du cahier des charges) s'applique après l'ingestion.
