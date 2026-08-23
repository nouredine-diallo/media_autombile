---
name: avis-design
description: >-
  Use when the user asks for an aesthetic critique, design opinion, or visual
  quality judgment ("avis esthétique", "critique", "qu'en penses-tu",
  "note ce visuel", "compare à l'inspi") of any montage, gabarit render,
  bulle composition, or photo of the STUDIO_AUTOMOBILE project — OR when the
  user proposes a design improvement and wants it applied. Delegates pixel
  analysis to the vision subagent, then synthesizes a structured critique
  aligned with the Le Média Automobile charte.
---

# Avis Design — Charte Le Média Automobile

Tu es text-only : toute analyse visuelle passe par le sous-agent vision
(`vision-google-gemini-3.7-flash`, choix persisté dans
`~/.config/opencode/vision-model-image.txt`). Ne décris jamais une image
sans l'avoir déléguée.

## Workflow

1. **Localise** le(s) chemin(s) d'image (message utilisateur, `inspi/`,
   exports `/public/exports`, captures de `/render/[gabaritId]`).
2. **Délègue** au sous-agent vision avec le prompt structuré ci-dessous.
   Une délégation par image ; pour comparer N images, inclue les chemins
   dans un seul prompt avec instruction de comparaison.
3. **Synthétise** : verdict chiffré + défauts hiérarchisés + améliorations
   concrètes mappées au code. Sois critique, pas complaisant — l'objectif
   est 10/10 comme les références `inspi/`.

## Prompt de délégation (template)

Évalue cette image de montage automobile selon la charte. Réponds en JSON :
`{verdict_notes_sur_10, defauts_majeurs[], defauts_mineurs[], details}`.

Critères à inspecter, dans l'ordre :

1. **Bulles rondes (signature)** : le sujet doit DÉBORDER proprement du
   cercle. Vérifie : arc franchi ≤ 24 % ET remplissage ≤ 55 % (au-delà =
   bavure, rien ne dépasse visuellement) ; découpe nette SANS halo clair,
   liseré, bord dur ou frange de pixels autour du sujet ; pas de
   pixelisation sur le contour débordant.
2. **Cadrage sujet** : voiture entière ou point focal complet, pas de coupe
   brutale du capot/roues/pneu par le bord du cercle ; sujet ≥ 45 % de la
   largeur du slot.
3. **Composition** : marges équilibrées, hiérarchie visuelle claire, la
   couche sujet ne masque pas plus de ~45 % d'une bulle ; alignements
   verticaux/horizontaux des slots.
4. **Typo & footer** : titre lisible, contraste suffisant sur le fond,
   courbe du bandeau titre cohérente avec la hauteur des photos.
5. **Cohérence globale** : lumière/colorimétrie homogène entre couches,
   aucun artefact de redimensionnement, rendu professionnel type presse auto.

## Synthèse finale (ton message)

- **Verdict : X/10**
- **Majeurs** (bloquants export) : liste avec localisation précise dans
  l'image ("bulle haut-gauche : halo blanc autour du capot").
- **Mineurs** : liste courte.
- **Correctifs actionnables** : pour chaque défaut, le fichier concerné
  (`src/components/gabarits/Bulle.tsx`, `src/lib/images/gabaritFit.ts`,
  `src/lib/images/smartCrop.ts`…). Si le correctif est purement visuel et
  non codable, dis-le franchement.

Si l'utilisateur propose une amélioration design : évalue-la d'abord à
l'aune de cette charte (débordement propre, cadrage, lisibilité), puis
implémente-la en respectant CLAUDE.md §1 (aperçu = export au pixel).
