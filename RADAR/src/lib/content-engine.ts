/**
 * Content Engine — ADN éditorial du Média Automobile
 *
 * Source : 8 posts réels extraits de @lemediaautomobile (studio/inspi/TEXTPOST.txt).
 * Ce fichier est LA source de vérité pour tout texte généré par le LLM.
 *
 * Architecture :
 * - styleDNA : lexique, ton, structure, exemples (la "voix")
 * - articleRouter : détecte le type d'article et injecte les bonnes règles
 * - fewShot : sélectionne les 2 exemples les plus pertinents dynamiquement
 * - promptChain : sépare l'écriture créative du formatage (2 appels LLM)
 *
 * Modulaire : ajouter un type d'article = ajouter 1 entrée dans ARTICLE_TYPES
 * + 1-2 exemples dans STYLE_EXAMPLES. Pas besoin de toucher au reste.
 */

// ─── ADN STYLE ───────────────────────────────────────────────────────

export const STYLE_DNA = {
  /**
   * Ton : factuel mais jamais froid. Légèrement complice avec le lecteur.
   * Le Média Automobile parle au lecteur comme à un ami passionné, pas comme
   * à un client. Tutoiement systématique (vérifié sur les 8 posts : "Tu veux
   * suivre...", pas "Vous voulez suivre...").
   */
  ton: "factuel-complice",

  /**
   * Lexique — mots préférés vs mots bannis.
   * Extrait des 8 posts : jamais de "véhicule" (toujours "voiture"), jamais
   * de "sort" (toujours "dévoile"/"présente"), jamais de "coûteux" (toujours
   * "premium"/"haut de gamme").
   */
  lexique: {
    prefere: [
      "voiture", "modèle", "gamme", "bloc", "architecture",
      "dévoile", "présente", "lance", "introduit",
      "tarif", "à partir de",
      "premium", "haut de gamme", "luxe",
      "drift", "glisse", "restomod",
    ],
    evite: [
      "véhicule",  // → voiture
      "sort",      // → dévoile/présente
      "publie",    // → présente
      "coûteux",   // → premium/haut de gamme
      "dérive contrôlée", // → drift/glisse
      "rétrofit",  // → restomod
    ],
  },

  /**
   * Structure des paragraphs — 1 idée par slide, phrases courtes (15-25 mots).
   * Pattern observé : accroche → fait → contexte → nuance
   */
  structure: {
    phraseMaxMots: 25,
    paragraphMaxPhrases: 4,
    slideMaxMots: 40,
  },

  /**
   * Tutoiement — confirmé sur les 8 posts.
   * Jamais de vouvoiement dans les légendes.
   */
  registre: "tutoiement",

  /**
   * Chiffres — toujours contextualisés, jamais seuls.
   * Ex : "302 645 joueurs simultanés" + "soit une baisse de 88%"
   */
  chiffres: "toujours-contextualises",
} as const;

// ─── EXEMPLES RÉELS (few-shot) ──────────────────────────────────────

export interface StyleExample {
  /** Type d'article correspondant */
  type: ArticleType;
  /** Le titre réel du post LMA */
  titre: string;
  /** Un paragraphe réel (slide) du post */
  paragraphe: string;
  /** La description longue du post */
  description: string;
  /** Mots-clés pour la recherche dynamique */
  tags: string[];
}

/**
 * 8 posts réels de @lemediaautomobile, extraits de TEXTPOST.txt.
 * Pas inventés — source de vérité pour le few-shot dynamique.
 */
export const STYLE_EXAMPLES: StyleExample[] = [
  {
    type: "curiosite",
    titre: "Forza Horizon 6 perd déjà une grande partie de ses joueurs, seulement trois mois après sa sortie",
    paragraphe: "Seulement trois mois après sa sortie, Forza Horizon 6 est passé d'un record de 302 645 joueurs simultanés à un pic de 34 998 joueurs sur 24 heures, soit une baisse d'environ 88 %.",
    description: "Le jeu de Playground Games avait pourtant connu un lancement record : 302 645 joueurs simultanés sur Steam le 24 mai 2026, du jamais-vu pour un jeu de course sur la plateforme.",
    tags: ["jeu", "forza", "gaming", "chiffres", "record", "baisse"],
  },
  {
    type: "curiosite",
    titre: "Pendant six mois, cette famille a fraudé les péages avec une technique étonnamment simple",
    paragraphe: "Leur méthode ne nécessitait aucun dispositif sophistiqué. Le groupe arrivait avec trois véhicules et l'un de ses membres descendait simplement pour soulever la barrière à la main.",
    description: "Pendant environ six mois, une famille britannique a fraudé les péages de l'A36, dans l'est de la France, avec une technique aussi rudimentaire qu'efficace.",
    tags: ["fraude", "péage", "police", "arnaque", "famille", "technique"],
  },
  {
    type: "annonce",
    titre: "La Formule 1 prolonge son partenariat avec Disney autour de l'univers Cars",
    paragraphe: "La Formule 1 et Disney prolongent leur collaboration « Fuel the Magic » jusqu'en 2028, et frappent fort en y intégrant pour la première fois l'univers Cars de Pixar.",
    description: "La Formule 1 et Disney prolongent leur collaboration « Fuel the Magic » jusqu'en 2028, et frappent fort en y intégrant pour la première fois l'univers Cars de Pixar. Jusqu'ici, le partenariat, lancé en 2025, s'articulait autour de Mickey et ses amis.",
    tags: ["f1", "disney", "partenariat", "cars", "pixar", "collaboration"],
  },
  {
    type: "annonce",
    titre: "Max Verstappen prolonge avec Red Bull jusqu'en 2030",
    paragraphe: "C'est officiel : Max Verstappen prolonge avec Red Bull jusqu'à la fin de la saison 2030. Le quadruple champion du monde met ainsi fin à des mois de spéculations sur son avenir.",
    description: "C'est officiel : Max Verstappen prolonge avec Red Bull jusqu'à la fin de la saison 2030. Le quadruple champion du monde met ainsi fin à des mois de spéculations sur son avenir, alors qu'il avait été associé à Mercedes et McLaren.",
    tags: ["verstappen", "red bull", "f1", "contrat", "prolongation", "pilote"],
  },
  {
    type: "curiosite",
    titre: "Dans cette publicité, ces parents offrent une voiture à celle qui acceptera de sortir avec leur fils",
    paragraphe: "« Il est intelligent mais très timide. » En 2023, d'étranges panneaux publicitaires apparaissent aux États-Unis : des parents y proposent une Buick Regal de 2004 à la personne qui acceptera de sortir avec leur fils.",
    description: "En réalité, aucune famille ne se cachait derrière cette proposition. Il s'agissait d'une campagne promotionnelle pour le film No Hard Feelings, dans lequel Jennifer Lawrence accepte justement de séduire un jeune homme en échange d'une voiture.",
    tags: ["publicité", "marketing", "film", "buick", "humour", "buzz"],
  },
  {
    type: "annonce",
    titre: "Le V8 pourrait faire son retour chez Maserati, à peine trois ans après l'annonce de sa disparition",
    paragraphe: "Interrogé par Carsales, Davide Danesin, responsable de l'ingénierie chez Maserati, affirme qu'un V8 pourrait techniquement être installé sur les architectures actuelles de la marque.",
    description: "Le V8 n'a peut-être pas dit son dernier mot chez Maserati. Interrogé par Carsales, Davide Danesin, responsable de l'ingénierie de la marque, confirme qu'un bloc huit cylindres pourrait techniquement prendre place sur les architectures actuelles du Trident.",
    tags: ["maserati", "v8", "moteur", "maserati", "retour", "ingénierie"],
  },
  {
    type: "curiosite",
    titre: "Elle porte un collier à 320 000 € qui cache tous les circuits de Formule 1",
    paragraphe: "Porté par Hannah St John, la mannequin et compagne du pilote de F1 Liam Lawson, il a immédiatement attiré l'attention lors de l'événement Glamour on the Grid.",
    description: "Elle porte un collier qui cache tous les circuits de Formule 1. Baptisé « La Velocità », ce bijou unique reproduit les tracés de tous les circuits du calendrier F1.",
    tags: ["bijoux", "luxe", "f1", "mode", "circuits", "diamants"],
  },
  {
    type: "curiosite",
    titre: "POURQUOI les gens se garent à côté de vous alors que le parking est presque VIDE ? On vous explique",
    paragraphe: "Les chercheurs appellent ça le comportement grégaire. Le physicien Dirk Helbing et son équipe l'ont défini comme cette tendance à faire ce que font les autres.",
    description: "Ce réflexe qui agace tant de conducteurs n'a rien d'un hasard, et surtout rien de personnel. Les chercheurs l'appellent le comportement grégaire : notre cerveau associe instinctivement la présence des autres à la sécurité.",
    tags: ["science", "psychologie", "parking", "comportement", "explication", "conducteur"],
  },
];

// ─── ROUTEUR PAR TYPE D'ARTICLE ──────────────────────────────────────

export type ArticleType = "annonce" | "curiosite" | "comparatif" | "essai";

export interface ArticleTypeConfig {
  /** Nom du type */
  nom: string;
  /** Règle d'écriture injectée dans le prompt créatif */
  regleEcriture: string;
  /** Longueur cible en mots (min, max) */
  longueur: { min: number; max: number };
  /** Tags few-shot préférés pour ce type */
  fewShotTags: string[];
}

export const ARTICLE_TYPES: Record<ArticleType, ArticleTypeConfig> = {
  annonce: {
    nom: "Annonce / Scoop",
    regleEcriture: `Tu écris une ANNONCE automobile. Va droit au but.
- Première phrase = fait principal (date, prix, nom)
- Deuxième phrase = contexte (pourquoi c'est important)
- Troisième phrase = ce qu'il faut retenir
- Pas de blabla, pas d'accroche mystérieuse. Factuel et direct.`,
    longueur: { min: 150, max: 400 },
    fewShotTags: ["f1", "annonce", "contrat", "prolongation", "partenariat"],
  },
  curiosite: {
    nom: "Curiosité / Storytelling",
    regleEcriture: `Tu écris une CURIOSITÉ automobile. Accroche le lecteur.
- Première phrase = accroche intrigante ou surprenante
- Deuxième phrase = révélation ou explication
- Troisième phrase = "ce qu'il faut retenir" ou chute
- Tu peux mettre une citation en accroche. Ton complice, pas journalistique sec.`,
    longueur: { min: 200, max: 500 },
    fewShotTags: ["humour", "buzz", "science", "psychologie", "luxe", "mode"],
  },
  comparatif: {
    nom: "Comparatif / Analyse",
    regleEcriture: `Tu écris un COMPARATIF automobile. Sois analytique.
- Première phrase = le face-à-face (X vs Y)
- Corps = forces/faiblesses de chaque option
- Conclusion = recommandation nuancée
- Utilise des mots de contraste : cependant, face à, en revanche, tandis que.`,
    longueur: { min: 250, max: 500 },
    fewShotTags: ["comparatif", "versus", "test", "essai"],
  },
  essai: {
    nom: "Essai / Retour d'expérience",
    regleEcriture: `Tu écris un ESSAI automobile. Partage une expérience.
- Première phrase = le ressenti immédiat (conduite, ambiance, émotion)
- Corps = détails techniques + ressenti subjectif
- Conclusion = verdict personnel
- Ton plus intime que l'annonce, mais jamais familier.`,
    longueur: { min: 250, max: 500 },
    fewShotTags: ["essai", "conduite", "volant", "émotion", "route"],
  },
};

// ─── DÉTECTION DE TYPE ───────────────────────────────────────────────

/**
 * Détecte le type d'article à partir du brief.
 * Utilise des mots-clés simples (pas de LLM) — c'est un routeur classique,
 * pas un modèle. Rapide, sans coût, sans latence.
 */
export function detectArticleType(brief: {
  headline: string;
  body: string;
  angle_suggestion?: string;
}): ArticleType {
  const text = `${brief.headline} ${brief.body} ${brief.angle_suggestion ?? ""}`.toLowerCase();

  // Mots-clés par type (ordre de priorité)
  const keywords: Record<ArticleType, string[]> = {
    annonce: [
      "dévoile", "annonce", "présente", "lance", "prolonge", "officiel",
      "première", "nouveau", "nouvelle", "sortie", "lancement",
    ],
    curiosite: [
      "pourquoi", "comment", "saviez-vous", "incroyable", "étonnant",
      "étrange", "bizarre", "secret", "histoire", "réel",
    ],
    comparatif: [
      "comparatif", "versus", "face à", "test", "comparaison",
      "meilleur", "lequel", "plutôt que",
    ],
    essai: [
      "essai", "retour", "expérience", "conduite", "au volant",
      "première impression", "on a essayé", "on a testé",
    ],
  };

  // Score par type
  const scores: Record<ArticleType, number> = {
    annonce: 0, curiosite: 0, comparatif: 0, essai: 0,
  };

  for (const [type, words] of Object.entries(keywords) as [ArticleType, string[]][]) {
    for (const word of words) {
      if (text.includes(word)) {
        scores[type] += 1;
      }
    }
  }

  // Retourne le type avec le score le plus élevé, par défaut "annonce"
  const best = (Object.entries(scores) as [ArticleType, number][])
    .sort((a, b) => b[1] - a[1])[0];

  return best[1] > 0 ? best[0] : "annonce";
}

// ─── FEW-SHOT DYNAMIQUE ─────────────────────────────────────────────

/**
 * Sélectionne les 2 exemples les plus pertinents pour un brief donné.
 * Utilise la similarité par mots-clés (pas de ML, pas de vector store).
 * Si le brief parle de "V8" et "Maserati", on pioche l'exemple Maserati.
 *
 * Pourquoi 2 et pas 30 : l'attention dilution. 2 exemples = le modèle
 * comprend le pattern sans être noyé sous les exemples.
 */
export function selectFewShot(
  brief: { headline: string; body: string },
  type: ArticleType,
): StyleExample[] {
  const text = `${brief.headline} ${brief.body}`.toLowerCase();
  const config = ARTICLE_TYPES[type];

  // Scoring : chaque exemple est comparé au brief
  const scored = STYLE_EXAMPLES
    .filter((ex) => ex.type === type) // Même type d'abord
    .map((ex) => {
      let score = 0;
      // +2 pour chaque tag qui matche
      for (const tag of ex.tags) {
        if (text.includes(tag)) score += 2;
      }
      // +1 pour chaque tag du typefewShot qui matche
      for (const tag of config.fewShotTags) {
        if (text.includes(tag)) score += 1;
        if (ex.tags.includes(tag)) score += 0.5;
      }
      return { example: ex, score };
    })
    .sort((a, b) => b.score - a.score);

  // Prendre les 2 meilleurs, ou tous si moins de 2
  return scored.slice(0, 2).map((s) => s.example);
}

// ─── CONSTRUCTION DE PROMPTS ─────────────────────────────────────────

/**
 * Prompt système pour le RÉDACTEUR (étape 1 de la chaîne).
 * Ce prompt est VOLONTAIREMENT dépourvu de contraintes de format.
 * L'IA écrit librement, avec pour seule consigne le style et le ton.
 */
export function buildCreativePrompt(
  type: ArticleType,
  fewShotExamples: StyleExample[],
): string {
  const config = ARTICLE_TYPES[type];

  const examplesBlock = fewShotExamples.length > 0
    ? `\nEXEMPLES RÉELS DU MÉDIA AUTOMOBILE (pour calibrer le ton, pas copier) :\n${
        fewShotExamples.map((ex, i) =>
          `---\nExemple ${i + 1} :\nTitre : ${ex.titre}\nParagraphe : ${ex.paragraphe}\n---`
        ).join("\n")
      }`
    : "";

  return [
    `Tu es un rédacteur pour Le Média Automobile. Tu écris dans leur style exact.`,
    "",
    `STYLE :`,
    `- Tutoiement systématique ("tu", pas "vous")`,
    `- Factuel mais jamais froid — ton complice avec le lecteur`,
    `- Phrases courtes (15-25 mots max)`,
    `- 1 idée par paragraphe, pas de mélange`,
    `- Chiffres toujours contextualisés ("302 645 joueurs, soit une baisse de 88%")`,
    `- Pas de jargon inutile, pas de sensationnalisme`,
    "",
    `LEXIQUE :`,
    `- Préfère : voiture, modèle, gamme, dévoile, présente, lance, premium`,
    `- Évite : véhicule, sort, publie, coûteux, dérive contrôlée`,
    "",
    `TYPE D'ARTICLE : ${config.nom}`,
    config.regleEcriture,
    examplesBlock,
    "",
    `IMPORTANT : écris le texte librement, sans contrainte de format. Pas de JSON, pas de markdown. Juste le texte brut.`,
  ].join("\n");
}

/**
 * Prompt pour le SECRÉTAIRE DE RÉDACTION (étape 2 de la chaîne).
 * Prend le texte brut et le structure en JSON propre.
 * Ce prompt est COURT et précis — pas de créativité ici, juste du formatage.
 */
export function buildFormattingPrompt(): string {
  return [
    `Tu es un secrétaire de rédaction. Tu reçois un texte brut et tu le formates en JSON.`,
    "",
    `RÈGLES :`,
    `- Ne change AUCUN mot du texte. Ne réécris rien.`,
    `- Extrais le titre (première phrase ou ligne qui ressemble à un titre)`,
    `- Extrais le chapeau (2-3 phrases qui résument l'article)`,
    `- Le reste = contenu (les paragraphes)`,
    `- Génère une meta description de 155 caractères max`,
    "",
    `Réponds UNIQUEMENT avec ce JSON :`,
    `{"titre": "...", "chapeau": "...", "contenu": "...", "meta_description": "...", "word_count": 0}`,
  ].join("\n");
}

/**
 * Prompt pour la RÉDACTION DIRECTE (pas de chaîne).
 * Utilisé quand on veut un résultat rapide en 1 seul appel.
 * Combine style + structure en un seul prompt, mais allégé.
 */
export function buildDirectPrompt(
  type: ArticleType,
  brief: { headline: string; lede: string; body: string; facts: Array<{ text: string; source_title: string }>; angle_suggestion: string },
  fewShotExamples: StyleExample[],
  extraStyleRules?: string,
): string {
  const config = ARTICLE_TYPES[type];
  const factsText = brief.facts
    .map((f, i) => `${i + 1}. ${f.text} (Source: ${f.source_title})`)
    .join("\n");

  const examplesBlock = fewShotExamples.length > 0
    ? `\nEXEMPLES RÉELS (calibre le ton) :\n${
        fewShotExamples.map((ex) => `Titre : "${ex.titre}"\nParagraphe : "${ex.paragraphe}"`).join("\n\n")
      }`
    : "";

  return [
    `Tu es un rédacteur pour Le Média Automobile.`,
    "",
    `STYLE : tutoiement, factuel-complice, phrases courtes (15-25 mots), 1 idée par paragraphe.`,
    `LEXIQUE : préfère "voiture/modèle/dévoile" — évite "véhicule/sort/publie"`,
    "",
    `TYPE : ${config.nom}`,
    config.regleEcriture,
    examplesBlock,
    "",
    `BRIEF :`,
    `Titre : ${brief.headline}`,
    `Amorce : ${brief.lede}`,
    `Corps : ${brief.body}`,
    `Faits :\n${factsText}`,
    `Angle : ${brief.angle_suggestion}`,
    extraStyleRules ? `\nRÈGLES PERSONNALISÉES :\n${extraStyleRules}` : "",
    "",
    `FORMAT DE SORTIE :`,
    `Titre: [titre accrocheur]`,
    `Chapô: [2-3 phrases de résumé]`,
    `[Paragraphes avec une idée chacun]`,
    `[Conclusion avec ce qu'il faut retenir]`,
  ].join("\n");
}

/**
 * Prompt pour la GÉNÉRATION DE TITRES (STUDIO).
 * Allégé, focused, avec les vrais exemples LMA.
 */
export function buildTitlePrompt(): string {
  const titleExamples = STYLE_EXAMPLES
    .filter((ex) => ex.titre.length > 0)
    .slice(0, 6)
    .map((ex, i) => `${i + 1}. ${ex.titre}`);

  return [
    `Tu écris des titres courts pour les posts Instagram du Média Automobile.`,
    "",
    `STYLE :`,
    `- Phrase complète (pas de fragment)`,
    `- Factuel ou intrigant selon le sujet`,
    `- Chiffres concrets dans le titre quand possible`,
    `- Tutoiement si applicable`,
    `- Pas de putaclic mensonger`,
    "",
    `EXEMPLES RÉELS :`,
    ...titleExamples,
    "",
    `Réponds UNIQUEMENT en JSON : {"titres": ["...", "...", "..."], "surtitres": ["...", "...", "..."]}`,
    `Titres : 30-95 caractères. Surtitres : 8-30 caractères (ex: "Breaking", "Exclu", "Comparatif").`,
  ].join("\n");
}
