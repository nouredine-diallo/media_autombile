let transformers: any = null;
let extractor: any = null;
let modelFailed = false;

async function getExtractor(): Promise<any> {
  if (modelFailed) return null;
  if (extractor) return extractor;
  try {
    if (!transformers) {
      transformers = await import('@xenova/transformers');
      transformers.env.allowLocalModels = true;
      transformers.env.useBrowserCache = false;
    }
    console.log('Loading embedding model (first run downloads ~500MB)...');
    extractor = await transformers.pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    console.log('Embedding model loaded.');
    return extractor;
  } catch (error) {
    modelFailed = true;
    console.error('[EMBEDDINGS] Model unavailable, embeddings will be skipped:', error instanceof Error ? error.message : error);
    return null;
  }
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
