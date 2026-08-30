import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { Agent } from 'undici';

/**
 * Dispatcher undici dédié à Ollama, avec headers/body timeout élargis —
 * trouvé en test réel (2026-08-28) que le streaming seul ne suffit pas :
 * undici a deux timeouts distincts à 5 min par défaut (headersTimeout ET
 * bodyTimeout, ce dernier se déclenchant si le silence entre deux chunks
 * dépasse le délai, pas seulement à la première réponse). Sur cette
 * machine sans GPU, le temps de traitement du prompt seul (avant le
 * premier token) peut dépasser 5 min pour un prompt volumineux — d'où
 * l'échec identique malgré le passage en streaming. `undici` ajoutée en
 * dépendance directe (MIT) pour ce seul besoin de configuration.
 */
const ollamaDispatcher = new Agent({ headersTimeout: 20 * 60 * 1000, bodyTimeout: 20 * 60 * 1000 });

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
export type LLMProvider = 'groq' | 'claude' | 'ollama';

export function getLLMProvider(): LLMProvider {
  const value = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  if (value === 'claude') return 'claude';
  if (value === 'ollama') return 'ollama';
  return 'groq';
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
 * Ollama local (2026-08-28) — ajouté uniquement pour débloquer le test du
 * parcours utilisateur complet : le quota Groq (200k tokens/jour, partagé
 * entre local/prod/STUDIO) était systématiquement insuffisant après les
 * tests répétés de cette session, et OpenRouter gratuit s'est révélé
 * soumis au même problème structurel (pool de fournisseurs partagé,
 * lui-même saturé — 429 upstream sur 2 modèles testés sur 3). Ollama tourne
 * entièrement sur cette machine : aucun appel réseau externe, donc aucun
 * quota/429 possible — seule contrainte, la vitesse (CPU pur, pas de GPU
 * sur cette machine, ~13 tokens/s mesurés en réel avec `gemma4:e2b-it-qat`,
 * déjà installé). Pas destiné à la prod (RADAR/CLAUDE.md §3.1 : la prod
 * cible un fournisseur cloud gratuit avec confidentialité vérifiée, jamais
 * un modèle local en fournisseur principal) — usage explicitement temporaire
 * et local, sur demande de l'utilisateur.
 */
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e2b-it-qat';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * Streaming obligatoire (pas juste une préférence) : trouvé en test réel
 * le 2026-08-28 — en `stream: false`, Ollama ne renvoie RIEN (pas même les
 * en-têtes HTTP) tant que la génération complète n'est pas terminée. Sur
 * cette machine sans GPU, une génération de plusieurs minutes dépasse le
 * `headersTimeout` par défaut d'undici (5 min, contrôlé séparément de
 * `AbortSignal` — un `signal` plus généreux n'y change rien, confirmé par
 * un échec identique après avoir ajouté `AbortSignal.timeout(20min)`).
 * En streaming, les en-têtes arrivent dès le premier token — le timeout ne
 * se déclenche jamais, peu importe la durée totale de génération.
 */
async function callOllama(params: ChatCompleteParams): Promise<ChatCompleteResult> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      options: { temperature: params.temperature, num_predict: params.maxTokens },
      stream: true,
    }),
    // @ts-expect-error -- `dispatcher` est une extension undici de fetch,
    // absente des types DOM standards mais bien supportée au runtime Node.
    dispatcher: ollamaDispatcher,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama a répondu ${res.status} — le service tourne-t-il bien sur ${OLLAMA_URL} ?`);
  }

  let content = '';
  let promptEvalCount = 0;
  let evalCount = 0;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      content += chunk.message?.content ?? '';
      if (chunk.done) {
        promptEvalCount = chunk.prompt_eval_count ?? 0;
        evalCount = chunk.eval_count ?? 0;
      }
    }
  }

  return {
    content,
    tokensUsed: promptEvalCount + evalCount,
    provider: 'ollama',
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
  const provider = getLLMProvider();
  if (provider === 'claude') {
    return callClaude(params);
  }
  if (provider === 'ollama') {
    return callOllama(params);
  }

  const completion = await getGroqClient().chat.completions.create(
    {
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: 0.9,
      stream: false,
      /**
       * Bug trouvé le 2026-08-27 en creusant pourquoi 100% des titres restent
       * en anglais (local ET prod) : `openai/gpt-oss-120b` est un modèle
       * "raisonneur" — sans ce réglage, il peut consommer tout son budget de
       * tokens de sortie en réflexion interne et ne jamais produire de texte
       * de réponse (reproduit par un appel réel : 20/20 tokens de "reasoning",
       * 0 caractère de contenu). Déjà documenté et corrigé côté STUDIO
       * (`titles/router.ts`, studio/CLAUDE.md §1.1) mais jamais appliqué ici —
       * cause racine de translateToFrench qui retombe sur l'anglais à chaque
       * appel, pas un problème de quota comme supposé initialement.
       */
      reasoning_effort: 'low',
    },
    /**
     * Trouvé le 2026-08-30 : cet appel n'avait aucun timeout explicite. Le
     * SDK Groq a un timeout par défaut d'1 min, mais retente automatiquement
     * dessus (documenté dans son propre .d.ts : "you may wait much longer
     * than this timeout before the promise succeeds or fails") — pas une
     * garantie dure. Un run de pipeline (`cron.ts`, run_type='full') est
     * resté bloqué à `status='running'` pendant plus de 2h, `isRunning`
     * jamais libéré, "Lancer" silencieusement sans effet (juste
     * "Pipeline already running, skipping"). `signal` coupe la connexion
     * plutôt que de compter sur les retries internes — même pattern que
     * `AbortSignal.timeout()` déjà utilisé ailleurs (llm.ts, cron.ts).
     */
    { signal: AbortSignal.timeout(30_000) },
  );

  return {
    content: completion.choices[0]?.message?.content || '',
    tokensUsed: completion.usage?.total_tokens || 0,
    provider: 'groq',
  };
}
