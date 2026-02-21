/**
 * Event-driven tag cache service
 * - Immediate invalidation on vault/metadata events
 * - TTL fallback (safety net for missed events)
 * - Same singleton pattern as FileListCache
 */

import { App, Events } from 'obsidian';
import { TAG_CACHE_TTL_MS } from '../constants';

interface CachedTags {
  tags: Array<{ tag: string; count: number }>;
  timestamp: number;
}

/** Undocumented Obsidian MetadataCache with getTags() method */
interface MetadataCacheWithTags {
  getTags: () => Record<string, unknown>;
}

function hasGetTags(cache: unknown): cache is MetadataCacheWithTags {
  return (
    cache !== null &&
    typeof cache === 'object' &&
    'getTags' in cache &&
    typeof (cache as Record<string, unknown>).getTags === 'function'
  );
}

export class TagCacheService {
  private app: App;
  private cache: CachedTags | null = null;
  private vaultRefs: ReturnType<Events['on']>[] = [];
  private metadataRefs: ReturnType<Events['on']>[] = [];

  constructor(app: App) {
    this.app = app;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Vault events: immediate invalidation on file creation/deletion/rename
    this.vaultRefs.push(this.app.vault.on('create', () => this.invalidate()));
    this.vaultRefs.push(this.app.vault.on('delete', () => this.invalidate()));
    this.vaultRefs.push(this.app.vault.on('rename', () => this.invalidate()));
    // Metadata events: immediate invalidation on tag edits (inline/frontmatter)
    this.metadataRefs.push(this.app.metadataCache.on('changed', () => this.invalidate()));
  }

  invalidate(): void {
    this.cache = null;
  }

  getTags(): Array<{ tag: string; count: number }> {
    const now = Date.now();
    if (this.cache && (now - this.cache.timestamp) < TAG_CACHE_TTL_MS) {
      return this.cache.tags;
    }

    // Rebuild cache (getTags is an undocumented Obsidian API)
    if (!hasGetTags(this.app.metadataCache)) {
      this.cache = { tags: [], timestamp: now };
      return [];
    }

    const tagsMap = this.app.metadataCache.getTags();
    const tags = Object.entries(tagsMap).map(([tag, count]) => ({
      tag: tag.replace(/^#/, ''),
      count: typeof count === 'number' ? count : Number(count) || 0,
    }));
    tags.sort((a, b) => b.count - a.count);

    this.cache = { tags, timestamp: now };
    return tags;
  }

  dispose(): void {
    for (const ref of this.vaultRefs) this.app.vault.offref(ref);
    for (const ref of this.metadataRefs) this.app.metadataCache.offref(ref);
    this.vaultRefs = [];
    this.metadataRefs = [];
    this.cache = null;
  }
}

// Global singleton
let globalTagCache: TagCacheService | null = null;

export function getTagCacheService(app: App): TagCacheService {
  if (!globalTagCache) {
    globalTagCache = new TagCacheService(app);
  }
  return globalTagCache;
}

export function disposeTagCache(): void {
  globalTagCache?.dispose();
  globalTagCache = null;
}
