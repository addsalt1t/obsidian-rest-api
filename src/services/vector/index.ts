/**
 * Vector service unified exports
 */
export { tokenize, computeTfIdf, cosineSimilarity, getEmbeddingStatus, embed, vectorSearch } from './vector-service';
export { resolveScopedMarkdownFiles, resolveScopedMarkdownFilesWithPaths } from './scope';
export { clearEmbeddingCache } from './cache';
export type { EmbeddingEntry } from './types';
export { MAX_CACHE_SIZE, DEFAULT_VECTOR_LIMIT, DEFAULT_SIMILARITY_THRESHOLD, EXCERPT_WINDOW } from './constants';
