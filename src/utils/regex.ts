/**
 * RegExp special character escaping
 * Utilities for safely using user input in RegExp
 */

/**
 * Escape RegExp special characters
 * @param str - The string to escape
 * @returns The escaped string
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape special characters for glob patterns
 * Preserves * and ? as glob wildcards
 * @param str - The string to escape
 * @returns The escaped string
 */
export function escapeGlobPattern(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}
