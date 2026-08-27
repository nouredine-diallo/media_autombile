import { buildStyleRulesPrompt } from './style-rules';
import { chatComplete, CLAUDE_MODEL } from './llmProvider';
import {
  detectArticleType,
  selectFewShot,
  buildCreativePrompt,
  buildFormattingPrompt,
  buildDirectPrompt,
  buildTitlePrompt,
} from './content-engine';

/**
 * Registre de voix confirmé (ONBOARDING.md : "Tutoiement — confirmé par 8
 * vrais posts"). Source unique référencée par toute génération/traduction —
 * `lib/translate.ts` utilisait "Vouvoiement" avant ce correctif, un
 * désaccord silencieux avec cette règle qu'une constante partagée empêche
 * de reproduire.
 */
export const VOICE_REGISTER = 'Tutoiement systématique ("tu", pas "vous")';

export interface GenerationRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** "Prompt as Data" — règles dynamiques ajoutées par la rédaction en chef via /style-guide */
  extraStyleRules?: string;
}

export interface GenerationResponse {
  content: string;
  model: string;
  tokensUsed: number;
}

export async function generate(request: GenerationRequest): Promise<GenerationResponse> {
  const {
    prompt,
    maxTokens = 4096,
    temperature = 0.3,
    extraStyleRules,
  } = request;

  try {
    const result = await chatComplete({
      system: `Tu es un rédacteur pour Le Média Automobile. Tu écris dans leur style exact.

STYLE :
- ${VOICE_REGISTER}
- Factuel mais jamais froid — ton complice avec le lecteur
- Phrases courtes (15-25 mots max)
- 1 idée par paragraphe, pas de mélange
- Chiffres toujours contextualisés ("302 645 joueurs, soit une baisse de 88%")
- Pas de jargon inutile, pas de sensationnalisme

LEXIQUE :
- Préfère : voiture, modèle, gamme, dévoile, présente, lance, premium
- Évite : véhicule, sort, publie, coûteux, dérive contrôlée

RÈGLES STRICTES:
- Tu ne dois JAMAIS inventer de faits qui ne sont pas dans le brief
- Tu dois rester fidèle aux chiffres et sources du brief
- Chaque chiffre doit être vérifiable
- Cite les sources en fin de texte quand pertinent
- Termine toujours tes phrases et paragraphes
${buildStyleRulesPrompt()}`,
      user: prompt,
      model: 'openai/gpt-oss-120b',
      temperature,
      maxTokens,
    });

    return {
      content: result.content,
      model: result.provider === 'claude' ? CLAUDE_MODEL : 'openai/gpt-oss-120b',
      tokensUsed: result.tokensUsed,
    };
  } catch (error) {
    console.error('Error calling LLM API:', error);
    throw error;
  }
}

/**
 * @deprecated Utiliser buildDirectPrompt() ou generateArticleSmart() à la place.
 * Conservé pour rétrocompatibilité avec les anciens appelants.
 */
export function buildArticlePrompt(brief: {
  headline: string;
  lede: string;
  body: string;
  facts: Array<{ text: string; source_url: string | null; source_title: string }>;
  angle_suggestion: string;
}): string {
  const factsText = brief.facts
    .map((f, i) => `${i + 1}. ${f.text} (Source: ${f.source_title})`)
    .join('\n');

  return `BRIEF FACTUEL:
Titre: ${brief.headline}

Amorce:
${brief.lede}

Corps du brief:
${brief.body}

Faits vérifiables:
${factsText}

Angle suggéré: ${brief.angle_suggestion}

---

STYLE: tutoiement, factuel-complice, phrases courtes, 1 idée par paragraphe.
LEXIQUE : voiture/modèle/dévoile — évite véhicule/sort/publie.
FORMAT: Titre + Chapô + 3-4 paragraphes + Conclusion.`;
}

// ─── GÉNÉRATION CHAÎNÉE (2 passes) ──────────────────────────────────

/**
 * Génère un article en 2 passes :
 * 1. Le RÉDACTEUR écrit le texte librement (pas de contrainte de format)
 * 2. Le SECRÉTAIRE DE RÉDACTION formate en JSON propre
 *
 * Avantage : le texte est plus naturel car le LLM n'a pas à gérer
 * la syntaxe JSON en même temps que la créativité.
 */
export async function generateChained(
  brief: { headline: string; lede: string; body: string; facts: Array<{ text: string; source_title: string }>; angle_suggestion: string },
  extraStyleRules?: string,
): Promise<GenerationResponse> {
  const type = detectArticleType(brief);
  const fewShot = selectFewShot(brief, type);

  // Étape 1 : Le rédacteur écrit librement
  const creativePrompt = buildCreativePrompt(type, fewShot);
  const creativeSystem = creativePrompt + (extraStyleRules ? `\nRÈGLES PERSONNALISÉES :\n${extraStyleRules}` : "");

  const creativeRes = await chatComplete({
    system: creativeSystem,
    user: `Écris un article sur ce brief :\n\nTitre : ${brief.headline}\nAmorce : ${brief.lede}\nCorps : ${brief.body}\nAngle : ${brief.angle_suggestion}`,
    model: 'openai/gpt-oss-120b',
    temperature: 0.4,
    maxTokens: 2000,
  });

  const rawText = creativeRes.content;
  const creativeTokens = creativeRes.tokensUsed;
  const modelLabel = creativeRes.provider === 'claude' ? CLAUDE_MODEL : 'openai/gpt-oss-120b';

  if (!rawText || rawText.length < 50) {
    // Fallback : si le premier appel échoue, on fait un appel direct
    return generateArticleSmart(brief, extraStyleRules);
  }

  // Étape 2 : Le secrétaire formate en JSON
  const formatPrompt = buildFormattingPrompt();
  const formatRes = await chatComplete({
    system: formatPrompt,
    user: rawText,
    model: 'openai/gpt-oss-120b',
    temperature: 0.1,
    maxTokens: 2000,
  });

  const formatted = formatRes.content;
  const formatTokens = formatRes.tokensUsed;

  // Si le formatage réussit, on retourne le JSON
  // Sinon, on retourne le texte brut avec un wrapping basique
  try {
    JSON.parse(formatted);
    return {
      content: formatted,
      model: modelLabel,
      tokensUsed: creativeTokens + formatTokens,
    };
  } catch {
    // Le modèle n'a pas retourné du JSON valide — on wrap manuellement
    const titleMatch = rawText.match(/^(.+)$/m);
    const title = titleMatch?.[1]?.replace(/^[#*>\s]+/, '').trim() || brief.headline;
    const body = rawText.replace(titleMatch?.[0] ?? '', '').trim();
    const wrapped = JSON.stringify({
      titre: title,
      chapeau: body.substring(0, 200),
      contenu: body,
      meta_description: body.substring(0, 155),
      word_count: body.split(/\s+/).length,
    });
    return {
      content: wrapped,
      model: modelLabel,
      tokensUsed: creativeTokens + formatTokens,
    };
  }
}

// ─── GÉNÉRATION CARROUSEL (texte court, 1 passe) ────────────────────

/**
 * Génère le texte de développement d'un carrousel Instagram — pas un article
 * de site (il n'y en a pas, voir chantier écosystème 2026-08-27). Réutilise
 * la même détection de type + few-shot que `generateChained`/`generateArticleSmart`
 * (aucune nouvelle donnée de calibrage), mais avec un format de sortie
 * volontairement plus court : 1 à 3 paragraphes courts, pas de titre/chapô/
 * conclusion (le titre est déjà géré par le gabarit 1A/1C, la conclusion par
 * le gabarit CTA fixe). Décision 2026-08-27 : le brief lui-même (`brief.body`)
 * n'est pas généré par un LLM (concaténation déterministe de faits/résumés,
 * voir `generateBody()`) — il reste inchangé. C'est ce texte-ci, réellement
 * généré par un LLM, qui doit être court, pas une étape de réécriture
 * supplémentaire par-dessus un article long : un seul appel, pas deux.
 */
export async function generateCarouselParagraphs(
  brief: { headline: string; lede: string; body: string; facts: Array<{ text: string; source_title: string }>; angle_suggestion: string },
): Promise<string[]> {
  const type = detectArticleType(brief);
  const fewShot = selectFewShot(brief, type);

  const examplesBlock = fewShot.length > 0
    ? `\nEXEMPLES RÉELS DU MÉDIA AUTOMOBILE (pour calibrer le ton, pas copier) :\n${
        fewShot.map((ex, i) => `---\nExemple ${i + 1} :\n${ex.paragraphe}\n---`).join("\n")
      }`
    : "";

  const factsText = brief.facts
    .map((f, i) => `${i + 1}. ${f.text} (Source: ${f.source_title})`)
    .join('\n');

  const result = await chatComplete({
    system: `Tu es un rédacteur pour Le Média Automobile. Tu écris le développement d'un carrousel Instagram, pas un article de site web — il n'y a pas de site.

STYLE :
- ${VOICE_REGISTER}
- Factuel mais complice, phrases courtes (15-25 mots max)
- 1 fait marquant par paragraphe

LEXIQUE :
- Préfère : voiture, modèle, gamme, dévoile, présente, lance, premium
- Évite : véhicule, sort, publie, coûteux, dérive contrôlée
${examplesBlock}

RÈGLES STRICTES :
- Tu ne dois JAMAIS inventer de faits qui ne sont pas dans le brief
- Chaque chiffre doit être vérifiable dans le brief fourni
${buildStyleRulesPrompt()}

FORMAT DE SORTIE :
- 1 à 3 paragraphes courts (1 à 2 phrases chacun), un paragraphe = une slide
- N'invente JAMAIS un paragraphe supplémentaire pour remplir : si un seul fait mérite d'être développé, un seul paragraphe suffit
- Pas de titre, pas de chapô, pas de conclusion, pas de markdown, pas de JSON, pas d'émoji
- N'appelle jamais à commenter/s'abonner : la dernière slide du carrousel (gabarit fixe) s'en charge déjà
- Sépare chaque paragraphe par une ligne vide`,
    user: `Développe ce brief pour un carrousel :\n\nTitre : ${brief.headline}\nAmorce : ${brief.lede}\nCorps : ${brief.body}\nFaits :\n${factsText}\nAngle : ${brief.angle_suggestion}`,
    model: 'openai/gpt-oss-120b',
    temperature: 0.4,
    // Modèle "raisonneur" Groq (openai/gpt-oss-120b) : consomme des tokens de
    // raisonnement invisibles avant la réponse visible (~250-300 mesurés ici),
    // indépendamment de la brièveté demandée en sortie — voir studio/CLAUDE.md
    // §1.1, même modèle, même défaut déjà documenté. Un budget trop serré
    // (400 testé) épuise tout sur le raisonnement et renvoie une chaîne vide.
    // Budget conservé identique côté Claude par simplicité, sans le même besoin.
    maxTokens: 1200,
  });

  const text = result.content;
  return text
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .slice(0, 3);
}

// ─── GÉNÉRATION INTELLIGENTE (1 passe, routing) ─────────────────────

/**
 * Génère un article en 1 seul appel LLM, mais avec :
 * - Détection automatique du type (annonce/curiosité/comparatif/essai)
 * - Few-shot dynamique (2 exemples pertinents)
 * - Prompt calibré sur le vrai style LMA
 *
 * Plus rapide que generateChained() (1 appel au lieu de 2).
 * Utiliser quand la vitesse est prioritaire sur la qualité maximale.
 */
export async function generateArticleSmart(
  brief: { headline: string; lede: string; body: string; facts: Array<{ text: string; source_title: string }>; angle_suggestion: string },
  extraStyleRules?: string,
): Promise<GenerationResponse> {
  const type = detectArticleType(brief);
  const fewShot = selectFewShot(brief, type);
  const prompt = buildDirectPrompt(type, brief, fewShot, extraStyleRules);

  try {
    const result = await chatComplete({
      system: prompt,
      user: `Écris l'article.`,
      model: 'openai/gpt-oss-120b',
      temperature: 0.3,
      maxTokens: 2000,
    });

    return {
      content: result.content,
      model: result.provider === 'claude' ? CLAUDE_MODEL : 'openai/gpt-oss-120b',
      tokensUsed: result.tokensUsed,
    };
  } catch (error) {
    console.error('Error calling LLM API:', error);
    throw error;
  }
}

// ─── GÉNÉRATION DE TITRES INTELLIGENTE ──────────────────────────────

/**
 * Génère des titres en utilisant l'ADN style du Média Automobile.
 * Remplace le prompt générique du routeur STUDIO par un prompt calibré
 * sur les vrais exemples LMA.
 */
export async function generateTitlesSmart(theme: string): Promise<{ titles: string[]; surtitres: string[] }> {
  const systemPrompt = buildTitlePrompt();

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Thème : ${theme}` },
      ],
      temperature: 0.8,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Groq a répondu ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Réponse vide");

  const parsed = JSON.parse(content);
  return {
    titles: Array.isArray(parsed.titres) ? parsed.titres : [],
    surtitres: Array.isArray(parsed.surtitres) ? parsed.surtitres : [],
  };
}
