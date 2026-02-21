import { describe, it, expect, vi } from 'vitest';
import {
  createMockApp,
  createMockAppWithTree,
  createMockRequest,
  createMockResponse,
  createMockTFile,
  createMockTFolder,
  createMockCachedMetadata,
  FIXTURE_ROOT_FILE,
  FIXTURE_NESTED_FILE,
  FIXTURE_IMAGE_FILE,
  FIXTURE_RICH_CACHE,
} from '../helpers';

describe('Test Helpers', () => {
  describe('createMockApp', () => {
    it('should create app with default stubs', () => {
      const app = createMockApp();

      expect(app.vault.getAbstractFileByPath('any')).toBeNull();
      expect(app.vault.getFiles()).toEqual([]);
      expect(app.vault.getMarkdownFiles()).toEqual([]);
    });

    it('should accept vault overrides', () => {
      const mockFile = createMockTFile('test.md');
      const app = createMockApp({
        vault: {
          getMarkdownFiles: vi.fn().mockReturnValue([mockFile]),
        },
      });

      expect(app.vault.getMarkdownFiles()).toEqual([mockFile]);
    });

    it('should accept metadataCache overrides', () => {
      const app = createMockApp({
        metadataCache: {
          getTags: vi.fn().mockReturnValue({ '#tag': 5 }),
        },
      });

      expect(app.metadataCache.getTags()).toEqual({ '#tag': 5 });
    });
  });

  describe('createMockAppWithTree', () => {
    it('should resolve files by path', () => {
      const file = createMockTFile('docs/readme.md');
      const folder = createMockTFolder('docs', [file]);
      const root = createMockTFolder('', [folder]);

      const app = createMockAppWithTree(root);

      expect(app.vault.getAbstractFileByPath('docs/readme.md')).toBe(file);
      expect(app.vault.getAbstractFileByPath('nonexistent')).toBeNull();
    });

    it('should resolve root folder for empty path', () => {
      const root = createMockTFolder('', []);
      const app = createMockAppWithTree(root);

      expect(app.vault.getAbstractFileByPath('')).toBe(root);
      expect(app.vault.getAbstractFileByPath('/')).toBe(root);
    });

    it('should read file contents from map', async () => {
      const file = createMockTFile('note.md');
      const root = createMockTFolder('', [file]);
      const fileContents = new Map([['note.md', '# Hello World']]);

      const app = createMockAppWithTree(root, { fileContents });

      await expect(app.vault.read(file)).resolves.toBe('# Hello World');
    });

    it('should return file cache from map', () => {
      const file = createMockTFile('note.md');
      const root = createMockTFolder('', [file]);
      const cache = createMockCachedMetadata({ tags: ['test'] });
      const fileCache = new Map([['note.md', cache]]);

      const app = createMockAppWithTree(root, { fileCache });

      expect(app.metadataCache.getFileCache(file)).toBe(cache);
    });

    it('should list markdown files from tree', () => {
      const mdFile = createMockTFile('note.md');
      const imgFile = createMockTFile('photo.png');
      const root = createMockTFolder('', [mdFile, imgFile]);

      const app = createMockAppWithTree(root);

      const mdFiles = app.vault.getMarkdownFiles();
      expect(mdFiles).toContainEqual(mdFile);
      expect(mdFiles).not.toContainEqual(imgFile);
    });
  });

  describe('createMockRequest', () => {
    it('should create request with defaults', () => {
      const req = createMockRequest();

      expect(req.params).toEqual({});
      expect(req.query).toEqual({});
      expect(req.body).toEqual({});
      expect(req.headers).toEqual({});
    });

    it('should accept overrides', () => {
      const req = createMockRequest({
        params: { path: 'test.md' },
        headers: { 'content-type': 'text/markdown' },
      });

      expect(req.params).toEqual({ path: 'test.md' });
      expect(req.headers['content-type']).toBe('text/markdown');
    });
  });

  describe('createMockResponse', () => {
    it('should create chainable response', () => {
      const res = createMockResponse();

      // Test chaining
      const result = res.status(200).json({ ok: true });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
      expect(result).toBe(res);
    });

    it('should support send method', () => {
      const res = createMockResponse();

      res.status(404).send('Not found');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Not found');
    });
  });

  describe('createMockTFile', () => {
    it('should derive name parts from path', () => {
      const file = createMockTFile({ path: 'folder/sub/document.md' });

      expect(file.name).toBe('document.md');
      expect(file.basename).toBe('document');
      expect(file.extension).toBe('md');
    });

    it('should accept string shorthand', () => {
      const file = createMockTFile('test.md');

      expect(file.path).toBe('test.md');
      expect(file.name).toBe('test.md');
    });

    it('should use default stat values', () => {
      const file = createMockTFile('test.md');

      expect(file.stat.size).toBe(100);
      expect(file.stat.ctime).toBe(1000);
      expect(file.stat.mtime).toBe(2000);
    });

    it('should accept custom stat values', () => {
      const file = createMockTFile({ path: 'test.md', size: 999, ctime: 111, mtime: 222 });

      expect(file.stat.size).toBe(999);
      expect(file.stat.ctime).toBe(111);
      expect(file.stat.mtime).toBe(222);
    });
  });

  describe('createMockTFolder', () => {
    it('should set parent references for children', () => {
      const file = createMockTFile('folder/child.md');
      const folder = createMockTFolder('folder', [file]);

      expect((file as unknown as { parent: unknown }).parent).toBe(folder);
    });

    it('should detect root folder', () => {
      const root = createMockTFolder('', []);

      expect((root as unknown as { isRoot: () => boolean }).isRoot()).toBe(true);
    });

    it('should detect non-root folder', () => {
      const folder = createMockTFolder('subfolder', []);

      expect((folder as unknown as { isRoot: () => boolean }).isRoot()).toBe(false);
    });
  });

  describe('createMockCachedMetadata', () => {
    it('should add # prefix to tags', () => {
      const cache = createMockCachedMetadata({ tags: ['important'] });

      expect(cache.tags![0].tag).toBe('#important');
    });

    it('should preserve existing # prefix', () => {
      const cache = createMockCachedMetadata({ tags: ['#already-prefixed'] });

      expect(cache.tags![0].tag).toBe('#already-prefixed');
    });

    it('should add position stub to frontmatter', () => {
      const cache = createMockCachedMetadata({
        frontmatter: { title: 'Test' },
      });

      expect(cache.frontmatter!.title).toBe('Test');
      expect(cache.frontmatter!.position).toBeDefined();
    });

    it('should create links with defaults', () => {
      const cache = createMockCachedMetadata({
        links: [{ link: 'target.md' }],
      });

      expect(cache.links![0].link).toBe('target.md');
      expect(cache.links![0].displayText).toBe('target.md');
    });

    it('should create headings', () => {
      const cache = createMockCachedMetadata({
        headings: [{ heading: 'Title', level: 1 }],
      });

      expect(cache.headings![0].heading).toBe('Title');
      expect(cache.headings![0].level).toBe(1);
    });
  });

  describe('Fixtures', () => {
    it('should have pre-built root file', () => {
      expect(FIXTURE_ROOT_FILE.path).toBe('note.md');
      expect(FIXTURE_ROOT_FILE.extension).toBe('md');
    });

    it('should have pre-built nested file', () => {
      expect(FIXTURE_NESTED_FILE.path).toBe('projects/obsidian/readme.md');
    });

    it('should have pre-built image file', () => {
      expect(FIXTURE_IMAGE_FILE.extension).toBe('png');
    });

    it('should have pre-built rich cache', () => {
      expect(FIXTURE_RICH_CACHE.frontmatter!.title).toBe('Test Note');
      expect(FIXTURE_RICH_CACHE.tags).toHaveLength(2);
      expect(FIXTURE_RICH_CACHE.links).toHaveLength(1);
      expect(FIXTURE_RICH_CACHE.headings).toHaveLength(2);
    });
  });
});
