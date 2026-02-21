import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createGraphRouter } from '../../../src/routes/graph';
import { disposeBacklinkCache } from '../../../src/services/backlinkCache';
import type { App, TFile } from 'obsidian';
import { createMockAppWithEventListeners, createRouterTestApp } from '../../helpers';

function createGraphMockApp(options: {
  resolvedLinks?: Record<string, Record<string, number>>;
  markdownFiles?: Array<{ path: string }>;
  fileExists?: boolean;
}): App {
  const { resolvedLinks = {}, markdownFiles = [], fileExists = true } = options;

  return createMockAppWithEventListeners({
    metadataCache: {
      resolvedLinks,
    },
    vault: {
      getAbstractFileByPath: vi.fn((path: string) =>
        fileExists ? ({ path } as TFile) : null
      ),
      getMarkdownFiles: vi.fn(() => markdownFiles as TFile[]),
    },
  });
}

function createTestApp(mockApp: App) {
  return createRouterTestApp(createGraphRouter(mockApp), '/graph');
}

describe('Graph Router', () => {
  beforeEach(() => {
    disposeBacklinkCache();
  });

  afterEach(() => {
    disposeBacklinkCache();
  });

  describe('GET /graph/links/:path', () => {
    it('should return outbound links for a file', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {
          'notes/test.md': {
            'notes/linked1.md': 1,
            'notes/linked2.md': 2,
          },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/links/notes/test');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        path: 'notes/test.md',
        links: ['notes/linked1.md', 'notes/linked2.md'],
        count: 2,
      });
    });

    it('should auto-append .md extension', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {
          'test.md': { 'other.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/links/test');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('test.md');
    });

    it('should return 400 when path is empty', async () => {
      const mockApp = createGraphMockApp({});
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/links/');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Path is required');
    });

    it('should return 404 when file not found', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {},
        fileExists: false,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/links/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('File not found');
    });

    it('should return 400 for path traversal attempt', async () => {
      const mockApp = createGraphMockApp({});
      const app = createTestApp(mockApp);

      // URL-encoded path traversal: %2F = /
      const res = await request(app).get('/graph/links/..%2F..%2Fetc%2Fpasswd');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
    });

    it('should return empty links for file with no outlinks', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {},
        fileExists: true,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/links/isolated');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        path: 'isolated.md',
        links: [],
        count: 0,
      });
    });
  });

  describe('GET /graph/backlinks/:path', () => {
    it('should return backlinks for a file', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {
          'notes/a.md': { 'notes/target.md': 1 },
          'notes/b.md': { 'notes/target.md': 2, 'other.md': 1 },
          'notes/c.md': { 'other.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/backlinks/notes/target');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('notes/target.md');
      expect(res.body.backlinks).toContain('notes/a.md');
      expect(res.body.backlinks).toContain('notes/b.md');
      expect(res.body.count).toBe(2);
    });

    it('should return 404 when target file not found', async () => {
      const mockApp = createGraphMockApp({
        fileExists: false,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/backlinks/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('File not found');
    });

    it('should return 400 for path traversal attempt', async () => {
      const mockApp = createGraphMockApp({ fileExists: false });
      const app = createTestApp(mockApp);

      // URL-encoded path traversal: %2F = /
      const res = await request(app).get('/graph/backlinks/..%2F..%2Fetc%2Fpasswd');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
    });

    it('should return empty backlinks for file with no inlinks', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {
          'other.md': { 'different.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/backlinks/isolated');

      expect(res.status).toBe(200);
      expect(res.body.backlinks).toEqual([]);
      expect(res.body.count).toBe(0);
    });
  });

  describe('GET /graph/orphans', () => {
    it('should return orphan notes with no links', async () => {
      const mockApp = createGraphMockApp({
        markdownFiles: [
          { path: 'connected.md' },
          { path: 'orphan1.md' },
          { path: 'orphan2.md' },
        ],
        resolvedLinks: {
          'connected.md': { 'some-target.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/orphans');

      expect(res.status).toBe(200);
      expect(res.body.orphans).toContain('orphan1.md');
      expect(res.body.orphans).toContain('orphan2.md');
      expect(res.body.orphans).not.toContain('connected.md');
      expect(res.body.count).toBe(2);
    });

    it('should not include files that are linked to', async () => {
      const mockApp = createGraphMockApp({
        markdownFiles: [
          { path: 'source.md' },
          { path: 'target.md' },
        ],
        resolvedLinks: {
          'source.md': { 'target.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/orphans');

      expect(res.status).toBe(200);
      // source.md has outlinks, target.md has inlinks - neither is orphan
      expect(res.body.orphans).not.toContain('source.md');
      expect(res.body.orphans).not.toContain('target.md');
    });

    it('should return empty array when no orphans exist', async () => {
      const mockApp = createGraphMockApp({
        markdownFiles: [{ path: 'linked.md' }],
        resolvedLinks: {
          'linked.md': { 'other.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/orphans');

      expect(res.status).toBe(200);
      expect(res.body.orphans).toEqual([]);
    });
  });

  describe('GET /graph/hubs', () => {
    it('should return most linked files sorted by inlink count', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {
          'a.md': { 'hub1.md': 1, 'hub2.md': 1 },
          'b.md': { 'hub1.md': 1, 'hub2.md': 1 },
          'c.md': { 'hub1.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/hubs');

      expect(res.status).toBe(200);
      expect(res.body.hubs[0]).toEqual({ path: 'hub1.md', inlinkCount: 3 });
      expect(res.body.hubs[1]).toEqual({ path: 'hub2.md', inlinkCount: 2 });
    });

    it('should respect limit parameter', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {
          'a.md': { 'hub1.md': 1, 'hub2.md': 1, 'hub3.md': 1 },
          'b.md': { 'hub1.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/hubs?limit=2');

      expect(res.status).toBe(200);
      expect(res.body.hubs).toHaveLength(2);
    });

    it('should default to 10 hubs when no limit specified', async () => {
      // Create many hubs
      const resolvedLinks: Record<string, Record<string, number>> = {};
      for (let i = 0; i < 15; i++) {
        resolvedLinks[`source${i}.md`] = { [`hub${i % 12}.md`]: 1 };
      }
      const mockApp = createGraphMockApp({ resolvedLinks });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/hubs');

      expect(res.status).toBe(200);
      expect(res.body.hubs.length).toBeLessThanOrEqual(10);
    });

    it('should return empty hubs when no links exist', async () => {
      const mockApp = createGraphMockApp({
        resolvedLinks: {},
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/graph/hubs');

      expect(res.status).toBe(200);
      expect(res.body.hubs).toEqual([]);
    });
  });
});
