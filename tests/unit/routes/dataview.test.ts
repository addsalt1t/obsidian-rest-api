import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { App } from 'obsidian';

vi.mock('../../../src/utils/logger', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { createDataviewRouter } from '../../../src/routes/dataview';
import { createMockApp, createRouterTestApp } from '../../helpers';
import { DATAVIEW_MAX_RESULTS } from '../../../src/constants';

function createDataviewMockApp(queryResult: unknown): App {
  const app = createMockApp();
  // Dataview plugin is accessed via app.plugins.plugins.dataview (unofficial API)
  (app as Record<string, unknown>).plugins = {
    plugins: {
      dataview: {
        api: {
          query: vi.fn().mockResolvedValue(queryResult),
        },
      },
    },
  };
  return app;
}

function createTestApp(queryResult: unknown) {
  const app = createDataviewMockApp(queryResult);
  return createRouterTestApp(createDataviewRouter(app), '/dataview');
}

describe('Dataview Router', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('result truncation', () => {
    it('should return results as-is when count is within limit', async () => {
      const values = Array.from({ length: 10 }, (_, i) => [`item-${i}`]);
      const testApp = createTestApp({
        successful: true,
        value: { type: 'list', values },
      });

      const res = await request(testApp)
        .post('/dataview/query')
        .send({ query: 'LIST FROM "/"' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(10);
      expect(res.body.truncated).toBeUndefined();
      expect(res.body.totalCount).toBeUndefined();
      expect(res.body.limit).toBeUndefined();
    });

    it('should return results as-is when count equals limit', async () => {
      const values = Array.from({ length: DATAVIEW_MAX_RESULTS }, (_, i) => [`item-${i}`]);
      const testApp = createTestApp({
        successful: true,
        value: { type: 'list', values },
      });

      const res = await request(testApp)
        .post('/dataview/query')
        .send({ query: 'LIST FROM "/"' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(DATAVIEW_MAX_RESULTS);
      expect(res.body.truncated).toBeUndefined();
      expect(res.body.totalCount).toBeUndefined();
      expect(res.body.limit).toBeUndefined();
    });

    it('should truncate results exceeding limit with metadata', async () => {
      const totalCount = DATAVIEW_MAX_RESULTS + 500;
      const values = Array.from({ length: totalCount }, (_, i) => [`item-${i}`]);
      const testApp = createTestApp({
        successful: true,
        value: { type: 'list', values },
      });

      const res = await request(testApp)
        .post('/dataview/query')
        .send({ query: 'LIST FROM "/"' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(DATAVIEW_MAX_RESULTS);
      expect(res.body.truncated).toBe(true);
      expect(res.body.totalCount).toBe(totalCount);
      expect(res.body.limit).toBe(DATAVIEW_MAX_RESULTS);
    });

    it('should preserve headers for TABLE queries when truncating', async () => {
      const totalCount = DATAVIEW_MAX_RESULTS + 100;
      const values = Array.from({ length: totalCount }, (_, i) => [`row-${i}`, i]);
      const headers = ['Name', 'Value'];
      const testApp = createTestApp({
        successful: true,
        value: { type: 'table', values, headers },
      });

      const res = await request(testApp)
        .post('/dataview/table')
        .send({ query: 'TABLE Name, Value FROM "/"' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(DATAVIEW_MAX_RESULTS);
      expect(res.body.headers).toEqual(headers);
      expect(res.body.truncated).toBe(true);
      expect(res.body.totalCount).toBe(totalCount);
    });

    it('should handle empty values array', async () => {
      const testApp = createTestApp({
        successful: true,
        value: { type: 'list', values: [] },
      });

      const res = await request(testApp)
        .post('/dataview/query')
        .send({ query: 'LIST FROM "/"' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
      expect(res.body.truncated).toBeUndefined();
    });

    it('should handle undefined values gracefully', async () => {
      const testApp = createTestApp({
        successful: true,
        value: { type: 'list' },
      });

      const res = await request(testApp)
        .post('/dataview/query')
        .send({ query: 'LIST FROM "/"' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
      expect(res.body.truncated).toBeUndefined();
    });
  });

  describe('Dataview plugin not available', () => {
    it('should return 400 when Dataview plugin is not installed', async () => {
      const app = createMockApp();
      const testApp = createRouterTestApp(createDataviewRouter(app), '/dataview');

      const res = await request(testApp)
        .post('/dataview/query')
        .send({ query: 'LIST FROM "/"' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PLUGIN_NOT_ENABLED');
      expect(res.body.message).toContain('Dataview');
    });
  });

  describe('query validation', () => {
    it('should return 400 for missing query body', async () => {
      const testApp = createTestApp({ successful: true, value: { type: 'list', values: [] } });

      const res = await request(testApp)
        .post('/dataview/query')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 for wrong query type on typed endpoint', async () => {
      const testApp = createTestApp({ successful: true, value: { type: 'list', values: [] } });

      const res = await request(testApp)
        .post('/dataview/table')
        .send({ query: 'LIST FROM "/"' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toContain('TABLE');
    });

    it('should return 400 when query execution fails', async () => {
      const testApp = createTestApp({
        successful: false,
        error: 'Syntax error in query',
      });

      const res = await request(testApp)
        .post('/dataview/query')
        .send({ query: 'INVALID QUERY' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('failed');
    });
  });
});
