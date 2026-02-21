/**
 * Batch 작업 관련 타입 정의
 */

/** 배치 읽기 결과 */
export interface BatchReadResult {
  /** 성공적으로 읽은 파일들 */
  success: Array<{ path: string; content: string }>;
  /** 읽기 실패한 파일들 */
  errors: Array<{ path: string; error: string }>;
  /** 총 요청 파일 수 */
  total: number;
}

/** 배치 쓰기 작업 타입 */
export type BatchWriteOperationType = 'create' | 'update' | 'upsert';

/** 배치 쓰기 작업 단위 */
export interface BatchWriteOperation {
  /** 파일 경로 */
  path: string;
  /** 파일 내용 */
  content: string;
  /** 작업 유형 (기본값: upsert) */
  operation?: BatchWriteOperationType;
}

/** 배치 쓰기 결과 */
export interface BatchWriteResult {
  /** 성공적으로 쓴 파일들 */
  success: Array<{
    path: string;
    /** 생성/수정 여부 */
    created: boolean;
  }>;
  /** 쓰기 실패한 파일들 */
  errors: Array<{ path: string; error: string }>;
  /** 총 요청 파일 수 */
  total: number;
}

/** 배치 삭제 결과 */
export interface BatchDeleteResult {
  /** 성공적으로 삭제된 파일들 */
  success: string[];
  /** 삭제 실패한 파일들 */
  errors: Array<{ path: string; error: string }>;
  /** 총 요청 파일 수 */
  total: number;
}

/** 배치 메타데이터 조회 결과 */
export interface BatchMetadataResult {
  /** 성공적으로 조회된 메타데이터 */
  success: Array<{
    path: string;
    frontmatter: Record<string, unknown>;
    tags: string[];
    links: Array<{ path: string; displayText?: string }>;
    stat: { size: number; ctime: number; mtime: number };
  }>;
  /** 조회 실패한 파일들 */
  errors: Array<{ path: string; error: string }>;
  /** 총 요청 파일 수 */
  total: number;
}
