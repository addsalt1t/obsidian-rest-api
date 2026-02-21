/**
 * Metadata API 관련 타입 정의
 */

/** 태그 정보 */
export interface TagInfo {
  /** 태그 이름 (# prefix 포함 가능) */
  tag: string;
  /** 사용 횟수 */
  count: number;
}
