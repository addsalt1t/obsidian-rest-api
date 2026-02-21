/**
 * Event-driven backlink cache service
 * - Immediate invalidation on vault/metadata events
 * - TTL fallback (safety net for missed events)
 * - Same singleton pattern as FileListCache
 */

import { App, Events } from 'obsidian';
import { BACKLINK_CACHE_TTL_MS } from '../constants';

interface BacklinkIndexCache {
  /** Per-file backlink list (target -> sources[]) */
  index: Map<string, string[]>;
  timestamp: number;
}

export class BacklinkCacheService {
  private app: App;
  private cache: BacklinkIndexCache | null = null;
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
    // Metadata events: immediate invalidation on link addition/removal
    this.metadataRefs.push(this.app.metadataCache.on('changed', () => this.invalidate()));
    // Resolved event: on full resolve completion (handles bulk changes)
    this.metadataRefs.push(this.app.metadataCache.on('resolved', () => this.invalidate()));
  }

  invalidate(): void {
    this.cache = null;
  }

  /**
   * Build or return the backlink reverse index from cache.
   * O(n) build, O(1) lookup for improved repeated query performance.
   */
  getIndex(): Map<string, string[]> {
    const now = Date.now();
    if (this.cache && (now - this.cache.timestamp) < BACKLINK_CACHE_TTL_MS) {
      return this.cache.index;
    }

    // Build reverse index
    const index = new Map<string, string[]>();
    const resolvedLinks = this.app.metadataCache.resolvedLinks;

    for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
      for (const targetPath of Object.keys(links)) {
        const existing = index.get(targetPath);
        if (existing) {
          existing.push(sourcePath);
        } else {
          index.set(targetPath, [sourcePath]);
        }
      }
    }

    this.cache = { index, timestamp: now };
    return index;
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
let globalBacklinkCache: BacklinkCacheService | null = null;

export function getBacklinkCacheService(app: App): BacklinkCacheService {
  if (!globalBacklinkCache) {
    globalBacklinkCache = new BacklinkCacheService(app);
  }
  return globalBacklinkCache;
}

export function disposeBacklinkCache(): void {
  globalBacklinkCache?.dispose();
  globalBacklinkCache = null;
}
