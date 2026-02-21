/**
 * Autolink Types
 * 미링크 멘션 감지 + 자동 wikilink 변환 서비스 타입
 */

/**
 * Autolink 엔티티 정보 (소스 노트에서 추출)
 */
export interface AutolinkEntity {
  name: string;
  path: string;
  aliases: string[];
}

/**
 * 스캔 결과 - 미링크 엔티티 발견
 */
export interface AutolinkScanMatch {
  entityName: string;       // 엔티티 이름
  entityPath: string;       // 엔티티 파일 경로
  matchedText: string;      // 매칭된 텍스트 (별칭 포함)
  filePath: string;         // 발견된 파일
  line: number;             // 라인 번호
  column: number;           // 컬럼 위치
  context: string;          // 주변 텍스트
  confidence: 'high' | 'medium' | 'low';
}

/**
 * scan 요청
 */
export interface AutolinkScanRequest {
  entitySourcePaths: string[];  // 엔티티를 추출할 소스 폴더 경로들
  targetPaths?: string[];       // 스캔 대상 파일 경로 (없으면 소스 경로 하위 전체)
}

/**
 * scan 응답
 */
export interface AutolinkScanResponse {
  matches: AutolinkScanMatch[];
  totalFiles: number;
  totalMatches: number;
  byEntity: Record<string, number>;
}

/**
 * linkify 요청
 */
export interface AutolinkLinkifyRequest {
  entitySourcePaths: string[];  // 엔티티를 추출할 소스 폴더 경로들
  targetPaths?: string[];       // 변환 대상 파일 경로 (없으면 소스 경로 하위 전체)
  dryRun?: boolean;             // true면 변환 결과만 반환, 실제 수정 안 함
  autoConfirm?: boolean;        // 호환성 플래그(안전상 high confidence만 자동 적용)
}

/**
 * 링크 변환 결과
 */
export interface AutolinkLinkifyChange {
  filePath: string;
  line: number;
  before: string;
  after: string;
  applied: boolean;
}

/**
 * linkify 응답
 */
export interface AutolinkLinkifyResponse {
  changes: AutolinkLinkifyChange[];
  filesModified: number;
  totalChanges: number;
  skipped: number;
}
