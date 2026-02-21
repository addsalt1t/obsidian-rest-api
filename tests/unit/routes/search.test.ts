import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../../src/services/fileListCache', () => ({
  getFileListCache: vi.fn(),
}));

vi.mock('json-logic-js', () => ({
  add_operation: vi.fn(),
  apply: vi.fn(),
  is_logic: vi.fn(() => true),
}));

const { mockSafeRegex } = vi.hoisted(() => ({
  mockSafeRegex: vi.fn(() => true),
}));
vi.mock('safe-regex', () => ({
  default: mockSafeRegex,
}));

vi.mock('../../../src/utils/logger', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import express from 'express';
import * as jsonLogicJs from 'json-logic-js';
import { getFileListCache } from '../../../src/services/fileListCache';
import { createSearchRouter, clearGlobCache } from '../../../src/routes/search';
import { createMockApp, createMockTFile, createRouterTestApp } from '../../helpers';
import { errorHandler } from '../../../src/middleware/error';
import { DATAVIEW_MAX_RESULTS, MAX_JSONLOGIC_DEPTH, MIME_TYPE } from '../../../src/constants';

describe('Search Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGlobCache();
    mockSafeRegex.mockReturnValue(true);
  });

  it('should include 1-based line number in /search/simple results', async () => {
    const file = createMockTFile({ path: 'docs/note.md' });
    const app = createMockApp({
      vault: {
        cachedRead: vi.fn().mockResolvedValue('alpha\nbeta hello\ngamma'),
      },
    });

    vi.mocked(getFileListCache).mockReturnValue({
      getMarkdownFiles: vi.fn().mockReturnValue([file]),
    } as never);

    const testApp = createRouterTestApp(createSearchRouter(app), '/search');
    const res = await request(testApp).post('/search/simple/?query=hello').send({});

    expect(res.status).toBe(200);
    expect(res.body.results[0].matches[0].line).toBe(2);
  });

  it('should return correct line numbers with Unicode case-folding characters', async () => {
    // İ (Turkish capital I with dot) lowercases to 'i̇' (2 chars), causing offset drift
    const file = createMockTFile({ path: 'unicode.md' });
    const app = createMockApp({
      vault: {
        cachedRead: vi.fn().mockResolvedValue('İİİİtarget\nsecond line'),
      },
    });

    vi.mocked(getFileListCache).mockReturnValue({
      getMarkdownFiles: vi.fn().mockReturnValue([file]),
    } as never);

    const testApp = createRouterTestApp(createSearchRouter(app), '/search');
    const res = await request(testApp).post('/search/simple/?query=target').send({});

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].matches[0].line).toBe(1);
  });

  it('should perform case-insensitive search', async () => {
    const file = createMockTFile({ path: 'test.md' });
    const app = createMockApp({
      vault: {
        cachedRead: vi.fn().mockResolvedValue('Hello World\nHELLO again'),
      },
    });

    vi.mocked(getFileListCache).mockReturnValue({
      getMarkdownFiles: vi.fn().mockReturnValue([file]),
    } as never);

    const testApp = createRouterTestApp(createSearchRouter(app), '/search');
    const res = await request(testApp).post('/search/simple/?query=hello').send({});

    expect(res.status).toBe(200);
    expect(res.body.results[0].matches).toHaveLength(2);
    expect(res.body.results[0].matches[0].line).toBe(1);
    expect(res.body.results[0].matches[1].line).toBe(2);
  });

  it('should not treat query as regex pattern', async () => {
    const file = createMockTFile({ path: 'test.md' });
    const app = createMockApp({
      vault: {
        cachedRead: vi.fn().mockResolvedValue('price is $100 (USD)'),
      },
    });

    vi.mocked(getFileListCache).mockReturnValue({
      getMarkdownFiles: vi.fn().mockReturnValue([file]),
    } as never);

    const testApp = createRouterTestApp(createSearchRouter(app), '/search');
    const res = await request(testApp).post('/search/simple/?query=$100 (USD)').send({});

    expect(res.status).toBe(200);
    expect(res.body.results[0].matches).toHaveLength(1);
  });

  it('should apply basePath scope consistently for notes and notes/', async () => {
    const noteFile = createMockTFile({ path: 'notes/inside.md' });
    const outsideFile = createMockTFile({ path: 'archive/outside.md' });
    const app = createMockApp({
      vault: {
        cachedRead: vi.fn(async (file: { path: string }) => {
          if (file.path === 'notes/inside.md') {
            return 'scope-match';
          }
          return 'scope-match';
        }),
      },
    });

    vi.mocked(getFileListCache).mockReturnValue({
      getMarkdownFiles: vi.fn().mockReturnValue([noteFile, outsideFile]),
    } as never);

    const testApp = createRouterTestApp(createSearchRouter(app), '/search');

    const noSlash = await request(testApp).post('/search/simple/?query=scope-match&basePath=notes').send({});
    const withSlash = await request(testApp).post('/search/simple/?query=scope-match&basePath=notes/').send({});

    expect(noSlash.status).toBe(200);
    expect(withSlash.status).toBe(200);

    expect(noSlash.body.results).toHaveLength(1);
    expect(noSlash.body.results[0].path).toBe('notes/inside.md');
    expect(withSlash.body.results).toHaveLength(1);
    expect(withSlash.body.results[0].path).toBe('notes/inside.md');
  });

  describe('glob pattern safety', () => {
    function createGlobTestApp(files: ReturnType<typeof createMockTFile>[]) {
      const mockApp = createMockApp();
      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue(files),
      } as never);
      return createRouterTestApp(createSearchRouter(mockApp), '/search');
    }

    it('should reject unsafe glob patterns detected by safe-regex', async () => {
      const file = createMockTFile({ path: 'notes/test.md' });
      const testApp = createGlobTestApp([file]);

      // Make safe-regex return false for this specific call
      mockSafeRegex.mockReturnValueOnce(false);

      const res = await request(testApp)
        .post('/search/glob/')
        .query({ pattern: '**/**/**/**/**/**/**/**/**/**/a' });

      expect(res.status).toBe(200);
      // File should NOT match because the pattern was rejected as unsafe
      expect(res.body.results).toHaveLength(0);
    });

    it('should allow safe glob patterns', async () => {
      const file = createMockTFile({ path: 'notes/test.md' });
      const testApp = createGlobTestApp([file]);

      // safe-regex returns true (default mock behavior)
      const res = await request(testApp)
        .post('/search/glob/')
        .query({ pattern: 'notes/*.md' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].path).toBe('notes/test.md');
    });

    it('should return empty results for all files when pattern is unsafe', async () => {
      const files = [
        createMockTFile({ path: 'a.md' }),
        createMockTFile({ path: 'b.md' }),
        createMockTFile({ path: 'c.md' }),
      ];
      const testApp = createGlobTestApp(files);

      // safeRegex is only called once per unique pattern (rejection is cached)
      mockSafeRegex.mockReturnValueOnce(false);

      const res = await request(testApp)
        .post('/search/glob/')
        .query({ pattern: 'unsafe-pattern-*.md' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('should validate glob pattern via safe-regex before caching', async () => {
      const file = createMockTFile({ path: 'test.md' });
      const testApp = createGlobTestApp([file]);

      mockSafeRegex.mockClear();

      await request(testApp)
        .post('/search/glob/')
        .query({ pattern: '**/*.md' });

      // safe-regex should have been called with the compiled regex pattern
      expect(mockSafeRegex).toHaveBeenCalledWith(expect.stringContaining('^'));
      expect(mockSafeRegex).toHaveBeenCalledWith(expect.stringContaining('$'));
    });
  });

  describe('Dataview DQL result truncation', () => {
    function createDqlTestApp(queryResult: unknown) {
      const mockApp = createMockApp();
      // Dataview plugin is accessed via app.plugins.plugins.dataview (unofficial API)
      (mockApp as Record<string, unknown>).plugins = {
        plugins: {
          dataview: {
            api: {
              query: vi.fn().mockResolvedValue(queryResult),
            },
          },
        },
      };

      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue([]),
      } as never);

      // Custom Express app with DQL MIME type registered for text parser
      // (createRouterTestApp only handles text/*, but DQL uses application/vnd.*)
      const app = express();
      app.use(express.json());
      app.use(express.text({ type: [MIME_TYPE.DATAVIEW_DQL, 'text/*'] }));
      app.use('/search', createSearchRouter(mockApp));
      app.use(errorHandler);
      return app;
    }

    it('should return DQL results as-is when within limit', async () => {
      const values = Array.from({ length: 10 }, (_, i) => [`item-${i}`]);
      const testApp = createDqlTestApp({
        successful: true,
        value: { type: 'list', values },
      });

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.DATAVIEW_DQL)
        .send('LIST FROM "/"');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(10);
      expect(res.body.truncated).toBeUndefined();
      expect(res.body.totalCount).toBeUndefined();
    });

    it('should truncate DQL results exceeding limit with metadata', async () => {
      const totalCount = DATAVIEW_MAX_RESULTS + 200;
      const values = Array.from({ length: totalCount }, (_, i) => [`item-${i}`]);
      const testApp = createDqlTestApp({
        successful: true,
        value: { type: 'list', values },
      });

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.DATAVIEW_DQL)
        .send('LIST FROM "/"');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(DATAVIEW_MAX_RESULTS);
      expect(res.body.truncated).toBe(true);
      expect(res.body.totalCount).toBe(totalCount);
      expect(res.body.limit).toBe(DATAVIEW_MAX_RESULTS);
    });

    it('should not add truncation metadata when count equals limit', async () => {
      const values = Array.from({ length: DATAVIEW_MAX_RESULTS }, (_, i) => [`item-${i}`]);
      const testApp = createDqlTestApp({
        successful: true,
        value: { type: 'list', values },
      });

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.DATAVIEW_DQL)
        .send('LIST FROM "/"');

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(DATAVIEW_MAX_RESULTS);
      expect(res.body.truncated).toBeUndefined();
    });
  });

  describe('JsonLogic validation', () => {
    function createJsonLogicTestApp() {
      const mockApp = createMockApp();
      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue([]),
      } as never);
      return createRouterTestApp(createSearchRouter(mockApp), '/search');
    }

    it('should return 400 INVALID_QUERY for non-JsonLogic input', async () => {
      vi.mocked(jsonLogicJs.is_logic).mockReturnValueOnce(false);
      const testApp = createJsonLogicTestApp();

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.JSONLOGIC)
        .send(JSON.stringify('just a string'));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toBe('Not a valid JsonLogic expression');
    });

    it('should return 400 INVALID_QUERY for malformed JSON string body', async () => {
      // When body is received as a string (not parsed by express.json()),
      // our handler's try-catch on JSON.parse should trigger INVALID_QUERY.
      // Use a custom app with text parser for JSONLOGIC content type to bypass express.json().
      const mockApp = createMockApp();
      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue([]),
      } as never);
      const app = express();
      app.use(express.text({ type: [MIME_TYPE.JSONLOGIC, 'text/*'] }));
      app.use('/search', createSearchRouter(mockApp));
      app.use(errorHandler);

      const res = await request(app)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.JSONLOGIC)
        .send('not valid json {{{');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toBe('Invalid JSON body');
    });

    it('should return 400 INVALID_QUERY for empty object', async () => {
      vi.mocked(jsonLogicJs.is_logic).mockReturnValueOnce(false);
      const testApp = createJsonLogicTestApp();

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.JSONLOGIC)
        .send(JSON.stringify({}));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toBe('Not a valid JsonLogic expression');
    });

    it('should return 400 INVALID_QUERY when preflight apply throws', async () => {
      vi.mocked(jsonLogicJs.is_logic).mockReturnValueOnce(true);
      vi.mocked(jsonLogicJs.apply).mockImplementationOnce(() => {
        throw new Error('Unrecognized operation');
      });
      const testApp = createJsonLogicTestApp();

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.JSONLOGIC)
        .send(JSON.stringify({ badOp: [1, 2] }));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toBe('JsonLogic structural error in query');
      expect(res.body.details).toEqual({ reason: 'Unrecognized operation' });
    });

    it('should return 400 INVALID_QUERY when all files fail evaluation', async () => {
      const mockFile = { path: 'test.md', extension: 'md', stat: { mtime: 0, ctime: 0, size: 100 }, basename: 'test', name: 'test' };
      vi.mocked(jsonLogicJs.is_logic).mockReturnValueOnce(true);
      // preflight succeeds (short-circuits)
      vi.mocked(jsonLogicJs.apply).mockReturnValueOnce(false);
      // per-file evaluation throws
      vi.mocked(jsonLogicJs.apply).mockImplementation(() => {
        throw new Error('Unrecognized operation badOp');
      });

      const mockApp = createMockApp();
      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue([mockFile]),
      } as never);
      // @ts-expect-error - mock metadataCache
      mockApp.metadataCache = { getFileCache: vi.fn().mockReturnValue(null) };
      const testApp = createRouterTestApp(createSearchRouter(mockApp), '/search');

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.JSONLOGIC)
        .send(JSON.stringify({ and: [{ '>': [{ var: 'size' }, 0] }, { badOp: [1] }] }));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toBe('JsonLogic query failed on all files');
      expect(res.body.details).toEqual({ reason: 'Unrecognized operation badOp' });
    });

    it('should process valid JsonLogic queries normally', async () => {
      vi.mocked(jsonLogicJs.is_logic).mockReturnValueOnce(true);
      vi.mocked(jsonLogicJs.apply).mockReturnValue(false); // preflight returns falsy, that's ok
      const testApp = createJsonLogicTestApp();

      const res = await request(testApp)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.JSONLOGIC)
        .send(JSON.stringify({ in: ['project', { var: 'tags' }] }));

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });

    it('should return 400 INVALID_QUERY when query exceeds max depth', async () => {
      const mockApp = createMockApp();
      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue([]),
      } as never);
      // Custom app with JSONLOGIC MIME type registered for JSON parser
      const app = express();
      app.use(express.json({ type: [MIME_TYPE.JSONLOGIC, MIME_TYPE.JSON] }));
      app.use('/search', createSearchRouter(mockApp));
      app.use(errorHandler);

      // Build a deeply nested JsonLogic query exceeding MAX_JSONLOGIC_DEPTH
      let deepQuery: unknown = { var: 'tags' };
      for (let i = 0; i < MAX_JSONLOGIC_DEPTH + 1; i++) {
        deepQuery = { '!': [deepQuery] };
      }

      const res = await request(app)
        .post('/search/')
        .set('Content-Type', MIME_TYPE.JSONLOGIC)
        .send(JSON.stringify(deepQuery));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toContain('too deeply nested');
      expect(res.body.message).toContain(String(MAX_JSONLOGIC_DEPTH));
    });
  });

  describe('basePath path traversal validation', () => {
    it('should return 400 when basePath contains path traversal in query param', async () => {
      const mockApp = createMockApp();
      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue([]),
      } as never);
      const testApp = createRouterTestApp(createSearchRouter(mockApp), '/search');

      const res = await request(testApp)
        .post('/search/simple/?query=test&basePath=../../secrets')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
    });

    it('should return 400 when basePath contains path traversal in body', async () => {
      const mockApp = createMockApp();
      vi.mocked(getFileListCache).mockReturnValue({
        getMarkdownFiles: vi.fn().mockReturnValue([]),
      } as never);
      const testApp = createRouterTestApp(createSearchRouter(mockApp), '/search');

      const res = await request(testApp)
        .post('/search/simple/?query=test')
        .send({ basePath: '../outside' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
    });
  });
});
