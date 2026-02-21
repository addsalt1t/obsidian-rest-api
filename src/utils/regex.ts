/**
 * RegExp 특수문자 이스케이프
 * 사용자 입력을 RegExp에 안전하게 사용하기 위한 유틸
 */

/**
 * RegExp 특수문자 이스케이프
 * @param str - 이스케이프할 문자열
 * @returns 이스케이프된 문자열
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Glob 패턴용 특수문자 이스케이프
 * * 와 ?는 glob 와일드카드로 유지
 * @param str - 이스케이프할 문자열
 * @returns 이스케이프된 문자열
 */
export function escapeGlobPattern(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}
