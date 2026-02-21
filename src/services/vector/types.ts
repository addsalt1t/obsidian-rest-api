/**
 * Vector service internal types
 */

/**
 * Embedding cache entry
 */
export interface EmbeddingEntry {
  path: string;
  mtime: number;
  vector: number[];
  tokens: string[];
  lastAccess: number;
}
