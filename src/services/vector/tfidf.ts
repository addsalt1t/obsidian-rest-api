/**
 * Text tokenization (Korean + English support)
 */
export function tokenize(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^\w\s\u3131-\u3163\u3165-\u318E\uAC00-\uD7A3]/g, ' ');
  return cleaned.split(/\s+/).filter(t => t.length > 1);
}

/**
 * Compute TF-IDF sparse vector.
 * Only tokens present in the document are included (non-zero entries).
 */
export function computeTfIdf(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  const vector = new Map<string, number>();

  for (const [term, count] of tf) {
    const idfValue = idf.get(term);
    if (idfValue === undefined || idfValue === 0) continue;
    const tfidf = (count / tokens.length) * idfValue;
    if (tfidf !== 0) vector.set(term, tfidf);
  }

  return vector;
}

/**
 * Compute cosine similarity between two sparse vectors.
 * Iterates the smaller map for dot product to minimize work.
 */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;

  // Iterate the smaller map for dot product
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];

  let dotProduct = 0;
  for (const [key, valA] of smaller) {
    const valB = larger.get(key);
    if (valB !== undefined) dotProduct += valA * valB;
  }

  // Compute norms from each map's values
  let normA = 0;
  for (const val of a.values()) normA += val * val;

  let normB = 0;
  for (const val of b.values()) normB += val * val;

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
