/**
 * Vector 서비스 내부 타입
 */

/**
 * 임베딩 캐시 엔트리
 */
export interface EmbeddingEntry {
  path: string;
  mtime: number;
  vector: number[];
  tokens: string[];
  lastAccess: number;
}
