/**
 * Text tokenization (Korean + English support)
 */
export function tokenize(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^\w\s\u3131-\u3163\u3165-\u318E\uAC00-\uD7A3]/g, ' ');
  return cleaned.split(/\s+/).filter(t => t.length > 1);
}

/**
 * Compute TF-IDF vector
 */
export function computeTfIdf(tokens: string[], idf: Map<string, number>): number[] {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  const vocabulary = Array.from(idf.keys());
  const vector: number[] = [];

  for (const term of vocabulary) {
    const termFreq = (tf.get(term) || 0) / tokens.length;
    const idfValue = idf.get(term) || 0;
    vector.push(termFreq * idfValue);
  }

  return vector;
}

/**
 * Compute cosine similarity
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Build IDF map from document token sets
 */
export function buildIdf(allTokens: string[][]): Map<string, number> {
  const docCount = allTokens.length;
  const df = new Map<string, number>();
  for (const tokens of allTokens) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, freq] of df) {
    idf.set(term, Math.log(docCount / freq));
  }

  return idf;
}
