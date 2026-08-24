let transformers: any = null;
let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    if (!transformers) {
      transformers = await import('@xenova/transformers');
      // Local models only - no remote fetching after initial download
      transformers.env.allowLocalModels = true;
      transformers.env.useBrowserCache = false;
    }
    console.log('Loading embedding model (first run downloads ~500MB)...');
    extractor = await transformers.pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    console.log('Embedding model loaded.');
  }
  return extractor;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: 'cls', normalize: true });
  return Array.from(output.data) as number[];
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
