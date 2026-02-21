import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTagsRouter } from '../../../src/routes/tags';
import { disposeTagCache } from '../../../src/services/tagCache';
import type { App, TFile, CachedMetadata } from 'obsidian';
import { createMockAppWithEventListeners, createRouterTestApp } from '../../helpers';

function createMockFile(path: string): TFile {
  const name = path.split('/').pop() || '';
  return {
    path,
    name,
    basename: name.replace(/\.[^/.]+$/, ''),
    extension: name.split('.').pop() || '',
  } as TFile;
}

function createTagsMockApp(options: {
  tags?: Record<string, number>;
  markdownFiles?: TFile[];
  fileCache?: Map<string, CachedMetadata>;
}): App {
  const { tags = {}, markdownFiles = [], fileCache = new Map() } = options;

  return createMockAppWithEventListeners({
    metadataCache: {
      getTags: vi.fn(() => tags),
      getFileCache: vi.fn((file: TFile) => fileCache.get(file.path) || null),
      resolvedLinks: {},
    },
    vault: {
      getMarkdownFiles: vi.fn(() => markdownFiles),
    },
  });
}

function createTestApp(mockApp: App) {
  return createRouterTestApp(createTagsRouter(mockApp), '/tags');
}

// Use fake timers + dispose singleton to avoid cache issues between tests
beforeEach(() => {
  vi.useFakeTimers();
  disposeTagCache();
});

afterEach(() => {
  disposeTagCache();
  vi.useRealTimers();
});

describe('Tags Router', () => {
  describe('GET /tags', () => {
    it('should return all tags sorted by count', async () => {
      const mockApp = createTagsMockApp({
        tags: {
          '#important': 10,
          '#todo': 5,
          '#archive': 3,
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(3);
      expect(res.body.tags[0]).toEqual({ tag: 'important', count: 10 });
      expect(res.body.tags[1]).toEqual({ tag: 'todo', count: 5 });
      expect(res.body.tags[2]).toEqual({ tag: 'archive', count: 3 });
    });

    it('should return empty array when no tags exist', async () => {
      const mockApp = createTagsMockApp({ tags: {} });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags');

      expect(res.status).toBe(200);
      expect(res.body.tags).toEqual([]);
    });

    it('should remove # prefix from tags', async () => {
      const mockApp = createTagsMockApp({
        tags: { '#mytag': 1 },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags');

      expect(res.status).toBe(200);
      expect(res.body.tags[0].tag).toBe('mytag');
    });
  });

  describe('GET /tags with filtering', () => {
    const testTags = {
      '#world-lore': 20,
      '#world-canon': 8,
      '#character': 15,
      '#npc-character': 5,
      '#project': 12,
      '#todo': 3,
      '#archive': 1,
    };

    it('should filter by prefix', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?prefix=world');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(2);
      expect(res.body.tags.every((t: { tag: string }) =>
        t.tag.startsWith('world')
      )).toBe(true);
    });

    it('should normalize prefix with # symbol', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?prefix=%23world');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(2);
      expect(res.body.tags.every((t: { tag: string }) =>
        t.tag.startsWith('world')
      )).toBe(true);
    });

    it('should filter by substring query (case-insensitive)', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?q=char');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(2);
      const tagNames = res.body.tags.map((t: { tag: string }) => t.tag);
      expect(tagNames).toContain('character');
      expect(tagNames).toContain('npc-character');
    });

    it('should limit results', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?limit=3');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(3);
    });

    it('should clamp limit to max 500', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?limit=999');

      expect(res.status).toBe(200);
      // All 7 tags returned since 500 > 7
      expect(res.body.tags).toHaveLength(7);
    });

    it('should clamp limit=0 to 1', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?limit=0');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(1);
    });

    it('should sort by name', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?sort=name');

      expect(res.status).toBe(200);
      const tagNames = res.body.tags.map((t: { tag: string }) => t.tag);
      const sorted = [...tagNames].sort((a: string, b: string) => a.localeCompare(b));
      expect(tagNames).toEqual(sorted);
    });

    it('should sort by count (default)', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?sort=count');

      expect(res.status).toBe(200);
      const counts = res.body.tags.map((t: { count: number }) => t.count);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });

    it('should combine prefix + limit + sort=name', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?prefix=world&limit=1&sort=name');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(1);
      // 'world-canon' comes before 'world-lore' alphabetically
      expect(res.body.tags[0].tag).toBe('world-canon');
    });

    it('should return all tags when no filter params given', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags');

      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(7);
    });

    it('should return empty when prefix matches nothing', async () => {
      const mockApp = createTagsMockApp({ tags: testTags });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags?prefix=nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.tags).toEqual([]);
    });
  });

  describe('GET /tags/:tag/files', () => {
    it('should return files with the specified tag', async () => {
      const file1 = createMockFile('notes/tagged1.md');
      const file2 = createMockFile('notes/tagged2.md');
      const file3 = createMockFile('notes/untagged.md');

      const fileCache = new Map<string, CachedMetadata>([
        [file1.path, { tags: [{ tag: '#important' }] }],
        [file2.path, { tags: [{ tag: '#important' }, { tag: '#other' }] }],
        [file3.path, { tags: [{ tag: '#other' }] }],
      ]);

      const mockApp = createTagsMockApp({
        markdownFiles: [file1, file2, file3],
        fileCache,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags/important/files');

      expect(res.status).toBe(200);
      expect(res.body.tag).toBe('important');
      expect(res.body.count).toBe(2);
      expect(res.body.files).toContainEqual({ path: file1.path, name: file1.basename });
      expect(res.body.files).toContainEqual({ path: file2.path, name: file2.basename });
    });

    it('should match frontmatter tags', async () => {
      const file = createMockFile('notes/fm-tagged.md');

      const fileCache = new Map<string, CachedMetadata>([
        [file.path, { frontmatter: { tags: ['project'] } }],
      ]);

      const mockApp = createTagsMockApp({
        markdownFiles: [file],
        fileCache,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags/project/files');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.files[0].path).toBe(file.path);
    });

    it('should match nested tags', async () => {
      const file = createMockFile('notes/nested.md');

      const fileCache = new Map<string, CachedMetadata>([
        [file.path, { tags: [{ tag: '#parent/child' }] }],
      ]);

      const mockApp = createTagsMockApp({
        markdownFiles: [file],
        fileCache,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags/parent/files');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });

    it('should return empty files when no match', async () => {
      const mockApp = createTagsMockApp({
        markdownFiles: [createMockFile('notes/test.md')],
        fileCache: new Map(),
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/tags/nonexistent/files');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.files).toEqual([]);
    });

    it('should handle tag with # prefix in URL', async () => {
      const file = createMockFile('notes/test.md');

      const fileCache = new Map<string, CachedMetadata>([
        [file.path, { tags: [{ tag: '#mytag' }] }],
      ]);

      const mockApp = createTagsMockApp({
        markdownFiles: [file],
        fileCache,
      });
      const app = createTestApp(mockApp);

      // URL encoding for #
      const res = await request(app).get('/tags/%23mytag/files');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });
  });
});
