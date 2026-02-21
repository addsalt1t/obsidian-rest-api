/**
 * Autolink 서비스 내부 타입
 */

/**
 * 내부용 엔티티 정보 (frontmatter에서 추출)
 */
export interface AutolinkEntityInternal {
  path: string;
  name: string;
  aliases: string[];
}

/**
 * 정렬된 이름 목록 항목 (스캔/링크화에서 사용)
 */
export interface NameEntry {
  name: string;
  entity: AutolinkEntityInternal;
}
