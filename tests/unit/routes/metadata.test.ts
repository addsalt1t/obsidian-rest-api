import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createMetadataRouter } from '../../../src/routes/metadata';
import { disposeBacklinkCache } from '../../../src/services/backlinkCache';
import type { App, CachedMetadata, LinkCache, Events } from 'obsidian';
import { TFile } from 'obsidian';
import { createMockAppWithFiles, createRouterTestApp } from '../../helpers';
import type { FileMockEntry } from '../../helpers';

// waitForMetadataReady를 mock
vi.mock('../../../src/utils/metadata-ready', () => ({
  waitForMetadataReady: vi.fn().mockResolvedValue(true),
}));

function createMockFile(
  path: string,
  options?: { size?: number; ctime?: number; mtime?: number }
): TFile {
  return new TFile(path, options) as unknown as TFile;
}

/** Build mock app from file entries with event listener stubs needed by backlinkCache singleton */
function buildMetadataMockApp(options: {
  files?: Array<{ file: TFile; content?: string; metadata?: CachedMetadata | null }>;
  resolvedLinks?: Record<string, Record<string, number>>;
}): App {
  const { files = [], resolvedLinks = {} } = options;
  const entries: FileMockEntry[] = files.map((f) => ({
    file: f.file,
    content: f.content,
    metadata: f.metadata !== null ? f.metadata : undefined,
  }));
  return createMockAppWithFiles(entries, {
    vault: {
      on: vi.fn(() => ({ event: '', callback: () => {} }) as ReturnType<Events['on']>),
      offref: vi.fn(),
    },
    metadataCache: {
      resolvedLinks,
      on: vi.fn(() => ({ event: '', callback: () => {} }) as ReturnType<Events['on']>),
      offref: vi.fn(),
    },
  });
}

function createTestApp(mockApp: App) {
  return createRouterTestApp(createMetadataRouter(mockApp), '/metadata');
}

describe('Metadata Router', () => {
  beforeEach(() => {
    disposeBacklinkCache();
  });

  afterEach(() => {
    disposeBacklinkCache();
  });

  describe('GET /metadata/{path} - 통합 메타데이터 조회', () => {
    it('should return metadata when cache is available', async () => {
      const file = createMockFile('note.md', { size: 200, ctime: 1000, mtime: 2000 });
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          metadata: {
            frontmatter: { title: 'Test', tags: ['a', 'b'], position: { start: 0, end: 10 } },
            tags: [{ tag: '#inline' }],
            links: [{ link: 'other.md', displayText: 'Other' }] as LinkCache[],
          } as CachedMetadata,
        }],
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/note.md');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('note.md');
      expect(res.body.frontmatter.title).toBe('Test');
      expect(res.body.frontmatter.position).toBeUndefined();
      expect(res.body.frontmatter.tags).toEqual(['a', 'b']);
      expect(res.body.tags).toContain('#inline');
      expect(res.body.links).toHaveLength(1);
      expect(res.body.stat).toEqual({ size: 200, ctime: 1000, mtime: 2000 });
    });

    it('should fallback to markdown parsing when cache is null', async () => {
      const file = createMockFile('note.md');
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          content: '---\ntitle: Parsed Title\ntags:\n  - parsed-tag\n---\n\nBody content',
          metadata: null,
        }],
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/note.md');

      expect(res.status).toBe(200);
      expect(res.body.frontmatter.title).toBe('Parsed Title');
      expect(res.body.tags).toContain('#parsed-tag');
    });

    it('should strip # prefix from frontmatter.tags in fallback', async () => {
      const file = createMockFile('note.md');
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          content: '---\ntags:\n  - "#hashed"\n  - normal\n---\n\nContent',
          metadata: null,
        }],
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/note.md');

      expect(res.status).toBe(200);
      // frontmatter.tags는 # 없이 반환
      if (Array.isArray(res.body.frontmatter.tags)) {
        for (const tag of res.body.frontmatter.tags) {
          expect(tag).not.toMatch(/^#/);
        }
      }
    });

    it('should not call vault.read when cache is complete', async () => {
      const file = createMockFile('note.md');
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          metadata: {
            frontmatter: { title: 'Cached', position: { start: 0, end: 10 } },
            tags: [{ tag: '#cached' }],
          } as CachedMetadata,
        }],
      });
      const app = createTestApp(mockApp);

      await request(app).get('/metadata/note.md');

      expect(mockApp.vault.read).not.toHaveBeenCalled();
    });

    it('should call vault.read when cache is null', async () => {
      const file = createMockFile('note.md');
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          content: '---\ntitle: X\n---\n\nBody',
          metadata: null,
        }],
      });
      const app = createTestApp(mockApp);

      await request(app).get('/metadata/note.md');

      expect(mockApp.vault.read).toHaveBeenCalled();
    });

    it('should strip # from frontmatter.tags in cached data', async () => {
      const file = createMockFile('note.md');
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          metadata: {
            frontmatter: { tags: ['#hashed', '#another'], position: { start: 0, end: 10 } },
          } as unknown as CachedMetadata,
        }],
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/note.md');

      expect(res.status).toBe(200);
      expect(res.body.frontmatter.tags).toEqual(['hashed', 'another']);
    });

    it('should return backlinks from resolvedLinks', async () => {
      const file = createMockFile('target.md');
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          metadata: {
            frontmatter: { title: 'Target', position: { start: 0, end: 10 } },
          } as CachedMetadata,
        }],
        resolvedLinks: {
          'source.md': { 'target.md': 1 },
          'other.md': { 'unrelated.md': 1 },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/target.md');

      expect(res.status).toBe(200);
      expect(res.body.backlinks).toContain('source.md');
      expect(res.body.backlinks).not.toContain('other.md');
    });

    it('should return 400 when path is missing', async () => {
      const mockApp = buildMetadataMockApp({ files: [] });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
      expect(res.body.message).toBe('Path is required');
    });

    it('should return 404 for non-existent file', async () => {
      const mockApp = buildMetadataMockApp({ files: [] });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/nonexistent.md');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('File not found');
    });

    it('should return 400 for path traversal attempt', async () => {
      const mockApp = buildMetadataMockApp({ files: [] });
      const app = createTestApp(mockApp);

      // URL-encoded path traversal: %2F = /
      const res = await request(app).get('/metadata/..%2F..%2Fetc%2Fpasswd');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
    });

    it('should auto-add .md extension', async () => {
      const file = createMockFile('note.md');
      const mockApp = buildMetadataMockApp({
        files: [{
          file,
          metadata: {
            frontmatter: { title: 'Test', position: { start: 0, end: 10 } },
            tags: [{ tag: '#tag' }],
          } as CachedMetadata,
        }],
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/metadata/note');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('note.md');
    });
  });
});
