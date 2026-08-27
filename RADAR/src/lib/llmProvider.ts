import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';

/**
 * Terrain préparé pour la bascule Claude (2026-08-27) — pas encore active.
 * Décision utilisateur : les deux apps (RADAR + STUDIO) doivent finir sur
 * Claude, mais aucune clé Anthropic n'est disponible pour l'instant — Groq
 * doit continuer à fonctionner sans interruption pendant ce temps.
 *
 * `LLM_PROVIDER` bascule tout : absent ou 'groq' (défaut) = comportement
 * actuel inchangé. 'claude' n'active ce chemin que si `ANTHROPIC_API_KEY`
 * est aussi présente — sinon erreur explicite au premier appel, jamais une
 * dégradation silencieuse vers un autre fournisseur (RADAR/CLAUDE.md §6).
 *
 * Conforme à RADAR/CLAUDE.md §3.1 : "routeur LLM multi-fournisseur", déjà
 * prescrit dans le cahier des charges, pas une nouvelle idée d'architecture.
 */
export type LLMProvider = 'groq' | 'claude';

export function getLLMProvider(): LLMProvider {
  const value = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  return value === 'claude' ? 'claude' : 'groq';
}

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLM_PROVIDER=claude mais ANTHROPIC_API_KEY est absente — configure la clé dans .env.local avant de basculer, ou repasse LLM_PROVIDER=groq.",
    );
  }
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

/**
 * Aucune valeur de repli codée en dur — trouvé par la revue de sécurité du
 * 2026-08-27 : la première version de ce fichier avait recopié une clé Groq
 * en dur (déjà committée dans `llm.ts` avant cette session, signalée sans
 * être corrigée) au lieu de l'éliminer. Corrigé ici en exigeant la variable
 * d'environnement, avec une erreur explicite si elle manque — jamais un
 * secret réel dans le code source (RADAR/CLAUDE.md §6, "aucune dégradation
 * silencieuse").
 *
 * Client instancié paresseusement (pas au chargement du module) : trouvé le
 * 2026-08-27 en déployant en prod — `next build` évalue ce module pour
 * collecter les données de page même sans jamais appeler `chatComplete()`,
 * et l'environnement de build (avant que `start-radar.sh` charge `.env`) n'a
 * pas `GROQ_API_KEY`. Un throw ici cassait le build alors que la clé est
 * bien présente à l'exécution. Même pattern que `getAnthropicClient()`.
 */
let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (groqClient) return groqClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY manquante — requise pour lib/llmProvider.ts');
  }
  groqClient = new Groq({ apiKey });
  return groqClient;
}

export interface ChatCompleteParams {
  system: string;
  user: string;
  /** Nom du modèle Groq — ignoré côté Claude (mappé sur un modèle Claude fixe ci-dessous). */
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatCompleteResult {
  content: string;
  tokensUsed: number;
  provider: LLMProvider;
}

/**
 * TODO: modèle Claude provisoire (RADAR/CLAUDE.md §4.3 — jamais un choix
 * définitif sans données réelles) — à valider une fois une vraie clé
 * disponible et un vrai test comparatif possible, comme ça a été fait pour
 * le choix du modèle Groq actuel (`openai/gpt-oss-120b`, §1.1 studio/CLAUDE.md).
 */
export const CLAUDE_MODEL = 'claude-sonnet-5';

/**
 * Non testé faute de clé (2026-08-27) — implémenté contre la documentation
 * officielle de l'API Messages, pas deviné, mais "vérifié par lecture de la
 * doc" reste différent de "vérifié par appel réel" (protocole anti-
 * hallucination RADAR/CLAUDE.md §4.1). À confirmer par un appel réel dès
 * qu'une clé est disponible, avant de considérer ce chemin fiable.
 */
async function callClaude(params: ChatCompleteParams): Promise<ChatCompleteResult> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
  });

  const content = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    content,
    tokensUsed: (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
    provider: 'claude',
  };
}

/**
 * Point d'entrée unique pour tout appel de complétion de chat, quel que soit
 * le fournisseur actif. Le chemin Groq ci-dessous est un copier strict du
 * code qui tournait déjà avant cette bascule (même messages, mêmes
 * paramètres, même parsing) — comportement inchangé tant que
 * `LLM_PROVIDER` reste sur 'groq' (le défaut).
 */
export async function chatComplete(params: ChatCompleteParams): Promise<ChatCompleteResult> {
  if (getLLMProvider() === 'claude') {
    return callClaude(params);
  }

  const completion = await getGroqClient().chat.completions.create({
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
    model: params.model,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    top_p: 0.9,
    stream: false,
  });

  return {
    content: completion.choices[0]?.message?.content || '',
    tokensUsed: completion.usage?.total_tokens || 0,
    provider: 'groq',
  };
}
