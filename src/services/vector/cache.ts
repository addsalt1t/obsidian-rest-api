import { createLogger } from '../../utils/logger';
import { MAX_CACHE_SIZE } from './constants';
import { buildIdf, computeTfIdf } from './tfidf';
import type { EmbeddingEntry } from './types';

const logger = createLogger('Vector');

const embeddingCache = new Map<string, EmbeddingEntry>();
let idfCache: Map<string, number> | null = null;
let idfDirty = true;

export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  idfCache = null;
  idfDirty = true;
}

export function getEmbeddingCount(): number {
  return embeddingCache.size;
}

export function getEmbeddingEntries(): IterableIterator<EmbeddingEntry> {
  return embeddingCache.values();
}

export function getEmbeddingPaths(): IterableIterator<string> {
  return embeddingCache.keys();
}

export function getFromEmbeddingCache(key: string): EmbeddingEntry | undefined {
  const entry = embeddingCache.get(key);
  if (entry) {
    entry.lastAccess = Date.now();
  }
  return entry;
}

export function setToEmbeddingCache(
  key: string,
  entry: Omit<EmbeddingEntry, 'lastAccess'>
): void {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [cacheKey, cacheEntry] of embeddingCache) {
      if (cacheEntry.lastAccess < oldestTime) {
        oldestTime = cacheEntry.lastAccess;
        oldestKey = cacheKey;
      }
    }

    if (oldestKey) {
      embeddingCache.delete(oldestKey);
      logger.debug(`Cache eviction: removed ${oldestKey}`);
    }
  }

  embeddingCache.set(key, { ...entry, lastAccess: Date.now() });
  idfDirty = true;
}

function rebuildIdfAndVectors(): void {
  const allTokens = Array.from(embeddingCache.values()).map(entry => entry.tokens);
  idfCache = buildIdf(allTokens);

  for (const entry of embeddingCache.values()) {
    entry.vector = computeTfIdf(entry.tokens, idfCache);
  }

  idfDirty = false;
  logger.debug(`IDF rebuilt: ${idfCache.size} terms, ${embeddingCache.size} documents`);
}

export function ensureIdfAndVectors(): Map<string, number> {
  if (!idfDirty && idfCache) {
    return idfCache;
  }

  rebuildIdfAndVectors();
  return idfCache ?? new Map<string, number>();
}
