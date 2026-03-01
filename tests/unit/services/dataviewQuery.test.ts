import { describe, it, expect, vi } from 'vitest';
import { createMockApp } from '../../helpers/mock-app';
import { executeDataviewQuery } from '../../../src/services/dataviewQuery';
import { DATAVIEW_MAX_RESULTS, QUERY_TIMEOUT_MS } from '../../../src/constants';

/** Create a mock App with Dataview plugin wired up. */
function createDataviewApp(apiOverrides?: Record<string, unknown>) {
  return createMockApp({
    // @ts-expect-error - plugins is not part of the official App type
    plugins: {
      plugins: {
        dataview: apiOverrides === undefined
          ? undefined
          : { api: apiOverrides },
      },
    },
  }) as ReturnType<typeof createMockApp> & { plugins: unknown };
}

/** Shorthand: App with a working Dataview query mock. */
function createDataviewAppWithQuery(queryFn: (...args: unknown[]) => unknown) {
  const app = createMockApp();
  // Inject Dataview plugin onto the mock app
  (app as unknown as Record<string, unknown>).plugins = {
    plugins: {
      dataview: { api: { query: queryFn } },
    },
  };
  return app;
}

/** Shorthand: App where Dataview plugin is missing entirely. */
function createAppWithoutDataview() {
  return createMockApp();
}

describe('executeDataviewQuery', () => {
  describe('plugin availability', () => {
    it('should throw pluginNotEnabled when Dataview plugin is missing', async () => {
      const app = createAppWithoutDataview();

      await expect(executeDataviewQuery(app, 'TABLE file.name'))
        .rejects.toThrow('Dataview plugin is not installed or enabled');
    });

    it('should throw pluginNotEnabled when Dataview plugin has no api', async () => {
      const app = createMockApp();
      (app as unknown as Record<string, unknown>).plugins = {
        plugins: { dataview: {} },
      };

      await expect(executeDataviewQuery(app, 'TABLE file.name'))
        .rejects.toThrow('Dataview plugin is not installed or enabled');
    });
  });

  describe('DQL body parsing', () => {
    it('should throw badRequest when body is empty string', async () => {
      const app = createDataviewAppWithQuery(vi.fn());

      await expect(executeDataviewQuery(app, ''))
        .rejects.toThrow('DQL query is required');
    });

    it('should throw badRequest when body is null', async () => {
      const app = createDataviewAppWithQuery(vi.fn());

      await expect(executeDataviewQuery(app, null))
        .rejects.toThrow('DQL query is required');
    });

    it('should throw badRequest when body is undefined', async () => {
      const app = createDataviewAppWithQuery(vi.fn());

      await expect(executeDataviewQuery(app, undefined))
        .rejects.toThrow('DQL query is required');
    });

    it('should extract query from object body with .query field', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'table', values: [['a']] },
      });
      const app = createDataviewAppWithQuery(queryFn);

      await executeDataviewQuery(app, { query: 'TABLE file.name' });

      expect(queryFn).toHaveBeenCalledWith('TABLE file.name');
    });

    it('should accept string body directly as DQL', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'list', values: ['item1'] },
      });
      const app = createDataviewAppWithQuery(queryFn);

      await executeDataviewQuery(app, 'LIST FROM #tag');

      expect(queryFn).toHaveBeenCalledWith('LIST FROM #tag');
    });
  });

  describe('successful queries', () => {
    it('should return type and results from Dataview response', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'table', values: [['row1'], ['row2']] },
      });
      const app = createDataviewAppWithQuery(queryFn);

      const result = await executeDataviewQuery(app, 'TABLE file.name');

      expect(result.type).toBe('table');
      expect(result.results).toEqual([['row1'], ['row2']]);
      expect(result.truncated).toBeUndefined();
      expect(result.totalCount).toBeUndefined();
      expect(result.limit).toBeUndefined();
    });

    it('should handle empty values array', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'list', values: [] },
      });
      const app = createDataviewAppWithQuery(queryFn);

      const result = await executeDataviewQuery(app, 'LIST');

      expect(result.results).toEqual([]);
      expect(result.truncated).toBeUndefined();
    });

    it('should include headers for TABLE queries', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'table', values: [['a', 1]], headers: ['Name', 'Value'] },
      });
      const app = createDataviewAppWithQuery(queryFn);

      const result = await executeDataviewQuery(app, 'TABLE file.name, file.size');

      expect(result.type).toBe('table');
      expect(result.headers).toEqual(['Name', 'Value']);
      expect(result.results).toEqual([['a', 1]]);
    });

    it('should omit headers when not present', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'list', values: ['item1'] },
      });
      const app = createDataviewAppWithQuery(queryFn);

      const result = await executeDataviewQuery(app, 'LIST FROM #tag');

      expect(result.headers).toBeUndefined();
    });

    it('should handle missing values (undefined)', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'task' },
      });
      const app = createDataviewAppWithQuery(queryFn);

      const result = await executeDataviewQuery(app, 'TASK');

      expect(result.results).toEqual([]);
    });
  });

  describe('truncation boundary', () => {
    it('should not truncate when results equal DATAVIEW_MAX_RESULTS', async () => {
      const values = Array.from({ length: DATAVIEW_MAX_RESULTS }, (_, i) => i);
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'list', values },
      });
      const app = createDataviewAppWithQuery(queryFn);

      const result = await executeDataviewQuery(app, 'LIST');

      expect(result.results).toHaveLength(DATAVIEW_MAX_RESULTS);
      expect(result.truncated).toBeUndefined();
      expect(result.totalCount).toBeUndefined();
      expect(result.limit).toBeUndefined();
    });

    it('should truncate when results exceed DATAVIEW_MAX_RESULTS', async () => {
      const totalCount = DATAVIEW_MAX_RESULTS + 5;
      const values = Array.from({ length: totalCount }, (_, i) => i);
      const queryFn = vi.fn().mockResolvedValue({
        successful: true,
        value: { type: 'table', values },
      });
      const app = createDataviewAppWithQuery(queryFn);

      const result = await executeDataviewQuery(app, 'TABLE file.name');

      expect(result.results).toHaveLength(DATAVIEW_MAX_RESULTS);
      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(totalCount);
      expect(result.limit).toBe(DATAVIEW_MAX_RESULTS);
    });
  });

  describe('error handling', () => {
    it('should throw badRequest when Dataview query is unsuccessful', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        successful: false,
        error: 'Syntax error in DQL',
      });
      const app = createDataviewAppWithQuery(queryFn);

      await expect(executeDataviewQuery(app, 'INVALID QUERY'))
        .rejects.toThrow('Dataview query failed');
    });

    it('should re-throw ApiError (error with statusCode) as-is', async () => {
      const apiError = Object.assign(new Error('Not found'), { statusCode: 404 });
      const queryFn = vi.fn().mockRejectedValue(apiError);
      const app = createDataviewAppWithQuery(queryFn);

      await expect(executeDataviewQuery(app, 'TABLE file.name'))
        .rejects.toBe(apiError);
    });

    it('should wrap non-ApiError exceptions as internal error', async () => {
      const queryFn = vi.fn().mockRejectedValue(new TypeError('Cannot read property'));
      const app = createDataviewAppWithQuery(queryFn);

      await expect(executeDataviewQuery(app, 'TABLE file.name'))
        .rejects.toThrow('Dataview query execution failed');
    });

    it('should wrap non-Error thrown values as internal error', async () => {
      const queryFn = vi.fn().mockRejectedValue('string error');
      const app = createDataviewAppWithQuery(queryFn);

      await expect(executeDataviewQuery(app, 'TABLE file.name'))
        .rejects.toThrow('Dataview query execution failed');
    });

    it('should throw timeout error when query exceeds QUERY_TIMEOUT_MS', async () => {
      vi.useFakeTimers();
      const queryFn = vi.fn().mockImplementation(
        () => new Promise(() => { /* never resolves */ }),
      );
      const app = createDataviewAppWithQuery(queryFn);

      const promise = executeDataviewQuery(app, 'TABLE file.name');
      vi.advanceTimersByTime(QUERY_TIMEOUT_MS);

      // Timeout error is a plain Error (no statusCode) → wrapped as internal error
      await expect(promise).rejects.toThrow('Dataview query execution failed');
      vi.useRealTimers();
    });
  });
});
