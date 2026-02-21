/**
 * Batch operation result classification utilities
 * Classifies PromiseSettledResult into success/errors
 */

import { toErrorMessage } from './errors';

export interface PartitionedResults<T> {
  success: T[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Classify a PromiseSettledResult array into success/errors
 *
 * @param results - allSettled result array
 * @param items - Original input array (for extracting paths on error)
 * @param getErrorPath - Function to extract error path from original item
 *
 * @example
 * ```ts
 * const { success, errors } = partitionSettledResults(
 *   results, paths, (path) => path
 * );
 * ```
 */
export function partitionSettledResults<T, I>(
  results: PromiseSettledResult<T>[],
  items: I[],
  getErrorPath: (item: I, index: number) => string,
): PartitionedResults<T> {
  const success: T[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      success.push(result.value);
    } else {
      errors.push({
        path: getErrorPath(items[i], i),
        error: toErrorMessage(result.reason),
      });
    }
  });

  return { success, errors };
}
