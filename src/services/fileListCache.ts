/**
 * Vault file list cache service
 * Optimizes getMarkdownFiles() calls during repeated searches
 *
 * - Auto-invalidation on file creation/deletion/rename
 * - TTL-based auto-refresh
 * - Singleton pattern
 */

import { App, TFile, Events } from 'obsidian';
import { FILE_LIST_CACHE_TTL_MS } from '../constants';

/** Cache configuration */
interface CacheConfig {
  /** Cache TTL (milliseconds) */
  ttl: number;
}

/** Default cache configuration */
const DEFAULT_CONFIG: CacheConfig = {
  ttl: FILE_LIST_CACHE_TTL_MS,
};

/**
 * File list cache
 */
export class FileListCache {
  private app: App;
  private config: CacheConfig;
  private cachedFiles: TFile[] | null = null;
  private cacheTimestamp: number = 0;
  private eventRefs: ReturnType<Events['on']>[] = [];

  constructor(app: App, config: Partial<CacheConfig> = {}) {
    this.app = app;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  /**
   * Set up vault event listeners
   * Invalidate cache on file changes
   */
  private setupEventListeners(): void {
    // Invalidate on file creation
    this.eventRefs.push(
      this.app.vault.on('create', () => this.invalidate())
    );

    // Invalidate on file deletion
    this.eventRefs.push(
      this.app.vault.on('delete', () => this.invalidate())
    );

    // Invalidate on file rename
    this.eventRefs.push(
      this.app.vault.on('rename', () => this.invalidate())
    );
  }

  /**
   * Invalidate cache
   */
  invalidate(): void {
    this.cachedFiles = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Check if cache is valid
   */
  private isValid(): boolean {
    if (!this.cachedFiles) return false;
    return Date.now() - this.cacheTimestamp < this.config.ttl;
  }

  /**
   * Get markdown file list (uses cache)
   */
  getMarkdownFiles(): TFile[] {
    if (this.isValid() && this.cachedFiles) {
      return this.cachedFiles;
    }

    // Refresh cache
    this.cachedFiles = this.app.vault.getMarkdownFiles();
    this.cacheTimestamp = Date.now();
    return this.cachedFiles;
  }

  /**
   * Cache statistics
   */
  getStats(): { cached: boolean; fileCount: number; age: number } {
    return {
      cached: this.isValid(),
      fileCount: this.cachedFiles?.length ?? 0,
      age: this.cachedFiles ? Date.now() - this.cacheTimestamp : 0,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    this.cachedFiles = null;
  }
}

// Global instance
let globalCache: FileListCache | null = null;

/**
 * Get the global file list cache
 */
export function getFileListCache(app: App): FileListCache {
  if (!globalCache) {
    globalCache = new FileListCache(app);
  }
  return globalCache;
}

/**
 * Dispose the global cache (on plugin unload)
 */
export function disposeFileListCache(): void {
  if (globalCache) {
    globalCache.dispose();
    globalCache = null;
  }
}
