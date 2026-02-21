/**
 * Vector Types
 * TF-IDF 기반 시맨틱 검색 서비스 타입
 */

/**
 * 임베딩 상태
 */
export interface VectorEmbeddingStatus {
  totalDocuments: number;
  embeddedDocuments: number;
  pendingDocuments: number;
  modelName: string;
  /** 임베딩 캐시 최대 크기 */
  cacheMaxSize?: number;
  /** 캐시 사용량 (예: "5/500") */
  cacheUsage?: string;
}

/**
 * 임베딩 요청
 */
export interface VectorEmbedRequest {
  basePath?: string;    // 대상 폴더 경로 (없으면 볼트 전체)
  paths?: string[];     // 특정 파일만 임베딩
  force?: boolean;      // 기존 임베딩 무시하고 재생성
}

/**
 * 임베딩 응답
 */
export interface VectorEmbedResponse {
  success: boolean;
  processed: number;
  skipped: number;
  errors: string[];
}

/**
 * 벡터 검색 요청
 */
export interface VectorSearchRequest {
  query: string;
  basePath?: string;                          // 검색 범위 폴더 (없으면 임베딩된 전체)
  limit?: number;                             // 기본값: 10
  threshold?: number;                         // 최소 유사도 (0-1)
  frontmatterFilter?: Record<string, unknown>; // 범용 frontmatter 키-값 필터
}

/**
 * 벡터 검색 결과 항목
 */
export interface VectorSearchResult {
  path: string;
  name: string;
  score: number;
  frontmatter?: Record<string, unknown>;
  excerpt?: string;
}

/**
 * 벡터 검색 응답
 */
export interface VectorSearchResponse {
  results: VectorSearchResult[];
  query: string;
  totalSearched: number;
}
