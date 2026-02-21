/**
 * Vault 파일 목록 캐시 서비스
 * 반복 검색 시 getMarkdownFiles() 호출 최적화
 *
 * - 파일 추가/삭제/이름변경 시 자동 무효화
 * - TTL 기반 자동 갱신
 * - 싱글톤 패턴
 */

import { App, TFile, Events } from 'obsidian';
import { FILE_LIST_CACHE_TTL_MS } from '../constants';

/** 캐시 설정 */
interface CacheConfig {
  /** 캐시 TTL (밀리초) */
  ttl: number;
}

/** 기본 캐시 설정 */
const DEFAULT_CONFIG: CacheConfig = {
  ttl: FILE_LIST_CACHE_TTL_MS,
};

/**
 * 파일 목록 캐시
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
   * Vault 이벤트 리스너 설정
   * 파일 변경 시 캐시 무효화
   */
  private setupEventListeners(): void {
    // 파일 생성 시 무효화
    this.eventRefs.push(
      this.app.vault.on('create', () => this.invalidate())
    );

    // 파일 삭제 시 무효화
    this.eventRefs.push(
      this.app.vault.on('delete', () => this.invalidate())
    );

    // 파일 이름 변경 시 무효화
    this.eventRefs.push(
      this.app.vault.on('rename', () => this.invalidate())
    );
  }

  /**
   * 캐시 무효화
   */
  invalidate(): void {
    this.cachedFiles = null;
    this.cacheTimestamp = 0;
  }

  /**
   * 캐시가 유효한지 확인
   */
  private isValid(): boolean {
    if (!this.cachedFiles) return false;
    return Date.now() - this.cacheTimestamp < this.config.ttl;
  }

  /**
   * 마크다운 파일 목록 조회 (캐시 사용)
   */
  getMarkdownFiles(): TFile[] {
    if (this.isValid() && this.cachedFiles) {
      return this.cachedFiles;
    }

    // 캐시 갱신
    this.cachedFiles = this.app.vault.getMarkdownFiles();
    this.cacheTimestamp = Date.now();
    return this.cachedFiles;
  }

  /**
   * 캐시 통계
   */
  getStats(): { cached: boolean; fileCount: number; age: number } {
    return {
      cached: this.isValid(),
      fileCount: this.cachedFiles?.length ?? 0,
      age: this.cachedFiles ? Date.now() - this.cacheTimestamp : 0,
    };
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    this.cachedFiles = null;
  }
}

// 전역 인스턴스
let globalCache: FileListCache | null = null;

/**
 * 전역 파일 목록 캐시 획득
 */
export function getFileListCache(app: App): FileListCache {
  if (!globalCache) {
    globalCache = new FileListCache(app);
  }
  return globalCache;
}

/**
 * 전역 캐시 정리 (플러그인 언로드 시)
 */
export function disposeFileListCache(): void {
  if (globalCache) {
    globalCache.dispose();
    globalCache = null;
  }
}
