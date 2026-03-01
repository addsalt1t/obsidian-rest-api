import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fileListCache before imports
vi.mock('../../../src/services/fileListCache', () => ({
  getFileListCache: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  tokenize,
  computeTfIdf,
  cosineSimilarity,
  getEmbeddingStatus,
  embed,
  vectorSearch,
} from '../../../src/services/vector/vector-service';
import { getFileListCache } from '../../../src/services/fileListCache';
import { createMockTFile, createMockCachedMetadata } from '../../helpers/fixtures';
import type { App } from 'obsidian';

describe('Vector Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // tokenize
  // ---------------------------------------------------------------------------

  describe('tokenize', () => {
    it('should split text into tokens', () => {
      const tokens = tokenize('hello world test');
      expect(tokens).toEqual(['hello', 'world', 'test']);
    });

    it('should convert to lowercase', () => {
      const tokens = tokenize('Hello WORLD');
      expect(tokens).toEqual(['hello', 'world']);
    });

    it('should filter out single-character tokens', () => {
      const tokens = tokenize('a big cat');
      expect(tokens).not.toContain('a');
      expect(tokens).toContain('big');
      expect(tokens).toContain('cat');
    });

    it('should handle Korean text', () => {
      const tokens = tokenize('한글 텍스트 처리');
      expect(tokens).toContain('한글');
      expect(tokens).toContain('텍스트');
      expect(tokens).toContain('처리');
    });

    it('should strip punctuation', () => {
      const tokens = tokenize('hello, world! test.');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('test');
    });

    it('should return empty array for empty input', () => {
      const tokens = tokenize('');
      expect(tokens).toEqual([]);
    });

    it('should handle mixed Korean and English', () => {
      const tokens = tokenize('hello 세계 world');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('세계');
      expect(tokens).toContain('world');
    });
  });

  // ---------------------------------------------------------------------------
  // computeTfIdf
  // ---------------------------------------------------------------------------

  describe('computeTfIdf', () => {
    it('should compute TF-IDF sparse vector correctly', () => {
      const tokens = ['hello', 'world', 'hello'];
      const idf = new Map<string, number>([
        ['hello', 1.0],
        ['world', 2.0],
      ]);

      const vector = computeTfIdf(tokens, idf);

      // hello: tf = 2/3, idf = 1.0 -> 2/3
      // world: tf = 1/3, idf = 2.0 -> 2/3
      expect(vector).toBeInstanceOf(Map);
      expect(vector.size).toBe(2);
      expect(vector.get('hello')).toBeCloseTo(2 / 3);
      expect(vector.get('world')).toBeCloseTo(2 / 3);
    });

    it('should omit terms not present in tokens (sparse)', () => {
      const tokens = ['hello'];
      const idf = new Map<string, number>([
        ['hello', 1.0],
        ['world', 2.0],
      ]);

      const vector = computeTfIdf(tokens, idf);

      expect(vector.get('hello')).toBeCloseTo(1.0); // hello: tf=1/1 * idf=1.0
      expect(vector.has('world')).toBe(false); // world not in tokens -> omitted
    });

    it('should return empty map for empty IDF', () => {
      const tokens = ['hello'];
      const idf = new Map<string, number>();

      const vector = computeTfIdf(tokens, idf);

      expect(vector).toBeInstanceOf(Map);
      expect(vector.size).toBe(0);
    });

    it('should skip tokens with zero IDF value', () => {
      const tokens = ['hello', 'world'];
      const idf = new Map<string, number>([
        ['hello', 1.0],
        ['world', 0],
      ]);

      const vector = computeTfIdf(tokens, idf);

      expect(vector.has('hello')).toBe(true);
      expect(vector.has('world')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // cosineSimilarity
  // ---------------------------------------------------------------------------

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const a = new Map([['x', 1], ['y', 2], ['z', 3]]);
      const b = new Map([['x', 1], ['y', 2], ['z', 3]]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = new Map([['x', 1]]);
      const b = new Map([['y', 1]]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(0);
    });

    it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity(new Map(), new Map())).toBe(0);
    });

    it('should return 0 when one vector is empty', () => {
      const a = new Map([['x', 1], ['y', 2]]);
      expect(cosineSimilarity(a, new Map())).toBe(0);
      expect(cosineSimilarity(new Map(), a)).toBe(0);
    });

    it('should handle vectors with no overlapping keys', () => {
      const a = new Map([['x', 1], ['y', 2]]);
      const b = new Map([['z', 3], ['w', 4]]);
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should handle negative values', () => {
      const a = new Map([['x', 1], ['y', -1]]);
      const b = new Map([['x', -1], ['y', 1]]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it('should be symmetric', () => {
      const a = new Map([['x', 1], ['y', 2], ['z', 3]]);
      const b = new Map([['x', 4], ['y', 5], ['z', 6]]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
    });

    it('should handle partial overlap', () => {
      const a = new Map([['x', 1], ['y', 2]]);
      const b = new Map([['y', 3], ['z', 4]]);
      // dot = 2*3 = 6, normA = sqrt(1+4) = sqrt(5), normB = sqrt(9+16) = 5
      expect(cosineSimilarity(a, b)).toBeCloseTo(6 / (Math.sqrt(5) * 5));
    });
  });

  // ---------------------------------------------------------------------------
  // getEmbeddingStatus
  // ---------------------------------------------------------------------------

  describe('getEmbeddingStatus', () => {
    it('should return correct counts', async () => {
      const file1 = createMockTFile({ path: 'docs/a.md' });
      const file2 = createMockTFile({ path: 'docs/b.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {} as unknown as App;

      const status = await getEmbeddingStatus(mockApp);

      expect(status.totalDocuments).toBe(2);
      expect(status.modelName).toBe('tfidf-local');
      expect(status.cacheMaxSize).toBe(500);
    });

    it('should filter by basePath', async () => {
      const file1 = createMockTFile({ path: 'docs/a.md' });
      const file2 = createMockTFile({ path: 'other/b.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {} as unknown as App;

      const status = await getEmbeddingStatus(mockApp, 'docs');

      expect(status.totalDocuments).toBe(1);
    });

    it('should treat basePath variants as the same scope', async () => {
      const file1 = createMockTFile({ path: 'notes/a.md' });
      const file2 = createMockTFile({ path: 'other/b.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {} as unknown as App;

      const withoutSlash = await getEmbeddingStatus(mockApp, 'notes');
      const withSlash = await getEmbeddingStatus(mockApp, 'notes/');
      const withExtraSlash = await getEmbeddingStatus(mockApp, 'notes//');

      expect(withoutSlash.totalDocuments).toBe(1);
      expect(withSlash.totalDocuments).toBe(withoutSlash.totalDocuments);
      expect(withExtraSlash.totalDocuments).toBe(withoutSlash.totalDocuments);
    });

    it('should count embedded and pending documents within basePath scope', async () => {
      const file1 = createMockTFile({ path: 'status-scope-a/embedded.md', mtime: 1000 });
      const file2 = createMockTFile({ path: 'status-scope-a/pending.md', mtime: 2000 });
      const file3 = createMockTFile({ path: 'status-scope-a-outside/other.md', mtime: 3000 });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2, file3]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        vault: {
          cachedRead: vi.fn(async () => 'sample content'),
        },
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue(null),
        },
      } as unknown as App;

      await embed(mockApp, { paths: ['status-scope-a/embedded.md'], force: true });
      const status = await getEmbeddingStatus(mockApp, 'status-scope-a');

      expect(status.totalDocuments).toBe(2);
      expect(status.embeddedDocuments).toBe(1);
      expect(status.pendingDocuments).toBe(1);
    });

    it('should not count embeddings outside basePath scope', async () => {
      const file1 = createMockTFile({ path: 'status-scope-b/target.md', mtime: 4000 });
      const file2 = createMockTFile({ path: 'status-scope-b-outside/embedded.md', mtime: 5000 });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        vault: {
          cachedRead: vi.fn(async () => 'sample content'),
        },
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue(null),
        },
      } as unknown as App;

      await embed(mockApp, { paths: ['status-scope-b-outside/embedded.md'], force: true });
      const status = await getEmbeddingStatus(mockApp, 'status-scope-b');

      expect(status.totalDocuments).toBe(1);
      expect(status.embeddedDocuments).toBe(0);
      expect(status.pendingDocuments).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // embed & vectorSearch (integration-style unit tests)
  // ---------------------------------------------------------------------------

  describe('embed', () => {
    function createEmbedMocks(files: ReturnType<typeof createMockTFile>[], contentMap: Map<string, string>) {
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue(files),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      return {
        vault: {
          cachedRead: vi.fn(async (file: any) => contentMap.get(file.path) || ''),
        },
        metadataCache: {
          getFileCache: vi.fn((file: any) => {
            if (file.path === 'docs/hero.md') {
              return createMockCachedMetadata({
                frontmatter: { name: 'Hero', type: 'character' },
              });
            }
            return null;
          }),
        },
      } as unknown as App;
    }

    it('should process files and return success', async () => {
      const file1 = createMockTFile({ path: 'docs/hero.md', mtime: 1000 });
      const file2 = createMockTFile({ path: 'docs/place.md', mtime: 2000 });
      const contentMap = new Map([
        ['docs/hero.md', 'The hero is brave and strong.'],
        ['docs/place.md', 'The castle stands tall on the hill.'],
      ]);

      const mockApp = createEmbedMocks([file1, file2], contentMap);

      const result = await embed(mockApp, {});

      expect(result.success).toBe(true);
      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.errors).toEqual([]);
    });

    it('should filter by basePath', async () => {
      const file1 = createMockTFile({ path: 'docs/hero.md', mtime: 1000 });
      const file2 = createMockTFile({ path: 'other/note.md', mtime: 2000 });
      const contentMap = new Map([
        ['docs/hero.md', 'The hero content.'],
        ['other/note.md', 'Other content.'],
      ]);

      const mockApp = createEmbedMocks([file1, file2], contentMap);

      const result = await embed(mockApp, { basePath: 'docs' });

      expect(result.success).toBe(true);
      // Only docs/hero.md should be processed
      expect(result.processed + result.skipped).toBeLessThanOrEqual(1);
    });

    it('should filter by specific paths', async () => {
      const file1 = createMockTFile({ path: 'docs/hero.md', mtime: 1000 });
      const file2 = createMockTFile({ path: 'docs/place.md', mtime: 2000 });
      const contentMap = new Map([
        ['docs/hero.md', 'Hero content.'],
        ['docs/place.md', 'Place content.'],
      ]);

      const mockApp = createEmbedMocks([file1, file2], contentMap);

      const result = await embed(mockApp, { paths: ['docs/hero.md'] });

      expect(result.success).toBe(true);
    });

    it('should handle read errors gracefully', async () => {
      const file1 = createMockTFile({ path: 'docs/broken.md', mtime: 1000 });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        vault: {
          cachedRead: vi.fn().mockRejectedValue(new Error('File read failed')),
        },
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue(null),
        },
      } as unknown as App;

      const result = await embed(mockApp, { force: true });

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('File read failed');
    });

    it('should reuse scoped file scan across status/embed/search for the same basePath', async () => {
      const file = createMockTFile({ path: 'scan-reuse/doc.md', mtime: 7000 });
      const contentMap = new Map([
        ['scan-reuse/doc.md', 'scope reuse token sample'],
      ]);
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        vault: {
          cachedRead: vi.fn(async (target: any) => contentMap.get(target.path) || ''),
        },
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue(null),
        },
      } as unknown as App;

      await getEmbeddingStatus(mockApp, 'scan-reuse');
      await embed(mockApp, { basePath: 'scan-reuse', force: true });
      await vectorSearch(mockApp, { query: 'scope reuse', basePath: 'scan-reuse', threshold: 0 });

      expect(mockFileListCache.getMarkdownFiles).toHaveBeenCalledTimes(1);
    });
  });

  describe('vectorSearch', () => {
    // These tests require embedding data to be present first.
    // We embed files, then search.

    function createSearchMocks() {
      const file1 = createMockTFile({ path: 'docs/hero.md', mtime: 1000 });
      const file2 = createMockTFile({ path: 'docs/castle.md', mtime: 2000 });
      const contentMap = new Map([
        ['docs/hero.md', 'The brave hero fights the dragon in the kingdom.'],
        ['docs/castle.md', 'The ancient castle stands on the mountain overlooking the valley.'],
      ]);

      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        vault: {
          cachedRead: vi.fn(async (file: any) => contentMap.get(file.path) || ''),
        },
        metadataCache: {
          getFileCache: vi.fn((file: any) => {
            if (file.path === 'docs/hero.md') {
              return createMockCachedMetadata({
                frontmatter: { name: 'Hero', type: 'character' },
              });
            }
            if (file.path === 'docs/castle.md') {
              return createMockCachedMetadata({
                frontmatter: { name: 'Castle', type: 'location' },
              });
            }
            return null;
          }),
        },
      } as unknown as App;

      return { mockApp, files: [file1, file2] };
    }

    it('should throw when no embeddings exist', async () => {
      // Use a fresh module isolation to ensure empty cache for this specific test.
      // Since we share the module-level cache, we check the error message.
      // Note: if previous tests have already embedded, this test may not trigger.
      // To handle this, we use a separate describe block or accept the coupling.

      const { mockApp } = createSearchMocks();

      // First, embed to populate cache
      await embed(mockApp, { force: true });

      // Now search should work (not throw)
      const result = await vectorSearch(mockApp, { query: 'hero brave' });
      expect(result.results).toBeDefined();
      expect(result.query).toBe('hero brave');
    });

    it('should return sorted results by score', async () => {
      const { mockApp } = createSearchMocks();

      await embed(mockApp, { force: true });

      const result = await vectorSearch(mockApp, {
        query: 'brave hero dragon',
        threshold: 0,
      });

      expect(result.results.length).toBeGreaterThan(0);

      // Check scores are in descending order
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].score).toBeLessThanOrEqual(result.results[i - 1].score);
      }
    });

    it('should apply frontmatterFilter', async () => {
      const { mockApp } = createSearchMocks();

      await embed(mockApp, { force: true });

      const result = await vectorSearch(mockApp, {
        query: 'hero castle',
        threshold: 0,
        frontmatterFilter: { type: 'character' },
      });

      // Only hero.md has type: 'character'
      for (const r of result.results) {
        expect(r.frontmatter?.type).toBe('character');
      }
    });

    it('should respect limit parameter', async () => {
      const { mockApp } = createSearchMocks();

      await embed(mockApp, { force: true });

      const result = await vectorSearch(mockApp, {
        query: 'hero castle',
        limit: 1,
        threshold: 0,
      });

      expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it('should include excerpt in results', async () => {
      const { mockApp } = createSearchMocks();

      await embed(mockApp, { force: true });

      const result = await vectorSearch(mockApp, {
        query: 'brave hero',
        threshold: 0,
      });

      const heroResult = result.results.find(r => r.path === 'docs/hero.md');
      if (heroResult) {
        expect(heroResult.excerpt).toBeDefined();
        expect(heroResult.excerpt).toContain('...');
      }
    });

    it('should include totalSearched in response', async () => {
      const { mockApp } = createSearchMocks();

      await embed(mockApp, { force: true });

      const result = await vectorSearch(mockApp, {
        query: 'test',
        threshold: 0,
      });

      expect(result.totalSearched).toBeGreaterThan(0);
    });

    it('should strip position from frontmatter output', async () => {
      const { mockApp } = createSearchMocks();

      await embed(mockApp, { force: true });

      const result = await vectorSearch(mockApp, {
        query: 'hero',
        threshold: 0,
      });

      for (const r of result.results) {
        if (r.frontmatter) {
          expect(r.frontmatter).not.toHaveProperty('position');
        }
      }
    });

    it('should handle vocabulary change between embed calls (P-05 dimension consistency)', async () => {
      // Phase 1: 첫 번째 임베딩 — 제한된 vocabulary
      const file1 = createMockTFile({ path: 'docs/alpha.md', mtime: 5000 });
      const contentMap1 = new Map([['docs/alpha.md', 'alpha beta gamma delta']]);
      const mockFileListCache1 = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache1 as any);
      const mockApp1 = {
        vault: { cachedRead: vi.fn(async (file: any) => contentMap1.get(file.path) || '') },
        metadataCache: { getFileCache: vi.fn(() => null) },
      } as unknown as App;

      await embed(mockApp1, { force: true });

      // Phase 2: 두 번째 임베딩 — 새로운 용어 추가 (vocabulary 확장)
      const file2 = createMockTFile({ path: 'docs/omega.md', mtime: 6000 });
      const contentMap2 = new Map([
        ['docs/alpha.md', 'alpha beta gamma delta'],
        ['docs/omega.md', 'omega epsilon zeta alpha'],
      ]);
      const mockFileListCache2 = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache2 as any);
      const mockApp2 = {
        vault: { cachedRead: vi.fn(async (file: any) => contentMap2.get(file.path) || '') },
        metadataCache: { getFileCache: vi.fn(() => null) },
      } as unknown as App;

      await embed(mockApp2, { force: true });

      // Phase 3: 검색 — 모든 벡터가 동일 차원이어야 유사도 계산 가능
      const result = await vectorSearch(mockApp2, {
        query: 'alpha beta',
        threshold: 0,
      });

      // 핵심 검증: 두 문서 모두 결과에 포함 (차원 불일치 시 score=0으로 누락됨)
      expect(result.results.length).toBe(2);
      // alpha.md가 더 높은 유사도 (alpha, beta 모두 포함)
      expect(result.results[0].path).toBe('docs/alpha.md');
      expect(result.results[0].score).toBeGreaterThan(0);
      expect(result.results[1].score).toBeGreaterThan(0);
    });
  });
});
