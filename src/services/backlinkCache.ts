/**
 * 이벤트 기반 백링크 캐시 서비스
 * - vault/metadata 이벤트 시 즉시 무효화
 * - TTL 폴백 (이벤트 누락 안전장치)
 * - FileListCache 싱글톤 패턴 동일
 */

import { App, Events } from 'obsidian';
import { BACKLINK_CACHE_TTL_MS } from '../constants';

interface BacklinkIndexCache {
  /** 파일별 백링크 목록 (target -> sources[]) */
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
    // vault 이벤트: 파일 생성/삭제/이름변경 시 즉시 무효화
    this.vaultRefs.push(this.app.vault.on('create', () => this.invalidate()));
    this.vaultRefs.push(this.app.vault.on('delete', () => this.invalidate()));
    this.vaultRefs.push(this.app.vault.on('rename', () => this.invalidate()));
    // metadata 이벤트: 링크 추가/삭제 시 즉시 무효화
    this.metadataRefs.push(this.app.metadataCache.on('changed', () => this.invalidate()));
    // resolved 이벤트: 전체 resolve 완료 시 (벌크 변경 대응)
    this.metadataRefs.push(this.app.metadataCache.on('resolved', () => this.invalidate()));
  }

  invalidate(): void {
    this.cache = null;
  }

  /**
   * 백링크 역방향 인덱스를 빌드하거나 캐시에서 반환
   * O(n) 빌드, O(1) 조회로 반복 쿼리 성능 개선
   */
  getIndex(): Map<string, string[]> {
    const now = Date.now();
    if (this.cache && (now - this.cache.timestamp) < BACKLINK_CACHE_TTL_MS) {
      return this.cache.index;
    }

    // 역방향 인덱스 빌드
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

// 전역 싱글톤
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

