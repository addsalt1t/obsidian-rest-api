/**
 * 파일 작업 관련 타입 정의
 */

/** PATCH 작업 유형 */
export type PatchOperation = 'append' | 'prepend' | 'replace' | 'delete';

/** PATCH 대상 유형 */
export type PatchTargetType = 'heading' | 'block' | 'line' | 'frontmatter' | 'frontmatter-key';

/** PATCH 요청 옵션 */
export interface PatchOptions {
  /** 작업 유형 */
  operation: PatchOperation;
  /** 대상 유형 */
  targetType?: PatchTargetType;
  /** 대상 식별자 (헤딩 텍스트, 블록 ID, 라인 번호, 프론트매터 키) */
  target?: string;
  /** 서버사이드 헤딩 경로 자동 해석 (targetType='heading' 시 사용) */
  resolve?: boolean;
}

/** 헤딩 정보 */
export interface HeadingInfo {
  /** 헤딩 레벨 (1-6) */
  level: number;
  /** 헤딩 텍스트 */
  text: string;
  /** 전체 경로 (예: "Parent::Child::Grandchild") */
  fullPath: string;
  /** 라인 번호 (0-based) */
  line: number;
}

/** 헤딩 해석 결과 */
export interface HeadingResolveResult {
  /** 찾은 헤딩들 */
  headings: HeadingInfo[];
  /** 중복 여부 */
  ambiguous: boolean;
  /** 에러 메시지 (없으면 undefined) */
  error?: string;
}
