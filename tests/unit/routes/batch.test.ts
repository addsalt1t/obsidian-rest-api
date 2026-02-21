import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createBatchRouter } from '../../../src/routes/batch';
import type { App, CachedMetadata } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import { MAX_BATCH_SIZE } from '../../../src/constants';
import { createMockAppWithTree, createRouterTestApp } from '../../helpers';

vi.mock('../../../src/utils/metadata-ready', () => ({
  waitForMetadataReady: vi.fn().mockResolvedValue(true),
}));

function createMockFile(
  path: string,
  options?: { size?: number; ctime?: number; mtime?: number },
): TFile {
  return new TFile(path, options) as unknown as TFile;
}

function createMockFolder(path: string, children: (TFile | TFolder)[] = []): TFolder {
  return new TFolder(path, children) as unknown as TFolder;
}

function createTestApp(mockApp: App) {
  return createRouterTestApp(createBatchRouter(mockApp), '/batch');
}

// ============================================================================
// Helper: standard file tree for tests
// ============================================================================

function createStandardTreeApp(): App {
  const file1 = createMockFile('note.md');
  const file2 = createMockFile('docs/guide.md');
  const docsFolder = createMockFolder('docs', [file2]);
  const rootFolder = createMockFolder('', [file1, docsFolder]);

  const fileContents = new Map([
    ['note.md', '# Note\nSome content'],
    ['docs/guide.md', '# Guide\nGuide content'],
  ]);

  const fileCache = new Map<string, CachedMetadata | null>([
    ['note.md', {
      frontmatter: {
        title: 'Note',
        position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
      } as CachedMetadata['frontmatter'],
      tags: [{ tag: '#test', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
      links: [
        { link: 'docs/guide', displayText: 'Guide', original: '[[docs/guide]]', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } },
      ] as CachedMetadata['links'],
    }],
    ['docs/guide.md', null],
  ]);

  return createMockAppWithTree(rootFolder, { fileContents, fileCache });
}

// ============================================================================
// POST /batch/read
// ============================================================================

describe('Batch Router', () => {
  describe('POST /batch/read', () => {
    it('should read multiple files successfully', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({ paths: ['note', 'docs/guide'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(2);
      expect(res.body.errors).toHaveLength(0);
      expect(res.body.total).toBe(2);
      expect(res.body.success[0]).toEqual({ path: 'note.md', content: '# Note\nSome content' });
      expect(res.body.success[1]).toEqual({ path: 'docs/guide.md', content: '# Guide\nGuide content' });
    });

    it('should handle .md extension in paths', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({ paths: ['note.md'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.success[0].path).toBe('note.md');
    });

    it('should return errors for missing files while succeeding for existing ones', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({ paths: ['note', 'nonexistent'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.total).toBe(2);
      expect(res.body.errors[0].path).toBe('nonexistent');
      expect(res.body.errors[0].error).toContain('File not found');
    });

    it('should reject empty paths array', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({ paths: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('paths array is required');
    });

    it('should reject missing paths field', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('paths array is required');
    });

    it('should reject paths exceeding MAX_BATCH_SIZE', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const paths = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `file${i}`);
      const res = await request(app)
        .post('/batch/read')
        .send({ paths });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(`Maximum ${MAX_BATCH_SIZE}`);
      expect(res.body.details.requested).toBe(MAX_BATCH_SIZE + 1);
      expect(res.body.details.limit).toBe(MAX_BATCH_SIZE);
    });

    it('should report path traversal attempts as errors in results', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({ paths: ['../etc/passwd'] });

      // validatePath throws inside allSettled → errors array, not 400
      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].path).toBe('../etc/passwd');
      expect(res.body.errors[0].error).toContain('path traversal');
    });
  });

  // ============================================================================
  // POST /batch/metadata
  // ============================================================================

  describe('POST /batch/metadata', () => {
    it('should return metadata for multiple files', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/metadata')
        .send({ paths: ['note'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.errors).toHaveLength(0);
      expect(res.body.total).toBe(1);

      const meta = res.body.success[0];
      expect(meta.path).toBe('note.md');
      expect(meta.tags).toBeDefined();
      expect(meta.links).toEqual([{ path: 'docs/guide', displayText: 'Guide' }]);
      expect(meta.stat).toBeDefined();
      expect(meta.stat.size).toBe(100);
    });

    it('should return errors for missing files', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/metadata')
        .send({ paths: ['nonexistent'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(0);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toContain('File not found');
    });

    it('should handle files with no cache', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/metadata')
        .send({ paths: ['docs/guide'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.success[0].links).toEqual([]);
    });

    it('should reject empty paths array', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/metadata')
        .send({ paths: [] });

      expect(res.status).toBe(400);
    });

    it('should reject paths exceeding MAX_BATCH_SIZE', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const paths = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `file${i}`);
      const res = await request(app)
        .post('/batch/metadata')
        .send({ paths });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(`Maximum ${MAX_BATCH_SIZE}`);
    });

    it('should report path traversal attempts as errors in results', async () => {
      const mockApp = createStandardTreeApp();
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/metadata')
        .send({ paths: ['../secret'] });

      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toContain('path traversal');
    });
  });

  // ============================================================================
  // POST /batch/write
  // ============================================================================

  describe('POST /batch/write', () => {
    it('should create new files (upsert, file does not exist)', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 'new-note', content: '# New' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.success[0].path).toBe('new-note.md');
      expect(res.body.success[0].created).toBe(true);
      expect(res.body.total).toBe(1);
    });

    it('should update existing files (upsert)', async () => {
      const file = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 'note', content: '# Updated' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.success[0].path).toBe('note.md');
      expect(res.body.success[0].created).toBe(false);
      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    it('should fail with operation=create if file exists', async () => {
      const file = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 'note', content: '# New', operation: 'create' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(0);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toContain('File already exists');
    });

    it('should fail with operation=update if file does not exist', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 'missing', content: '# Content', operation: 'update' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toContain('File not found');
    });

    it('should handle mixed success and failure operations', async () => {
      const file = createMockFile('existing.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 'existing', content: '# Updated' },
            { path: 'missing', content: '# Content', operation: 'update' },
            { path: 'brand-new', content: '# Brand New' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(2);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.total).toBe(3);
    });

    it('should reject empty operations array', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({ operations: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('operations array is required');
    });

    it('should reject missing operations field', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject operations exceeding MAX_BATCH_SIZE', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const operations = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => ({
        path: `file${i}`,
        content: 'content',
      }));
      const res = await request(app)
        .post('/batch/write')
        .send({ operations });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(`Maximum ${MAX_BATCH_SIZE}`);
    });

    it('should reject operations with missing path', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { content: 'some content' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid operation');
    });

    it('should reject operations with empty path', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: '', content: 'some content' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid operation');
    });

    it('should reject operations with missing content', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 'note' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid operation');
    });

    it('should reject operations with non-string path', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 123, content: 'some content' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid operation');
    });

    it('should report path traversal attempts as errors in results', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: '../../../etc/passwd', content: 'malicious' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toContain('path traversal');
    });

    it('should call waitForMetadataReady after modify and create', async () => {
      const { waitForMetadataReady } = await import('../../../src/utils/metadata-ready');
      const file = createMockFile('existing.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      await request(app)
        .post('/batch/write')
        .send({
          operations: [
            { path: 'existing', content: '# Updated' },
            { path: 'brand-new', content: '# Brand New' },
          ],
        });

      // Should be called for both modify (forceWait: true) and create (default)
      expect(waitForMetadataReady).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // POST /batch/delete
  // ============================================================================

  describe('POST /batch/delete', () => {
    it('should delete multiple files successfully', async () => {
      const file1 = createMockFile('note.md');
      const file2 = createMockFile('docs/guide.md');
      const docsFolder = createMockFolder('docs', [file2]);
      const rootFolder = createMockFolder('', [file1, docsFolder]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/delete')
        .send({ paths: ['note.md', 'docs/guide.md'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(2);
      expect(res.body.errors).toHaveLength(0);
      expect(res.body.total).toBe(2);
      expect(mockApp.vault.delete).toHaveBeenCalledTimes(2);
    });

    it('should return errors for missing files', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/delete')
        .send({ paths: ['nonexistent.md'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(0);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toContain('File not found');
    });

    it('should handle mixed success and failure', async () => {
      const file1 = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file1]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/delete')
        .send({ paths: ['note.md', 'nonexistent.md'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.total).toBe(2);
    });

    it('should reject empty paths array', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/delete')
        .send({ paths: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('paths array is required');
    });

    it('should reject paths exceeding MAX_BATCH_SIZE', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const paths = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `file${i}.md`);
      const res = await request(app)
        .post('/batch/delete')
        .send({ paths });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(`Maximum ${MAX_BATCH_SIZE}`);
    });

    it('should report path traversal attempts as errors in results', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/delete')
        .send({ paths: ['../../../etc/shadow'] });

      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toContain('path traversal');
    });

    it('should handle .md fallback for delete paths', async () => {
      const file = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      // getFileWithFallback adds .md extension as fallback
      const res = await request(app)
        .post('/batch/delete')
        .send({ paths: ['note'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toHaveLength(1);
      expect(res.body.success[0]).toBe('note.md');
    });
  });

  // ============================================================================
  // partitionSettledResults (via batch-helpers)
  // ============================================================================

  describe('partitionSettledResults integration', () => {
    it('should correctly partition all-success results', async () => {
      const file1 = createMockFile('a.md');
      const file2 = createMockFile('b.md');
      const rootFolder = createMockFolder('', [file1, file2]);
      const fileContents = new Map([['a.md', 'A'], ['b.md', 'B']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({ paths: ['a', 'b'] });

      expect(res.body.success).toHaveLength(2);
      expect(res.body.errors).toHaveLength(0);
    });

    it('should correctly partition all-failure results', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/batch/read')
        .send({ paths: ['missing1', 'missing2'] });

      expect(res.body.success).toHaveLength(0);
      expect(res.body.errors).toHaveLength(2);
    });
  });
});
