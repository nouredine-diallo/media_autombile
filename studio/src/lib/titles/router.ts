import "server-only";

export interface TitleGenerationResult {
  titles: string[];
  surtitres: string[];
  provider: string;
}

export interface TitleProvider {
  name: string;
  generate(theme: string): Promise<{ titles: string[]; surtitres: string[] }>;
}

export const MIN_LEN = 30;
export const MAX_LEN = 95;

export class TitleGenerationError extends Error {}

/**
 * Exemples réels de titres Le Média Automobile (extraits des captures de
 * inspi/, pas inventés) utilisés pour calibrer le ton du modèle — voir
 * CLAUDE.md §4.3 : ne jamais inventer de carnet de style. Ce ne sont que 5
 * exemples ; le cahier des charges (§6.5) recommande 20-30 exemples fournis
 * par le rédacteur en chef pour une calibration fiable. Cette liste est un
 * point de départ honnête en attendant ces exemples, pas un substitut.
 */
const STYLE_EXAMPLES = [
  "Essayez de trouver un plus gros flex des années 90 qu'un écran de télé dans une Mercedes AMG",
  "En France, les marques automobiles n'ont pas le droit de montrer une voiture en pleine nature dans leurs publicités, réseaux sociaux compris, sous peine de 7 500 € d'amende",
  "Hiroshi Okuda, l'ancien président de Toyota et pionnier de la Prius, est décédé à l'âge de 93 ans",
  "Au cœur de l'incroyable collection de voitures de la star de Spider-Man",
  "Disney+ devient la plateforme mondiale pour la diffusion de la Formula E dès fin 2026",
];

function buildSystemPrompt(): string {
  return [
    "Tu écris des titres courts pour les posts Instagram du média Le Média Automobile.",
    "Voici 5 exemples réels déjà publiés, pour calibrer le ton (direct, factuel ou léger selon le sujet, jamais putaclic mensonger) :",
    ...STYLE_EXAMPLES.map((t, i) => `${i + 1}. ${t}`),
    `Réponds UNIQUEMENT en JSON valide : {"titres": ["titre1", "titre2", "titre3"], "surtitres": ["surtitre1", "surtitre2", "surtitre3"]} — exactement 3 titres (30–${MAX_LEN} caractères) et 3 surtitres (8–30 caractères, courts et percutants comme "Breaking", "Exclu", "Essai", "Comparatif", "Rétro", "Concept", "Prix", "Alerte").`,
  ].join("\n");
}

/**
 * Fournisseur Groq — modèle et paramètres vérifiés en conditions réelles le
 * 2026-08-18 (clé de développement fournie par l'utilisateur) :
 * openai/gpt-oss-120b est un modèle "raisonneur" (chain-of-thought avant la
 * réponse) qui, sans contrainte, produit plusieurs secondes de raisonnement
 * avant un JSON valide (voire dépasse la limite de tokens sans jamais
 * répondre). `reasoning_effort: "low"` + `response_format: json_object`
 * ramène ça à ~0.2-0.4s avec un JSON propre — configuration retenue après
 * test comparatif avec qwen/qwen3.6-27b (même problème de raisonnement, pire :
 * a dépassé la limite de tokens sans jamais produire le JSON final lors du test).
 */
const groqProvider: TitleProvider = {
  name: "groq",
  async generate(theme: string): Promise<{ titles: string[]; surtitres: string[] }> {
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
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: `Thème : ${theme}` },
        ],
        temperature: 0.8,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
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

    const titles = (parsed as { titres?: unknown }).titres;
    if (!Array.isArray(titles) || titles.some((t) => typeof t !== "string")) {
      throw new TitleGenerationError(
        "Format de réponse Groq inattendu (champ 'titres' manquant ou invalide)",
      );
    }

    const surtitres = (parsed as { surtitres?: unknown }).surtitres;
    const surtitreList = Array.isArray(surtitres)
      ? surtitres.filter((s): s is string => typeof s === "string" && s.length >= 4 && s.length <= 30)
      : [];

    // Compléter les surtitres manquants avec des placeholders vides
    while (surtitreList.length < titles.length) {
      surtitreList.push("");
    }

    return { titles: titles as string[], surtitres: surtitreList.slice(0, titles.length) };
  },
};

/**
 * Routeur LLM — un seul fournisseur pour l'instant (Groq, demandé
 * explicitement le 2026-08-18 pour la phase de développement, clé gratuite
 * sans carte bancaire — voir CLAUDE.md §3.1). Interface conçue pour ajouter
 * Claude/OpenAI/autres en repli sans changer les appelants, quand l'outil
 * sortira de la phase de développement.
 */
const PROVIDERS: TitleProvider[] = [groqProvider];

export async function generateTitles(theme: string): Promise<TitleGenerationResult> {
  const trimmed = theme.trim();
  if (trimmed.length === 0) {
    throw new TitleGenerationError("Thème vide");
  }

  const errors: string[] = [];
  for (const provider of PROVIDERS) {
    try {
      const result = await provider.generate(trimmed);
      return { titles: result.titles, surtitres: result.surtitres, provider: provider.name };
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new TitleGenerationError(
    `Aucun fournisseur de génération de titre disponible. ${errors.join(" | ")}`,
  );
}
