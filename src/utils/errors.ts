/**
 * Shared error message extraction utility.
 *
 * Use when converting unknown catch-block values to a human-readable string.
 * Prefer over inline `e instanceof Error ? e.message : String(e)` patterns.
 *
 * NOTE: Identical implementation exists in obsidian-mcp/src/utils/errors.ts.
 * Kept separate to avoid adding runtime dependencies to shared-types package.
 * Cross-package sync test ensures both implementations stay identical.
 */

/** Extract a human-readable message from an unknown error value. */
export function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
