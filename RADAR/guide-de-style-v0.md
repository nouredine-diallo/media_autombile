# Guide de style — RADAR — Version 1 (basé sur 8 posts réels)

**Statut :** Première version calibrée sur du vrai contenu LMA.
**Source :** 8 posts réels de @lemediaautomobile (studio/inspi/TEXTPOST.txt)
**Dernière mise à jour :** 2026-08-26
**Prochaine révision prévue :** Après les 4-6 premières semaines de production réelle.

---

## Couche 1 — La voix (extraite des 8 posts réels)

### 1.1 Lexique préféré / évité

| Catégorie | Préféré | Évité |
|---|---|---|
| Véhicule | voiture, modèle, gamme | véhicule (trop technique) |
| Motorisation | bloc, architecture, transmission | — |
| Annonces | dévoile, présente, lance, introduit | sort, publie |
| Prix | à partir de, tarif de | coût de, prix de revient |
| Performances | 0 à 100, puissance, couple | accélération, rendement |
| Design | premium, haut de gamme, luxe | cher, coûteux |
| Sport | drift, glisse, restomod | dérive contrôlée, rétrofit |

### 1.2 Profil de registre

| Paramètre | Valeur | Source |
|---|---|---|
| Tutoiement ou vouvoiement | **Tutoiement** | Confirmé sur les 8 posts : "Tu veux suivre..." |
| Niveau d'enthousiasme | Modéré à complice | Jamais sensationnaliste, jamais froid |
| Humour | Rare, subtil si présent | Post 5 (Buick) = exception, ton complice |
| Anglais technique toléré | Oui pour termes établis | facelift, restylage, drift, restomod |

### 1.3 Tournures récurrentes

- "Seulement X mois après..." (constat temporel)
- "C'est officiel :..." (annonce confirmée)
- "Interrogé par [source], [nom] affirme que..." (citation journalistique)
- "Leur méthode ne nécessitait aucun..." (mise en contexte surprise)
- "POURQUOI... ? On vous explique." (accroche question + promesse)
- "Elle porte un [objet] à [prix] qui..." (accroche chiffrée)

### 1.4 Structure des titres

| Type | Longueur | Style | Exemple |
|---|---|---|---|
| Annonce | 30-60 car. | Phrase complète, factuel | "Max Verstappen prolonge avec Red Bull jusqu'en 2030" |
| Curiosité | 40-90 car. | Phrase intrigante ou question | "Dans cette publicité, ces parents offrent une voiture à celle qui acceptera de sortir avec leur fils" |
| Chiffré | 50-95 car. | Accroche + chiffre | "Elle porte un collier à 320 000 € qui cache tous les circuits de Formule 1" |

---

## Couche 2 — La structure (des 8 posts réels)

### 2.1 Longueur des contenus

| Type de contenu | Longueur observée | Plage |
|---|---|---|
| Titre (slide 1) | 8-18 mots | 30-95 caractères |
| Paragraphe (slide 2+) | 25-60 mots | 1-2 phrases |
| Description longue | 80-200 mots | 3-6 phrases |

### 2.2 Structure des paragraphes (slides)

**Pattern observé : 1 idée par slide, phrases courtes (15-25 mots)**

- Slide 1 (accroche) : le fait principal ou l'accroche intrigante
- Slide 2 (détail) : une pièce du récit, un chiffre, un témoignage
- Slide 3 (contexte) : ce qu'il faut retenir, la chute, la conclusion
- Slide 4 (CTA) : toujours le même — "Tu veux suivre toute l'actu automobile ?"

### 2.3 Structure des descriptions longues

**Pattern observé : Contexte + nuance + "ce qu'il faut retenir"**

1. Première phrase = résumé du fait (souvent identique au titre)
2. Deuxième phrase = contexte ou détails supplémentaires
3. Troisième phrase = nuance, counterpoint, "à noter toutefois"
4. Dernière phrase = ce qu'il faut retenir ou conclusion

### 2.4 Style des chiffres

**Règle : toujours contextualisés, jamais seuls**

- ✅ "302 645 joueurs simultanés, soit une baisse de 88 %"
- ✅ "estimée à 3 000 €, devra être intégralement remboursée"
- ✅ "plus de 800 millions de fans dans le monde"
- ❌ "302 645 joueurs" (sans contexte)
- ❌ "3 000 €" (sans backup)

### 2.5 Appels à l'action (CTA)

**Toujours le même sur les 8 posts :**
"Tu veux suivre toute l'actu automobile ? Alors abonne-toi dès maintenant à Le Média Automobile !"

Ne pas varier le CTA — c'est un élément de charte, pas de créativité.

---

## Couche 3 — Calibration (après premiers articles publiés)

> Cette section sera remplie après les 4-6 premières semaines de production réelle.
> Chaque correction faite par le rédacteur sera enregistrée comme donnée d'affinage.

### 3.1 Paires (généré → corrigé)

| Date | Article | Texte généré (résumé) | Texte corrigé (résumé) | Pattern observé |
|---|---|---|---|---|
| — | — | — | — | — |

> **TODO :** Remplir au fur et à mesure des corrections.

### 3.2 Mises à jour du guide

| Date | Version | Changement | Raison |
|---|---|---|---|
| 2026-08-18 | v0 | Création du template | Démarrage du projet |
| 2026-08-26 | v1 | Rempli avec 8 posts réels | Calibration sur le vrai contenu LMA |

---

## Sources RSS identifiées (Étape 0)

Voir le fichier `sources-rss.md` dans le même dossier.

---

## Notes de développement

- Le guide de style est un **fichier externe, remplaçable, jamais codé en dur**.
- Chaque article généré doit être relu plus attentivement que la normale tant que le guide n'est pas stabilisé.
- Les 8 posts réels servent de **few-shot dynamique** dans `content-engine.ts` — pas besoin de les copier dans chaque prompt.
- Le guide est versionné comme du code (dans le même dépôt Git).
- **Attention : le tutoiement est confirmé** — l'ancien prompt disait "vouvoiement", c'est une erreur. Les 8 posts disent tous "Tu veux suivre...".
