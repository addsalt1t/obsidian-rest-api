/**
 * Utilities for type-safe parsing of Express request parameters
 *
 * When to use: When extracting values from Express req.query, req.params, req.headers
 * Anti-pattern: `req.query.foo as string` -- may be undefined/number at runtime
 */

import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../constants';

/** Parse a string parameter (may return undefined) */
export function parseStringParam(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

/** Parse an integer parameter */
export function parseIntParam(value: unknown, defaultValue?: number): number | undefined {
  if (value === undefined || value === null) return defaultValue;
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (Number.isNaN(num)) return defaultValue;
  return num;
}

/** Parse an enum parameter */
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
 * Parse pagination parameters
 *
 * When to use: Routes that require limit/offset-based pagination
 * @param query - req.query or Record<string, unknown>
 * @param maxLimit - Maximum allowed limit (default: MAX_PAGE_LIMIT=1000)
 * @param defaultLimit - Default value when limit is not specified (default: DEFAULT_PAGE_LIMIT=100)
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
