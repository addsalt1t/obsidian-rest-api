/**
 * Batch 작업 결과 분류 유틸리티
 * PromiseSettledResult를 success/errors로 분류
 */

import { toErrorMessage } from './errors';

export interface PartitionedResults<T> {
  success: T[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * PromiseSettledResult 배열을 success/errors로 분류
 *
 * @param results - allSettled 결과 배열
 * @param items - 원본 입력 배열 (에러 시 경로 추출용)
 * @param getErrorPath - 원본 아이템에서 에러 경로 추출 함수
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
