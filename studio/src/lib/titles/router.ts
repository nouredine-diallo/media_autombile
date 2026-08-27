import "server-only";

export interface TitleGenerationResult {
  titles: string[];
  surtitres: string[];
  paragraphs: string[];
  provider: string;
}

export const MIN_LEN = 30;
export const MAX_LEN = 95;

export class TitleGenerationError extends Error {}

/**
 * Exemples réels de titres Le Média Automobile — extraits de TEXTPOST.txt
 * (8 posts réels du compte @lemediaautomobile). Pas inventés.
 */
const STYLE_EXAMPLES = [
  "Forza Horizon 6 perd déjà une grande partie de ses joueurs, seulement trois mois après sa sortie",
  "Pendant six mois, cette famille a fraudé les péages avec une technique étonnamment simple",
  "La Formule 1 prolonge son partenariat avec Disney autour de l'univers Cars",
  "Max Verstappen prolonge avec Red Bull jusqu'en 2030",
  "Dans cette publicité, ces parents offrent une voiture à celle qui acceptera de sortir avec leur fils",
  "Le V8 pourrait faire son retour chez Maserati, à peine trois ans après l'annonce de sa disparition",
  "Elle porte un collier à 320 000 € qui cache tous les circuits de Formule 1",
  "POURQUOI les gens se garent à côté de vous alors que le parking est presque VIDE ? On vous explique",
];

/**
 * Exemples réels de paragraphes LMA — extraits de TEXTPOST.txt.
 * Style : 1 idée par slide, phrases courtes (15-25 mots), tutoiement,
 * mots-clés en gras (**texte**), 25-60 mots par paragraphe.
 */
const PARAGRAPH_EXAMPLES = [
  "Le jeu a cumulé **302 645 joueurs simultanés** à son pic de lancé, mais ce chiffre est tombé à seulement 37 000 en trois mois. Le studio Playground Games affirme travailler sur des correctifs pour stabiliser la base.",
  "Pendant six mois, cette famille a **fraudé les péages** avec une technique d'une simplicité déconcertante. Leur méthode ne nécessitait aucun équipement spécialisé, juste une **plaque d'immatriculation modifiée**. Les péages concernés estiment le préjudice à **3 000 €**.",
  "La Formule 1 prolonge son partenariat avec Disney autour de l'univers **Cars**. Cette collaboration, lancée en 2025, vise à **toucher un public plus jeune** et à renforcer l'image de la discipline auprès des familles.",
  "Le V8 pourrait faire son retour chez Maserati, à peine **trois ans après** l'annonce de sa disparition. La marque italienne aurait réévalué sa stratégie face à la **demande persistante** de ses clientèles américaine et moyen-orientale.",
  "Elle porte un collier à **320 000 €** qui cache tous les circuits de Formule 1. Ce bijou unique, créé par une maison de joaillerie britannique, contient une **miniature gravée au laser** de chaque piste du championnat mondial.",
  "Votre voiture garée devient un **repère visuel** pour les voleurs. Deux voitures groupées sont **plus visibles** qu'une seule isolée, mais les parkings souterrains restent les zones les plus à risque selon les assurances.",
];

/**
 * Prompt unifié — un seul appel LLM produit titres + surtitres + paragraphes.
 * Économise ~50% de tokens par rapport aux 2 appels séparés.
 */
function buildUnifiedPrompt(): string {
  return [
    "Tu écris du contenu pour les posts Instagram du Média Automobile.",
    "Tu dois produire DES TITRES, DES SURTITRES et DES PARAGRAPHES — tout dans un seul JSON.",
    "",
    "STYLE DES TITRES :",
    "- Phrase complète (pas de fragment), factuel ou intrigant",
    "- Chiffres concrets quand possible, tutoiement, pas de putaclic mensonger",
    "EXEMPLES DE TITRES :",
    ...STYLE_EXAMPLES.map((t, i) => `${i + 1}. ${t}`),
    "",
    "STYLE DES PARAGRAPHES :",
    "- 25 à 60 mots, 1 idée par paragraphe, phrases courtes (15-25 mots)",
    "- Tutoiement, mettre en gras les mots-clés avec **gras**",
    "- Factuel mais complice, jamais froid, chiffres concrets",
    "EXEMPLES DE PARAGRAPHES :",
    ...PARAGRAPH_EXAMPLES.map((p, i) => `${i + 1}. ${p}`),
    "",
    `Réponds UNIQUEMENT en JSON valide :`,
    `{`,
    `  "titres": ["titre1", "titre2", "titre3"],`,
    `  "surtitres": ["surtitre1", "surtitre2", "surtitre3"],`,
    `  "paragraphes": ["paragraphe1", "paragraphe2", "paragraphe3"]`,
    `}`,
    "",
    `Règles :`,
    `- 3 titres (30–${MAX_LEN} caractères)`,
    `- 3 surtitres (8–30 caractères, courts : "Breaking", "Exclu", "Essai", "Comparatif")`,
    `- 3 paragraphes (25–60 mots chacun, **gras** sur les mots-clés)`,
  ].join("\n");
}

/**
 * Parse robuste : cherche la clé en FR puis EN, puis dans les objets imbriqués.
 */
function nestedFind(obj: Record<string, unknown>, key: string): unknown {
  if (obj[key] !== undefined) return obj[key];
  for (const v of Object.values(obj)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const sub = v as Record<string, unknown>;
      if (sub[key] !== undefined) return sub[key];
    }
  }
  return undefined;
}

/**
 * Routeur LLM — l'interface des appelants ne change jamais : ils appellent
 * `generateTitles(theme)` et le routeur dispatche vers le fournisseur actif.
 *
 * Fournisseur sélectionné par `LLM_PROVIDER` (défaut `groq` quand absent).
 * Groq reste le fournisseur de dev (clé gratuite sans carte bancaire,
 * CLAUDE.md §3.1) ; Claude est prévu pour la prod, sans clé à ce jour —
 * le point de branchement est documenté dans le `switch` ci-dessous.
 */
export async function generateTitles(theme: string): Promise<TitleGenerationResult> {
  const trimmed = theme.trim();
  if (trimmed.length === 0) {
    throw new TitleGenerationError("Thème vide");
  }

  switch (fournisseurActif()) {
    case "groq":
      return generateAvecGroq(trimmed);
    // ── Point de branchement Claude (prod uniquement) ──
    // `LLM_PROVIDER=claude` activerait ici generateAvecClaude(trimmed).
    // Elle exigera une clé (ANTHROPIC_API_KEY) posée côté serveur et pourra
    // réutiliser `buildUnifiedPrompt()` et `nestedFind()` à l'identique —
    // seul le transport change. Non implémenté tant qu'aucune clé n'existe
    // pour le tester (pas d'appel réel sans moyen de vérification).
    default:
      throw new TitleGenerationError(
        `Fournisseur LLM inconnu : "${fournisseurActif()}" (valeurs possibles : groq)`,
      );
  }
}

/** Fournisseur actif, snaké en minuscules. Défaut `groq` — ne jamais casser
 * le flux de dev existant si la variable n'est pas posée. */
function fournisseurActif(): string {
  const brut = process.env.LLM_PROVIDER ?? "groq";
  return brut.trim().toLowerCase();
}

/**
 * Générateur Groq seul — le comportement de production actuel, isolé pour
 * qu'un second fournisseur puisse s'ajouter sans toucher aux appelants.
 */
async function generateAvecGroq(theme: string): Promise<TitleGenerationResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new TitleGenerationError("GROQ_API_KEY manquant côté serveur");
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: buildUnifiedPrompt() },
        { role: "user", content: `Thème : ${theme}` },
      ],
      temperature: 0.8,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new TitleGenerationError("Limite de tokens Groq atteinte. Réessaie dans 2 minutes.");
    }
    throw new TitleGenerationError(`Groq a répondu ${res.status} : ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new TitleGenerationError("Réponse Groq sans contenu");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TitleGenerationError("Réponse Groq n'est pas un JSON valide");
  }

  const obj = (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
    ? parsed as Record<string, unknown>
    : {};

  // Titres
  const titles = nestedFind(obj, "titres") ?? nestedFind(obj, "titles");
  if (!Array.isArray(titles) || titles.some((t) => typeof t !== "string")) {
    throw new TitleGenerationError(
      "Format de réponse inattendu (champ 'titres' manquant ou invalide)",
    );
  }

  // Surtitres
  const surtitres = nestedFind(obj, "surtitres");
  const surtitreList = Array.isArray(surtitres)
    ? surtitres.filter((s): s is string => typeof s === "string" && s.length >= 4 && s.length <= 30)
    : [];
  while (surtitreList.length < titles.length) {
    surtitreList.push("");
  }

  // Paragraphes
  const paragraphs = nestedFind(obj, "paragraphes") ?? nestedFind(obj, "paragraphs");
  const paragraphList = Array.isArray(paragraphs)
    ? (paragraphs as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 10)
    : [];

  return {
    titles: titles as string[],
    surtitres: surtitreList.slice(0, titles.length),
    paragraphs: paragraphList.slice(0, 3),
    provider: "groq",
  };
}
