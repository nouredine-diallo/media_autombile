import type { ComponentType } from "react";
import Gabarit1A from "./Gabarit1A";
import Gabarit1B from "./Gabarit1B";
import GabaritCTA, { CTA_DEFAUT } from "./GabaritCTA";
import Gabarit2A from "./Gabarit2A";
import Gabarit2B from "./Gabarit2B";
import Gabarit3A from "./Gabarit3A";
import Gabarit3B from "./Gabarit3B";
import { GABARIT_1A_HEIGHT, GABARIT_1A_WIDTH } from "./Gabarit1A";

export const GABARIT_WIDTH = GABARIT_1A_WIDTH;
export const GABARIT_HEIGHT = GABARIT_1A_HEIGHT;

export interface GabaritField {
  key: string;
  label: string;
  /**
   * `geometry` : réglage produit par la **manipulation directe sur l'aperçu**
   * (déplacer/redimensionner une bulle, activer son débordement). Transmis au
   * rendu et à l'export comme n'importe quel champ — c'est ce qui garantit que
   * ce que l'opérateur voit est exactement ce qui sort (CLAUDE.md §1) — mais
   * jamais présenté comme un champ de saisie : on ne tape pas des coordonnées,
   * on déplace la bulle.
   */
  kind: "text" | "textarea" | "image" | "geometry";
}

export interface GabaritDef {
  id: string;
  label: string;
  fields: GabaritField[];
  Component: ComponentType<Record<string, string>>;
  defaults: Record<string, string>;
}

const PLACEHOLDER = "/test/placeholder-photo.jpg";

/**
 * Registre des gabarits construits en Étape 4 (au-delà de 1A, qui garde ses
 * routes dédiées depuis l'Étape 1 pour ne pas risquer de régresser sa
 * vérification pixel-exacte déjà en place). Chaque entrée pilote une route
 * de rendu, une route d'export et un écran d'aperçu génériques
 * (src/app/render/[gabaritId], src/app/api/render/[gabaritId],
 * src/app/gabarits/[gabaritId]) — mécanisme ajouté maintenant que 5
 * gabarits existent (règle de trois), pour ne pas dupliquer la même
 * plomberie Playwright/aperçu 5 fois.
 */
export const GABARITS: Record<string, GabaritDef> = {
  // 1A est entré dans le registre le 2026-08-21 : sans lui, la famille
  // « une seule image » était **inaccessible depuis le parcours** (elle
  // n'existait que par ses routes dédiées, héritées de l'Étape 1). Ces routes
  // dédiées restent en place et priment sur les routes génériques — la
  // vérification pixel-exacte `verify-gabarit-1a.mjs` continue donc de porter
  // sur exactement le même rendu.
  "1a": {
    id: "1a",
    label: "1A — Image seule + titre",
    fields: [
      { key: "imageUrl", label: "Image", kind: "image" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "title", label: "Titre", kind: "textarea" },
    ],
    // Gabarit1A a une signature typée (props nommées) là où le registre
    // passe un `Record<string, string>` générique ; l'adaptateur fait le pont
    // sans toucher au composant, dont le test pixel-exact dépend.
    Component: (props: Record<string, string>) => (
      <Gabarit1A imageUrl={props.imageUrl ?? ""} title={props.title ?? ""} />
    ),
    defaults: {
      imageUrl: PLACEHOLDER,
      imageCadre: "",
      title: "Titre d'exemple pour le gabarit 1A",
    },
  },
  // 1C réutilise Gabarit1A tel quel (même composant que "1a"), avec le champ
  // `eyebrow` rempli — c'est le gabarit "surtitre + image + titre" d'origine
  // (construit en Étape 4 sous le nom "1B", avant que ce nom soit repris pour
  // le vrai 1B "image + paragraphe" de specStudio.md). Pas de nouveau fichier
  // composant : TitleFooter.tsx supportait déjà `eyebrow`, seul le pont entre
  // 1A et ce prop manquait — voir Gabarit1A.tsx.
  "1c": {
    id: "1c",
    label: "1C — Surtitre + image + titre",
    fields: [
      { key: "imageUrl", label: "Image", kind: "image" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "eyebrow", label: "Surtitre", kind: "textarea" },
      { key: "title", label: "Titre", kind: "textarea" },
    ],
    // `data-gabarit="1c"` en enveloppe : Gabarit1A porte en dur son propre
    // `data-gabarit="1a"` (utilisé par la route d'export Playwright pour
    // localiser l'élément à capturer) — sans cette enveloppe de mêmes
    // dimensions, l'export de "1c" chercherait un sélecteur qui n'existe
    // jamais et expirerait. Le rendu visuel est inchangé (l'enfant remplit
    // exactement l'enveloppe).
    Component: (props: Record<string, string>) => (
      <div data-gabarit="1c" style={{ width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT }}>
        <Gabarit1A
          imageUrl={props.imageUrl ?? ""}
          title={props.title ?? ""}
          eyebrow={props.eyebrow || undefined}
          imageCadre={props.imageCadre}
        />
      </div>
    ),
    defaults: {
      imageUrl: PLACEHOLDER,
      imageCadre: "",
      eyebrow: "Une touche japonaise pour séduire les internautes",
      title: "Titre d'exemple pour le gabarit 1C",
    },
  },
  "1b": {
    id: "1b",
    label: "1B — Image + paragraphe",
    fields: [
      { key: "imageUrl", label: "Image de fond", kind: "image" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "paragraph", label: "Paragraphe ( supporte **gras** )", kind: "textarea" },
    ],
    Component: (props: Record<string, string>) => (
      <Gabarit1B
        imageUrl={props.imageUrl ?? ""}
        paragraph={props.paragraph ?? ""}
        imageCadre={props.imageCadre}
      />
    ),
    defaults: {
      imageUrl: PLACEHOLDER,
      imageCadre: "",
      paragraph:
        "Forza Horizon 6 perd déjà une grande partie de ses joueurs, seulement trois mois après sa sortie. **302 645 joueurs simultanés**, soit une baisse de 88 % par rapport au pic de launch. Le studio Playground Games affirme travailler sur des mises à jour pour stabiliser la base.",
    },
  },
  // Toujours la dernière slide d'un carrousel (Outro/CTA) — structurellement
  // différent de 1A/1B/1C (pas de bandeau noir), voir GabaritCTA.tsx pour
  // les mesures. Composant dédié, pas de réutilisation de Gabarit1A ici :
  // la mise en page (texte en haut, sans dégradé) n'a rien de commun.
  cta: {
    id: "cta",
    label: "CTA — Fin de carrousel",
    fields: [
      { key: "imageUrl", label: "Image d'ambiance", kind: "image" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "message", label: "Message (préchargé, éditable)", kind: "textarea" },
    ],
    Component: (props: Record<string, string>) => (
      <GabaritCTA
        imageUrl={props.imageUrl ?? ""}
        message={props.message}
        imageCadre={props.imageCadre}
      />
    ),
    defaults: {
      imageUrl: PLACEHOLDER,
      imageCadre: "",
      message: CTA_DEFAUT,
    },
  },
  "2a": {
    id: "2a",
    label: "2A — Image de fond + 1 bulle (centrée)",
    fields: [
      { key: "imageUrl", label: "Image de fond", kind: "image" },
      { key: "bulleUrl", label: "Image de la bulle", kind: "image" },
      { key: "sujetUrl", label: "Découpe du sujet (optionnel)", kind: "image" },
      { key: "bulleSujetUrl", label: "Débordement de la bulle (optionnel)", kind: "image" },
      { key: "bulleGeom", label: "Position de la bulle", kind: "geometry" },
      { key: "bulleCadre", label: "Cadrage de la bulle", kind: "geometry" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "title", label: "Titre", kind: "textarea" },
    ],
    Component: Gabarit2A,
    defaults: {
      imageUrl: PLACEHOLDER,
      bulleUrl: PLACEHOLDER,
      sujetUrl: "",
      bulleSujetUrl: "",
      bulleGeom: "",
      bulleCadre: "",
      imageCadre: "",
      title: "Titre d'exemple pour le gabarit 2A",
    },
  },
  "2b": {
    id: "2b",
    label: "2B — Image de fond + 1 bulle (décalée)",
    fields: [
      { key: "imageUrl", label: "Image de fond", kind: "image" },
      { key: "bulleUrl", label: "Image de la bulle", kind: "image" },
      { key: "sujetUrl", label: "Découpe du sujet (optionnel)", kind: "image" },
      { key: "bulleSujetUrl", label: "Débordement de la bulle (optionnel)", kind: "image" },
      { key: "bulleGeom", label: "Position de la bulle", kind: "geometry" },
      { key: "bulleCadre", label: "Cadrage de la bulle", kind: "geometry" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "title", label: "Titre", kind: "textarea" },
    ],
    Component: Gabarit2B,
    defaults: {
      imageUrl: PLACEHOLDER,
      bulleUrl: PLACEHOLDER,
      sujetUrl: "",
      bulleSujetUrl: "",
      bulleGeom: "",
      bulleCadre: "",
      imageCadre: "",
      title: "Titre d'exemple pour le gabarit 2B",
    },
  },
  "3a": {
    id: "3a",
    label: "3A — Image de fond + 2 bulles (symétrique)",
    fields: [
      { key: "imageUrl", label: "Image de fond", kind: "image" },
      { key: "bulle1Url", label: "Bulle 1 (gauche)", kind: "image" },
      { key: "bulle2Url", label: "Bulle 2 (droite)", kind: "image" },
      { key: "sujetUrl", label: "Découpe du sujet (optionnel)", kind: "image" },
      { key: "bulle1SujetUrl", label: "Débordement bulle 1 (optionnel)", kind: "image" },
      { key: "bulle2SujetUrl", label: "Débordement bulle 2 (optionnel)", kind: "image" },
      { key: "bulle1Geom", label: "Position bulle 1", kind: "geometry" },
      { key: "bulle2Geom", label: "Position bulle 2", kind: "geometry" },
      { key: "bulle1Cadre", label: "Cadrage bulle 1", kind: "geometry" },
      { key: "bulle2Cadre", label: "Cadrage bulle 2", kind: "geometry" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "title", label: "Titre", kind: "textarea" },
    ],
    Component: Gabarit3A,
    defaults: {
      imageUrl: PLACEHOLDER,
      bulle1Url: PLACEHOLDER,
      bulle2Url: PLACEHOLDER,
      sujetUrl: "",
      bulle1SujetUrl: "",
      bulle2SujetUrl: "",
      bulle1Geom: "",
      bulle2Geom: "",
      bulle1Cadre: "",
      bulle2Cadre: "",
      imageCadre: "",
      title: "Titre d'exemple pour le gabarit 3A",
    },
  },
  "3b": {
    id: "3b",
    label: "3B — Image de fond + 2 bulles (asymétrique)",
    fields: [
      { key: "imageUrl", label: "Image de fond", kind: "image" },
      { key: "bulle1Url", label: "Bulle 1 (grande, gauche)", kind: "image" },
      { key: "bulle2Url", label: "Bulle 2 (petite, droite)", kind: "image" },
      { key: "sujetUrl", label: "Découpe du sujet (optionnel)", kind: "image" },
      { key: "bulle1SujetUrl", label: "Débordement bulle 1 (optionnel)", kind: "image" },
      { key: "bulle2SujetUrl", label: "Débordement bulle 2 (optionnel)", kind: "image" },
      { key: "bulle1Geom", label: "Position bulle 1", kind: "geometry" },
      { key: "bulle2Geom", label: "Position bulle 2", kind: "geometry" },
      { key: "bulle1Cadre", label: "Cadrage bulle 1", kind: "geometry" },
      { key: "bulle2Cadre", label: "Cadrage bulle 2", kind: "geometry" },
      { key: "imageCadre", label: "Cadrage du fond", kind: "geometry" },
      { key: "title", label: "Titre", kind: "textarea" },
    ],
    Component: Gabarit3B,
    defaults: {
      imageUrl: PLACEHOLDER,
      bulle1Url: PLACEHOLDER,
      bulle2Url: PLACEHOLDER,
      sujetUrl: "",
      bulle1SujetUrl: "",
      bulle2SujetUrl: "",
      bulle1Geom: "",
      bulle2Geom: "",
      bulle1Cadre: "",
      bulle2Cadre: "",
      imageCadre: "",
      title: "Titre d'exemple pour le gabarit 3B",
    },
  },
};
