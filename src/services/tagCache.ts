/**
 * 이벤트 기반 태그 캐시 서비스
 * - vault/metadata 이벤트 시 즉시 무효화
 * - TTL 폴백 (이벤트 누락 안전장치)
 * - FileListCache 싱글톤 패턴 동일
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
    // vault 이벤트: 파일 생성/삭제/이름변경 시 즉시 무효화
    this.vaultRefs.push(this.app.vault.on('create', () => this.invalidate()));
    this.vaultRefs.push(this.app.vault.on('delete', () => this.invalidate()));
    this.vaultRefs.push(this.app.vault.on('rename', () => this.invalidate()));
    // metadata 이벤트: 태그 편집(인라인/프론트매터) 시 즉시 무효화
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

    // 캐시 재구축 (getTags는 Obsidian 비공식 API)
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

// 전역 싱글톤
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
