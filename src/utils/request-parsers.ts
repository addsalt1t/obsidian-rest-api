/**
 * Express 요청 파라미터를 타입 안전하게 파싱하는 유틸리티
 *
 * 사용 시점: Express req.query, req.params, req.headers에서 값을 추출할 때
 * 안티패턴: `req.query.foo as string` -- 런타임에 undefined/number일 수 있음
 */

import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../constants';

/** 문자열 파라미터 파싱 (undefined 반환 가능) */
export function parseStringParam(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

/** 정수 파라미터 파싱 */
export function parseIntParam(value: unknown, defaultValue?: number): number | undefined {
  if (value === undefined || value === null) return defaultValue;
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (Number.isNaN(num)) return defaultValue;
  return num;
}

/** enum 파라미터 파싱 */
export function parseEnumParam<T extends string>(
  value: unknown,
  validValues: readonly T[],
  defaultValue?: T
): T | undefined {
  if (typeof value === 'string' && validValues.includes(value as T)) return value as T;
  return defaultValue;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * 페이지네이션 파라미터 파싱
 *
 * 사용 시점: limit/offset 기반 페이지네이션이 필요한 라우트
 * @param query - req.query 또는 Record<string, unknown>
 * @param maxLimit - 허용 최대 limit (기본: MAX_PAGE_LIMIT=1000)
 * @param defaultLimit - limit 미지정 시 기본값 (기본: DEFAULT_PAGE_LIMIT=100)
 */
export function parsePagination(
  query: Record<string, unknown>,
  maxLimit: number = MAX_PAGE_LIMIT,
  defaultLimit: number = DEFAULT_PAGE_LIMIT,
): PaginationParams {
  const limit = Math.min(
    Math.max(1, parseIntParam(query.limit, defaultLimit) ?? defaultLimit),
    maxLimit,
  );
  const offset = Math.max(0, parseIntParam(query.offset, 0) ?? 0);
  return { limit, offset };
}
