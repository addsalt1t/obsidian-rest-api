/**
 * 동시성 제어 유틸리티
 * p-limit 스타일의 진정한 병렬 처리 (동시 실행 수 제한)
 */

import { BATCH_CONCURRENCY } from '../constants';

/**
 * 동시 실행 수를 제한하는 래퍼 생성 (p-limit 스타일)
 * @param concurrency - 최대 동시 실행 수
 * @returns limit 함수
 */
export function pLimit(concurrency: number) {
  if (concurrency < 1) {
    throw new Error('Concurrency must be at least 1');
  }

  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift();
      run?.();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const runner = () => {
        run(fn).then(resolve, reject);
      };

      if (activeCount < concurrency) {
        runner();
      } else {
        queue.push(runner);
      }
    });
  };

  return <T>(fn: () => Promise<T>): Promise<T> => enqueue(fn);
}

/**
 * 배열의 각 요소에 대해 동시성 제한을 두고 비동기 함수 실행
 * - 진정한 병렬 처리: 슬롯이 비는 즉시 다음 작업 시작
 * - 배치 순차 처리와 달리 전체 throughput 향상
 *
 * @param items - 처리할 아이템 배열
 * @param fn - 각 아이템을 처리할 비동기 함수
 * @param concurrency - 동시 실행 수 (기본값: BATCH_CONCURRENCY)
 * @returns 결과 배열 (입력 순서 유지)
 *
 * @example
 * const results = await mapWithConcurrency(
 *   files,
 *   async (file) => await processFile(file),
 *   10
 * );
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = BATCH_CONCURRENCY
): Promise<R[]> {
  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, index) => limit(() => fn(item, index))));
}

/**
 * 배열의 각 요소에 대해 동시성 제한을 두고 비동기 함수 실행 (allSettled 버전)
 * - 일부 실패해도 나머지 결과 수집
 *
 * @param items - 처리할 아이템 배열
 * @param fn - 각 아이템을 처리할 비동기 함수
 * @param concurrency - 동시 실행 수 (기본값: BATCH_CONCURRENCY)
 * @returns PromiseSettledResult 배열 (입력 순서 유지)
 */
export async function mapWithConcurrencySettled<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = BATCH_CONCURRENCY
): Promise<PromiseSettledResult<R>[]> {
  const limit = pLimit(concurrency);
  return Promise.allSettled(
    items.map((item, index) =>
      limit(() => fn(item, index))
    )
  );
}
