import Groq from 'groq-sdk';
import { buildStyleRulesPrompt } from './style-rules';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';

const groq = new Groq({ apiKey: GROQ_API_KEY });

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
    maxTokens = 2048,
    temperature = 0.3,
    extraStyleRules,
  } = request;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Tu es un rédacteur automobile expert pour Le Média Automobile. Tu écris dans le style professionnel et précis du magazine.

STYLE ET TON (Guide v2):
- Vouvoiement systématique
- Ton journalistique professionnel, jamais sensationnaliste
- Enthousiasme modéré, factuel
- Vocabulaire automobile précis (termes techniques acceptés : facelift, restylage, drift, restomod)

LEXIQUE PRÉFÉRÉ:
- "voiture", "modèle", "gamme", "configuration" (pas "véhicule")
- "dévoile", "présente", "lance", "introduit" (pas "sort", "publie")
- "à partir de", "tarif de" (pas "coût de")
- "bloc", "transmission", "architecture"
- "drift", "glisse", "dérive" (pas "dérive contrôlée")
- "restomod", "restauration moderne" (pas "rétrofit")
- "premium", "haut de gamme", "luxe" (pas "cher", "coûteux")

STRUCTURE EN 3 PARAGRAPHES (calibrée):
1. Paragraphe 1: Fait principal + chiffres clés
2. Paragraphe 2: Détails techniques + caractéristiques
3. Paragraphe 3: Contexte + marketing + histoire
4. Conclusion: Question ouverte au lecteur

RÈGLES STRICTES:
- Tu ne dois JAMAIS inventer de faits qui ne sont pas dans le brief
- Tu dois rester fidèle aux chiffres et sources du brief
- Chaque chiffre doit être vérifiable
- Cite les sources en fin de texte quand pertinent
- Références historiques encouragées (liens avec l'histoire de la marque)
- Ne dépasse pas 500 mots
${buildStyleRulesPrompt()}`
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'openai/gpt-oss-120b',
      temperature,
      max_tokens: maxTokens,
      top_p: 0.9,
      stream: false,
    });

    const content = completion.choices[0]?.message?.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    return {
      content,
      model: 'openai/gpt-oss-120b',
      tokensUsed,
    };
  } catch (error) {
    console.error('Error calling Groq API:', error);
    throw error;
  }
}

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

INSTRUCTIONS D'ÉCRITURE (Guide v2):

STYLE:
- Vouvoiement
- Ton journalistique professionnel
- Enthousiasme modéré
- Vocabulaire automobile précis

STRUCTURE EN 3 PARAGRAPHES (calibrée):
1. Paragraphe 1: Fait principal + chiffres clés
2. Paragraphe 2: Détails techniques + caractéristiques
3. Paragraphe 3: Contexte + marketing + histoire
4. Conclusion: Question ouverte au lecteur

RÈGLES:
- Attaque factuelle : le fait principal en premier
- Max 4 phrases par paragraphe
- Max 25 mots par phrase
- Cite les sources en fin de texte quand pertinent
- Références historiques encouragées
- Chaque chiffre doit être vérifiable
- Ne JAMAIS inventer de faits

FORMAT DE SORTIE:
Titre: [titre]
Chapô: [chapô]
[Paragraphe 1: fait principal + chiffres]
[Paragraphe 2: détails techniques]
[Paragraphe 3: contexte + histoire]
[Conclusion avec question ouverte]`;
}
