import { describe, it, expect } from 'vitest';
import { pLimit, mapWithConcurrency, mapWithConcurrencySettled } from '../../src/utils/concurrency';

describe('pLimit', () => {
  it('should limit concurrent executions', async () => {
    const limit = pLimit(2);
    let running = 0;
    let maxRunning = 0;

    const task = async (id: number) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(resolve => setTimeout(resolve, 1));
      running--;
      return id;
    };

    const promises = [1, 2, 3, 4, 5].map(id => limit(() => task(id)));
    const results = await Promise.all(promises);

    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxRunning).toBe(2);
  });

  it('should handle concurrency of 1', async () => {
    const limit = pLimit(1);
    const order: number[] = [];

    const task = async (id: number) => {
      order.push(id);
      await new Promise(resolve => setTimeout(resolve, 1));
      return id;
    };

    await Promise.all([1, 2, 3].map(id => limit(() => task(id))));

    expect(order).toEqual([1, 2, 3]);
  });

  it('should throw for invalid concurrency', () => {
    expect(() => pLimit(0)).toThrow('Concurrency must be at least 1');
    expect(() => pLimit(-1)).toThrow('Concurrency must be at least 1');
  });

  it('should propagate errors', async () => {
    const limit = pLimit(2);

    const promise = limit(async () => {
      throw new Error('test error');
    });

    await expect(promise).rejects.toThrow('test error');
  });
});

describe('mapWithConcurrency', () => {
  it('should process all items with limited concurrency', async () => {
    let maxConcurrent = 0;
    let concurrent = 0;

    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      async (item) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 1));
        concurrent--;
        return item * 2;
      },
      2
    );

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should maintain order', async () => {
    const delays = [6, 2, 4, 1, 3];

    const results = await mapWithConcurrency(
      delays,
      async (delay, index) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        return index;
      },
      3
    );

    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('should handle empty array', async () => {
    const results = await mapWithConcurrency([], async (x) => x, 2);
    expect(results).toEqual([]);
  });
});

describe('mapWithConcurrencySettled', () => {
  it('should collect all results including failures', async () => {
    const results = await mapWithConcurrencySettled(
      [1, 2, 3, 4],
      async (item) => {
        if (item === 2) throw new Error('fail on 2');
        return item * 10;
      },
      2
    );

    expect(results[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason.message).toBe('fail on 2');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 30 });
    expect(results[3]).toEqual({ status: 'fulfilled', value: 40 });
  });

  it('should continue processing after errors', async () => {
    let processed = 0;

    await mapWithConcurrencySettled(
      [1, 2, 3],
      async (item) => {
        processed++;
        if (item === 1) throw new Error('first fails');
        return item;
      },
      1
    );

    expect(processed).toBe(3);
  });
});
