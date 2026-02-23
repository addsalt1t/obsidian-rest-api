/**
 * Search API 관련 타입 정의
 */

/** REST API 검색 매치 정보 (서버 응답용) */
export interface RestSearchMatch {
  /** 매치 라인 번호 (1-based) */
  line: number;
  /** 매치 주변 컨텍스트 문자열 */
  context?: string;
  /** 컨텍스트 내 매치 위치 */
  match?: {
    start: number;
    end: number;
  };
}

/** REST API 검색 결과 (서버 응답용) */
export interface RestSearchResult {
  /** 파일 경로 */
  path: string;
  /** 검색 점수 */
  score: number;
  /** 매치 정보 목록 */
  matches: RestSearchMatch[];
}

/** MCP API 검색 매치 정보 (클라이언트 반환용) */
export interface SearchMatch {
  /** 매치된 라인 번호 */
  line: number;
  /** 매치된 라인 내용 */
  content: string;
  /** 하이라이트 위치 [시작, 끝] 쌍 배열 */
  highlight: [number, number][];
}

/** MCP API 검색 결과 (클라이언트 반환용) */
export interface SearchResult {
  /** 파일 경로 */
  path: string;
  /** 검색 점수 */
  score: number;
  /** 매치 정보 목록 */
  matches: SearchMatch[];
}

/** Dataview DQL 쿼리 결과 */
export interface DataviewResult {
  /** 결과 타입 */
  type: 'table' | 'list' | 'task';
  /** 쿼리 결과 데이터 */
  results: unknown[];
  /** 결과가 제한되었는지 여부 (1000행 초과 시 true) */
  truncated?: boolean;
  /** 제한 전 전체 결과 수 */
  totalCount?: number;
  /** 적용된 결과 제한 수 */
  limit?: number;
}

/** JsonLogic 개별 쿼리 결과 */
export interface JsonLogicResult {
  /** 파일 경로 */
  path: string;
  /** 쿼리 결과 값 */
  result: unknown;
}

/** JsonLogic 쿼리 응답 (결과 + 페이지네이션 메타데이터) */
export interface JsonLogicQueryResponse {
  /** 쿼리 결과 배열 */
  results: JsonLogicResult[];
  /** 추가 결과 존재 여부 (조기 종료 시) */
  hasMore?: boolean;
  /** 스캔된 파일 수 (조기 종료 시) */
  scanned?: number;
  /** 전체 대상 파일 수 (조기 종료 시) */
  totalFiles?: number;
}
