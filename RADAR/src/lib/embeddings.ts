let transformers: any = null;
let extractor: any = null;
let lastFailure: { at: number; message: string } | null = null;

/**
 * Audit du 2026-09-07 (finding D1, critique) : `modelFailed` était un flag
 * booléen posé à `true` pour toujours dès le premier échec (ex. timeout du
 * téléchargement de ~500 Mo au tout premier boot) — plus aucun embedding
 * n'était jamais recalculé jusqu'au redémarrage du process, et
 * `embedUnprocessedItems()` avalait le `null` résultant avec un simple
 * `continue` (scoring.ts), donc `cron.ts` ne le voyait jamais dans
 * `pipeline_runs.error`. Les items concernés ne devenaient jamais un
 * `event` — invisibles dans la veille, sans aucun signal.
 *
 * Corrigé en deux temps : (1) un échec n'est plus permanent — nouvelle
 * tentative de chargement autorisée après un délai de repli, pas de boucle
 * de re-tentative immédiate qui martèlerait un modèle réellement absent ;
 * (2) l'état est exposé via `getEmbeddingModelStatus()`, lu par
 * `embedUnprocessedItems()` (scoring.ts) pour remonter une vraie erreur
 * dans `pipeline_runs.error` au lieu d'un `continue` silencieux.
 */
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;

async function getExtractor(): Promise<any> {
  if (extractor) return extractor;
  if (lastFailure && Date.now() - lastFailure.at < RETRY_COOLDOWN_MS) {
    return null;
  }
  try {
    if (!transformers) {
      transformers = await import('@xenova/transformers');
      transformers.env.allowLocalModels = true;
      transformers.env.useBrowserCache = false;
    }
    console.log('Loading embedding model (first run downloads ~500MB)...');
    extractor = await transformers.pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    console.log('Embedding model loaded.');
    lastFailure = null;
    return extractor;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastFailure = { at: Date.now(), message };
    console.error('[EMBEDDINGS] Model unavailable, embeddings will be skipped:', message);
    return null;
  }
}

export interface EmbeddingModelStatus {
  available: boolean;
  lastFailure: { at: string; message: string } | null;
}

export function getEmbeddingModelStatus(): EmbeddingModelStatus {
  return {
    available: extractor !== null,
    lastFailure: lastFailure
      ? { at: new Date(lastFailure.at).toISOString(), message: lastFailure.message }
      : null,
  };
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  const ext = await getExtractor();
  if (!ext) return null;
  try {
    const output = await ext(text, { pooling: 'cls', normalize: true });
    return Array.from(output.data) as number[];
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function serializeEmbedding(embedding: number[]): string {
  return JSON.stringify(embedding);
}

export function deserializeEmbedding(data: string): number[] {
  return JSON.parse(data);
}
