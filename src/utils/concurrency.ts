/**
 * Concurrency control utilities
 * True parallel processing with concurrency limiting (p-limit style)
 */

import { BATCH_CONCURRENCY } from '../constants';

/**
 * Create a concurrency-limiting wrapper (p-limit style)
 * @param concurrency - Maximum number of concurrent executions
 * @returns limit function
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
 * Execute an async function for each array element with concurrency limiting
 * - True parallel processing: starts the next task as soon as a slot becomes available
 * - Improves overall throughput compared to sequential batch processing
 *
 * @param items - Array of items to process
 * @param fn - Async function to process each item
 * @param concurrency - Maximum concurrent executions (default: BATCH_CONCURRENCY)
 * @returns Result array (preserves input order)
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
 * Execute an async function for each array element with concurrency limiting (allSettled version)
 * - Collects remaining results even if some fail
 *
 * @param items - Array of items to process
 * @param fn - Async function to process each item
 * @param concurrency - Maximum concurrent executions (default: BATCH_CONCURRENCY)
 * @returns PromiseSettledResult array (preserves input order)
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
