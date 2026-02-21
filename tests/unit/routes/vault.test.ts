import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import {
  createVaultRouter,
  createFolderRouter,
  createMoveRenameRouter,
} from '../../../src/routes/vault';
import { buildFolderTree } from '../../../src/routes/vault/tree';
import type { App, CachedMetadata, LinkCache } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import { MIME_TYPE } from '../../../src/constants';
import { createMockAppWithTree, createRouterTestApp } from '../../helpers';

// waitForMetadataReady를 mock — 테스트에서는 즉시 true 반환
vi.mock('../../../src/utils/metadata-ready', () => ({
  waitForMetadataReady: vi.fn().mockResolvedValue(true),
}));

function createMockFile(
  path: string,
  options?: { size?: number; ctime?: number; mtime?: number }
): TFile {
  return new TFile(path, options) as unknown as TFile;
}

function createMockFolder(path: string, children: (TFile | TFolder)[] = []): TFolder {
  return new TFolder(path, children) as unknown as TFolder;
}

function createTestApp(mockApp: App, routerType: 'vault' | 'folder' | 'move-rename' = 'vault') {
  switch (routerType) {
    case 'vault':
      return createRouterTestApp(createVaultRouter(mockApp), '/vault');
    case 'folder':
      return createRouterTestApp(createFolderRouter(mockApp), '/vault/folder');
    case 'move-rename':
      return createRouterTestApp(createMoveRenameRouter(mockApp), '/vault');
  }
}

// ============================================================================
// Vault Router Tests
// ============================================================================

describe('Vault Router', () => {
  describe('Tree helper regression', () => {
    it('should keep recursive tree response shape stable at max depth', () => {
      const nestedFile = createMockFile('docs/guide.md');
      const nestedFolder = createMockFolder('docs', [nestedFile]);
      const rootFolder = createMockFolder('', [nestedFolder]);

      const tree = buildFolderTree(rootFolder, 1, 1);

      expect(tree).toEqual({
        path: '',
        name: rootFolder.name,
        files: [],
        folders: [
          {
            path: 'docs',
            name: 'docs',
            files: [],
            folders: [],
          },
        ],
      });
    });
  });

  describe('GET /vault/ - List root', () => {
    it('should return files and folders at root level', async () => {
      const file1 = createMockFile('note.md');
      const folder1 = createMockFolder('subfolder');
      const rootFolder = createMockFolder('', [file1, folder1]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/');

      expect(res.status).toBe(200);
      expect(res.body.files).toHaveLength(1);
      expect(res.body.folders).toHaveLength(1);
      expect(res.body.files[0].path).toBe('note.md');
      expect(res.body.folders[0].path).toBe('subfolder');
    });

    it('should include file metadata in response', async () => {
      const file = createMockFile('test.md', { size: 500, ctime: 1234, mtime: 5678 });
      const rootFolder = createMockFolder('', [file]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/');

      expect(res.status).toBe(200);
      expect(res.body.files[0]).toEqual({
        path: 'test.md',
        name: 'test',
        extension: 'md',
        size: 500,
        ctime: 1234,
        mtime: 5678,
      });
    });

    it('should include folder children paths in response', async () => {
      const childFile = createMockFile('folder/child.md');
      const folder = createMockFolder('folder', [childFile]);
      const rootFolder = createMockFolder('', [folder]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/');

      expect(res.status).toBe(200);
      expect(res.body.folders[0].children).toContain('folder/child.md');
    });
  });

  describe('GET /vault/?recursive=true - Tree view', () => {
    it('should return full tree structure', async () => {
      const deepFile = createMockFile('a/b/deep.md');
      const folderB = createMockFolder('a/b', [deepFile]);
      const fileA = createMockFile('a/file.md');
      const folderA = createMockFolder('a', [fileA, folderB]);
      const rootFile = createMockFile('root.md');
      const rootFolder = createMockFolder('', [rootFile, folderA]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/?recursive=true');

      expect(res.status).toBe(200);
      expect(res.body.tree).toBeDefined();
      expect(res.body.tree.files).toHaveLength(1);
      expect(res.body.tree.files[0].path).toBe('root.md');
      expect(res.body.tree.folders).toHaveLength(1);
      expect(res.body.tree.folders[0].path).toBe('a');
      expect(res.body.tree.folders[0].files).toHaveLength(1);
      expect(res.body.tree.folders[0].folders).toHaveLength(1);
      expect(res.body.tree.folders[0].folders[0].path).toBe('a/b');
      expect(res.body.tree.folders[0].folders[0].files[0].path).toBe('a/b/deep.md');
    });

    it('should respect maxDepth parameter', async () => {
      const deepFile = createMockFile('a/b/c/deep.md');
      const folderC = createMockFolder('a/b/c', [deepFile]);
      const folderB = createMockFolder('a/b', [folderC]);
      const folderA = createMockFolder('a', [folderB]);
      const rootFolder = createMockFolder('', [folderA]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      // maxDepth=3 test (root=1, a=2, a/b=3, a/b/c processed as empty at depth 3)
      const res = await request(app).get('/vault/?recursive=true&maxDepth=3');

      expect(res.status).toBe(200);
      expect(res.body.tree.folders[0].path).toBe('a');
      expect(res.body.tree.folders[0].folders[0].path).toBe('a/b');
      // maxDepth=3 so a/b/c exists but contents should be empty
      expect(res.body.tree.folders[0].folders[0].folders[0].path).toBe('a/b/c');
      expect(res.body.tree.folders[0].folders[0].folders[0].files).toHaveLength(0);
      expect(res.body.tree.folders[0].folders[0].folders[0].folders).toHaveLength(0);
    });

    it('should return 400 for invalid maxDepth', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/?recursive=true&maxDepth=-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('maxDepth');
    });

    it('should return 400 for maxDepth > 100', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/?recursive=true&maxDepth=101');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('maxDepth');
    });

    it('should use default maxDepth for non-numeric value', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      // parseIntParam('abc', 10) returns default value 10, so this is valid
      const res = await request(app).get('/vault/?recursive=true&maxDepth=abc');

      expect(res.status).toBe(200);
      expect(res.body.tree).toBeDefined();
    });
  });

  describe('GET /vault/{folder}?recursive=true - Subtree view', () => {
    it('should return tree for specific folder', async () => {
      const subFile = createMockFile('projects/readme.md');
      const subFolder = createMockFolder('projects/src');
      const projectsFolder = createMockFolder('projects', [subFile, subFolder]);
      const rootFolder = createMockFolder('', [projectsFolder]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/projects?recursive=true');

      expect(res.status).toBe(200);
      expect(res.body.tree).toBeDefined();
      expect(res.body.tree.path).toBe('projects');
      expect(res.body.tree.files).toHaveLength(1);
      expect(res.body.tree.folders).toHaveLength(1);
    });

    it('should return 404 for non-existent folder', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/nonexistent/?recursive=true');

      expect(res.status).toBe(404);
    });

    it('should return non-recursive listing for folder without trailing slash', async () => {
      const subFile = createMockFile('projects/readme.md');
      const projectsFolder = createMockFolder('projects', [subFile]);
      const rootFolder = createMockFolder('', [projectsFolder]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/projects');

      expect(res.status).toBe(200);
      expect(res.body.files).toBeDefined();
      expect(res.body.folders).toBeDefined();
      expect(res.body.tree).toBeUndefined();
    });
  });

  describe('GET /vault/{path} - Read file', () => {
    it('should return file content as text/markdown by default', async () => {
      const file = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file]);
      const fileContents = new Map([['note.md', '# My Note\n\nContent here']]);

      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/note.md');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toBe('# My Note\n\nContent here');
    });

    it('should auto-add .md extension when file not found', async () => {
      const file = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file]);
      const fileContents = new Map([['note.md', '# Note content']]);

      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/note');

      expect(res.status).toBe(200);
      expect(res.text).toBe('# Note content');
    });

    it('should return 404 for non-existent file', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/nonexistent.md');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('File not found');
    });

    it('should return JSON with metadata when Accept header is application/vnd.olrapi.note+json', async () => {
      const file = createMockFile('note.md', { size: 200, ctime: 1000, mtime: 2000 });
      const rootFolder = createMockFolder('', [file]);
      const fileContents = new Map([['note.md', '---\ntitle: Test\ntags: [a, b]\n---\n\n# Content']]);
      const fileCache = new Map<string, CachedMetadata>([
        [
          'note.md',
          {
            frontmatter: { title: 'Test', tags: ['a', 'b'], position: { start: 0, end: 10 } },
            tags: [{ tag: '#inline' }],
            links: [{ link: 'other.md', displayText: 'Other' }] as LinkCache[],
          } as CachedMetadata,
        ],
      ]);

      const mockApp = createMockAppWithTree(rootFolder, { fileContents, fileCache });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/note.md').set('Accept', MIME_TYPE.NOTE_JSON);

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('note.md');
      expect(res.body.name).toBe('note');
      expect(res.body.content).toContain('# Content');
      expect(res.body.frontmatter).toBeDefined();
      expect(res.body.frontmatter.title).toBe('Test');
      expect(res.body.frontmatter.position).toBeUndefined(); // position should be stripped
      expect(res.body.tags).toContain('#inline');
      expect(res.body.links).toHaveLength(1);
      expect(res.body.stat).toEqual({ size: 200, ctime: 1000, mtime: 2000 });
    });

    it('should strip # prefix from frontmatter tags in note+json response', async () => {
      const file = createMockFile('note.md', { size: 100, ctime: 1000, mtime: 2000 });
      const rootFolder = createMockFolder('', [file]);
      const fileContents = new Map([['note.md', '---\ntags:\n  - "#tagged"\n---\n\nContent']]);
      const fileCache = new Map<string, CachedMetadata>([
        [
          'note.md',
          {
            frontmatter: { tags: ['#tagged', '#another'], position: { start: 0, end: 10 } },
          } as unknown as CachedMetadata,
        ],
      ]);

      const mockApp = createMockAppWithTree(rootFolder, { fileContents, fileCache });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/note.md').set('Accept', MIME_TYPE.NOTE_JSON);

      expect(res.status).toBe(200);
      // frontmatter.tags는 # 없이 반환
      expect(res.body.frontmatter.tags).toEqual(['tagged', 'another']);
      // top-level tags는 # 포함 (extractAllTags의 역할)
      expect(res.body.tags).toContain('#tagged');
    });

    it('should parse frontmatter when cache is empty', async () => {
      const file = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file]);
      const fileContents = new Map([
        ['note.md', '---\ntitle: Parsed Title\ntags:\n  - parsed\n---\n\nBody'],
      ]);
      const fileCache = new Map<string, CachedMetadata | null>([['note.md', null]]);

      const mockApp = createMockAppWithTree(rootFolder, { fileContents, fileCache });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/note.md').set('Accept', MIME_TYPE.NOTE_JSON);

      expect(res.status).toBe(200);
      expect(res.body.frontmatter.title).toBe('Parsed Title');
    });

    it('should reject path traversal attempts', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      // Note: Express normalizes the URL path before the router receives it,
      // so /../../../etc/passwd becomes /etc/passwd which is a 404 (not found)
      // URL-encoded traversal is caught by validatePath
      const res = await request(app).get('/vault/..%2F..%2Fetc%2Fpasswd');

      expect(res.status).toBe(400);
    });
  });

  describe('Backward compatibility', () => {
    it('should return old format when recursive is not set', async () => {
      const file1 = createMockFile('note.md');
      const folder1 = createMockFolder('subfolder');
      const rootFolder = createMockFolder('', [file1, folder1]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/');

      expect(res.status).toBe(200);
      expect(res.body.files).toBeDefined();
      expect(res.body.folders).toBeDefined();
      expect(res.body.tree).toBeUndefined();
    });

    it('should return old format when recursive=false', async () => {
      const file1 = createMockFile('note.md');
      const rootFolder = createMockFolder('', [file1]);

      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/vault/?recursive=false');

      expect(res.status).toBe(200);
      expect(res.body.files).toBeDefined();
      expect(res.body.tree).toBeUndefined();
    });
  });

  describe('PUT /vault/{path} - Create/Update file', () => {
    it('should create new file', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/vault/new-file.md')
        .set('Content-Type', 'text/markdown')
        .send('# New File Content');

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('created');
      expect(mockApp.vault.create).toHaveBeenCalled();
    });

    it('should update existing file', async () => {
      const existingFile = createMockFile('existing.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/vault/existing.md')
        .set('Content-Type', 'text/markdown')
        .send('# Updated Content');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('updated');
      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    it('should auto-add .md extension', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/vault/new-file')
        .set('Content-Type', 'text/markdown')
        .send('Content');

      expect(res.status).toBe(201);
      expect(res.body.path).toBe('new-file.md');
    });

    it('should return 400 when path is missing', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/vault/')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Path is required');
    });

    it('should reject path traversal', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      // URL encoded path traversal attempt
      const res = await request(app)
        .put('/vault/..%2F..%2Fetc%2Fpasswd')
        .set('Content-Type', 'text/markdown')
        .send('malicious');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should create parent folder if needed', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/vault/deep/nested/file.md')
        .set('Content-Type', 'text/markdown')
        .send('# Nested content');

      expect(res.status).toBe(201);
      expect(mockApp.vault.createFolder).toHaveBeenCalled();
    });

    it('should wait for metadata ready after create', async () => {
      const { waitForMetadataReady } = await import('../../../src/utils/metadata-ready');
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      await request(app)
        .put('/vault/new-file.md')
        .set('Content-Type', 'text/markdown')
        .send('# New Content');

      expect(waitForMetadataReady).toHaveBeenCalledWith(mockApp, 'new-file.md');
    });

    it('should wait for metadata ready with forceWait after update', async () => {
      const { waitForMetadataReady } = await import('../../../src/utils/metadata-ready');
      const existingFile = createMockFile('existing.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      await request(app)
        .put('/vault/existing.md')
        .set('Content-Type', 'text/markdown')
        .send('# Updated Content');

      expect(waitForMetadataReady).toHaveBeenCalledWith(
        mockApp, 'existing.md', { forceWait: true }
      );
    });

    it('should accept JSON content with content property', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/vault/new-file.md')
        .set('Content-Type', 'application/json')
        .send({ content: '# JSON Content' });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /vault/{path} - Append content', () => {
    it('should append content to existing file', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/vault/note.md')
        .set('Content-Type', 'text/markdown')
        .send('\n## Appended Section');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('appended');
      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    it('should wait for metadata ready with forceWait after append', async () => {
      const { waitForMetadataReady } = await import('../../../src/utils/metadata-ready');
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      await request(app)
        .post('/vault/note.md')
        .set('Content-Type', 'text/markdown')
        .send('\nAppended');

      expect(waitForMetadataReady).toHaveBeenCalledWith(
        mockApp, 'note.md', { forceWait: true }
      );
    });

    it('should return 404 for non-existent file', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/vault/nonexistent.md')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(404);
    });

    it('should return 400 when path is missing', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/vault/')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(400);
    });

    it('should reject path traversal', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      // URL-encoded path traversal attempt
      const res = await request(app)
        .post('/vault/..%2Fsecret.md')
        .set('Content-Type', 'text/markdown')
        .send('malicious');

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /vault/{path} - Delete file', () => {
    it('should delete existing file', async () => {
      const fileToDelete = createMockFile('to-delete.md');
      const rootFolder = createMockFolder('', [fileToDelete]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).delete('/vault/to-delete.md');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
      expect(mockApp.vault.delete).toHaveBeenCalled();
    });

    it('should auto-add .md extension and delete', async () => {
      const fileToDelete = createMockFile('to-delete.md');
      const rootFolder = createMockFolder('', [fileToDelete]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).delete('/vault/to-delete');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('to-delete.md');
    });

    it('should return 404 for non-existent file', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).delete('/vault/nonexistent.md');

      expect(res.status).toBe(404);
    });

    it('should return 400 when path is missing', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).delete('/vault/');

      expect(res.status).toBe(400);
    });

    it('should reject path traversal', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app).delete('/vault/..%2F..%2Fimportant.md');

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /vault/{path} - Patch file', () => {
    it('should patch by heading', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([
        ['note.md', '# Title\n\n## Section\nOld content\n\n## Other\nOther content'],
      ]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=Section')
        .set('target-type', 'heading')
        .set('Content-Type', 'text/markdown')
        .send('New content');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('patched');
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('New content')
      );
      // Verify other sections are preserved
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('## Other\nOther content')
      );
    });

    it('should patch by nested heading path', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([
        ['note.md', '# Parent\n\n## Child\nChild content\n\n# Other\nOther content'],
      ]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=Parent%3A%3AChild')
        .set('target-type', 'heading')
        .set('Content-Type', 'text/markdown')
        .send('Updated child content');

      expect(res.status).toBe(200);
    });

    it('should resolve heading path with resolve=true', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([
        ['note.md', '# Parent\n\n## Unique\nUnique content\n\n# Other\nOther content'],
      ]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=Unique&resolve=true')
        .set('target-type', 'heading')
        .set('Content-Type', 'text/markdown')
        .send('Resolved content');

      expect(res.status).toBe(200);
    });

    it('should return 400 for ambiguous heading with resolve=true', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([
        ['note.md', '# Section1\n\n## Duplicate\nContent1\n\n# Section2\n\n## Duplicate\nContent2'],
      ]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=Duplicate&resolve=true')
        .set('target-type', 'heading')
        .set('Content-Type', 'text/markdown')
        .send('Content');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Ambiguous heading');
      expect(res.body.candidates).toBeDefined();
    });

    it('should return 404 when heading not found', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', '# Title\n\nSome content']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=NonExistent')
        .set('target-type', 'heading')
        .set('Content-Type', 'text/markdown')
        .send('New content');

      expect(res.status).toBe(404);
    });

    it('should patch by block ID', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([
        ['note.md', '# Title\n\nThis is a block ^block-id\n\nOther content'],
      ]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=block-id')
        .set('target-type', 'block')
        .set('Content-Type', 'text/markdown')
        .send('Updated block');

      expect(res.status).toBe(200);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Updated block')
      );
      // Verify block ID is preserved
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('^block-id')
      );
    });

    it('should return 404 when block not found', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', '# Title\n\nSome content']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=nonexistent-block')
        .set('target-type', 'block')
        .set('Content-Type', 'text/markdown')
        .send('Content');

      expect(res.status).toBe(404);
    });

    it('should patch by line number', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', 'Line 1\nLine 2\nLine 3']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=2')
        .set('target-type', 'line')
        .set('Content-Type', 'text/markdown')
        .send('New Line 2');

      expect(res.status).toBe(200);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.anything(),
        'Line 1\nNew Line 2\nLine 3'
      );
    });

    it('should return 404 for out of range line number', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', 'Line 1\nLine 2']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=999')
        .set('target-type', 'line')
        .set('Content-Type', 'text/markdown')
        .send('Content');

      expect(res.status).toBe(404);
    });

    it('should patch frontmatter key', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', '---\ntitle: Old Title\n---\n\n# Content']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=title')
        .set('target-type', 'frontmatter-key')
        .set('Content-Type', 'text/markdown')
        .send('New Title');

      expect(res.status).toBe(200);
    });

    it('should support frontmatter target-type alias', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', '---\nstatus: draft\n---\n\n# Content']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=status')
        .set('target-type', 'frontmatter')
        .set('Content-Type', 'text/markdown')
        .send('published');

      expect(res.status).toBe(200);
    });

    it('should support append operation', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', '# Section\n\nExisting content']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md?target=Section')
        .set('target-type', 'heading')
        .set('operation', 'append')
        .set('Content-Type', 'text/markdown')
        .send('\nAppended content');

      expect(res.status).toBe(200);
    });

    it('should wait for metadata ready with forceWait after patch', async () => {
      const { waitForMetadataReady } = await import('../../../src/utils/metadata-ready');
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', '# Section\n\nOld content']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      await request(app)
        .patch('/vault/note.md?target=Section')
        .set('target-type', 'heading')
        .set('Content-Type', 'text/markdown')
        .send('New content');

      expect(waitForMetadataReady).toHaveBeenCalledWith(
        mockApp, 'note.md', { forceWait: true }
      );
    });

    it('should replace entire content when no target-type specified', async () => {
      const existingFile = createMockFile('note.md');
      const rootFolder = createMockFolder('', [existingFile]);
      const fileContents = new Map([['note.md', 'Old content']]);
      const mockApp = createMockAppWithTree(rootFolder, { fileContents });
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/note.md')
        .set('Content-Type', 'text/markdown')
        .send('New content');

      expect(res.status).toBe(200);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(existingFile, 'New content');
    });

    it('should return 400 when path is missing', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(400);
    });

    it('should return 404 when file not found', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/vault/nonexistent.md')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(404);
    });
  });
});

// ============================================================================
// Folder Router Tests
// ============================================================================

describe('Folder Router', () => {
  describe('POST /vault/folder/{path} - Create folder', () => {
    it('should create new folder', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).post('/vault/folder/new-folder');

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('created');
      expect(res.body.path).toBe('new-folder');
      expect(mockApp.vault.createFolder).toHaveBeenCalledWith('new-folder');
    });

    it('should create nested folder', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).post('/vault/folder/deep/nested/folder');

      expect(res.status).toBe(201);
      expect(res.body.path).toBe('deep/nested/folder');
    });

    it('should return 409 if folder already exists', async () => {
      const existingFolder = createMockFolder('existing');
      const rootFolder = createMockFolder('', [existingFolder]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).post('/vault/folder/existing');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Target path already exists');
    });

    it('should return 400 when path is missing', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).post('/vault/folder/');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Path is required');
    });

    it('should reject path traversal', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      // URL-encoded path traversal attempt
      const res = await request(app).post('/vault/folder/..%2F..%2Fmalicious');

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /vault/folder/{path} - Delete folder', () => {
    it('should delete empty folder', async () => {
      const emptyFolder = createMockFolder('empty');
      const rootFolder = createMockFolder('', [emptyFolder]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).delete('/vault/folder/empty');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
      expect(mockApp.vault.delete).toHaveBeenCalled();
    });

    it('should return 409 for non-empty folder without force', async () => {
      const file = createMockFile('nonempty/file.md');
      const nonEmptyFolder = createMockFolder('nonempty', [file]);
      const rootFolder = createMockFolder('', [nonEmptyFolder]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).delete('/vault/folder/nonempty');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Folder is not empty. Use force=true to delete');
    });

    it('should delete non-empty folder with force=true', async () => {
      const file = createMockFile('nonempty/file.md');
      const nonEmptyFolder = createMockFolder('nonempty', [file]);
      const rootFolder = createMockFolder('', [nonEmptyFolder]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).delete('/vault/folder/nonempty?force=true');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
      expect(mockApp.vault.delete).toHaveBeenCalledWith(nonEmptyFolder, true);
    });

    it('should return 404 for non-existent folder', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).delete('/vault/folder/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Folder not found');
    });

    it('should return 400 when path is missing', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).delete('/vault/folder/');

      expect(res.status).toBe(400);
    });

    it('should reject path traversal', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'folder');

      const res = await request(app).delete('/vault/folder/..%2F..%2Fimportant');

      expect(res.status).toBe(400);
    });
  });
});

// ============================================================================
// Move/Rename Router Tests
// ============================================================================

describe('Move/Rename Router', () => {
  describe('POST /vault/{path}/move - Move file/folder', () => {
    it('should move file to new location', async () => {
      const file = createMockFile('old/location.md');
      const oldFolder = createMockFolder('old', [file]);
      const newFolder = createMockFolder('new', []);
      const rootFolder = createMockFolder('', [oldFolder, newFolder]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/old/location.md/move')
        .send({ newPath: 'new/location.md' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Moved');
      expect(res.body.oldPath).toBe('old/location.md');
      expect(res.body.newPath).toBe('new/location.md');
      expect(mockApp.fileManager.renameFile).toHaveBeenCalled();
    });

    it('should wait for metadata ready after move', async () => {
      const { waitForMetadataReady } = await import('../../../src/utils/metadata-ready');
      const file = createMockFile('source.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      await request(app)
        .post('/vault/source.md/move')
        .send({ newPath: 'dest.md' });

      expect(waitForMetadataReady).toHaveBeenCalledWith(mockApp, 'dest.md', { forceWait: true });
    });

    it('should return 404 for non-existent source', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/nonexistent.md/move')
        .send({ newPath: 'new/location.md' });

      expect(res.status).toBe(404);
    });

    it('should return 409 if target already exists', async () => {
      const sourceFile = createMockFile('source.md');
      const targetFile = createMockFile('target.md');
      const rootFolder = createMockFolder('', [sourceFile, targetFile]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app).post('/vault/source.md/move').send({ newPath: 'target.md' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Target path already exists');
    });

    it('should return 400 when newPath is missing', async () => {
      const file = createMockFile('source.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app).post('/vault/source.md/move').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('newPath is required in request body');
    });

    it('should return 400 when newPath is not a string', async () => {
      const file = createMockFile('source.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/source.md/move')
        .send({ newPath: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('newPath is required in request body');
    });

    it('should return 404 when source path is missing (empty path becomes root)', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      // Empty path results in empty string which then triggers 404 (file not found)
      // because the route pattern /*/move requires at least one character
      const res = await request(app).post('/vault//move').send({ newPath: 'target.md' });

      expect(res.status).toBe(404);
    });

    it('should reject path traversal in source path', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      // URL-encoded path traversal attempt
      const res = await request(app)
        .post('/vault/..%2F..%2Fsecret.md/move')
        .send({ newPath: 'target.md' });

      expect(res.status).toBe(400);
    });

    it('should reject path traversal in target path', async () => {
      const file = createMockFile('source.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/source.md/move')
        .send({ newPath: '../../../malicious.md' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /vault/{path}/rename - Rename file/folder', () => {
    it('should rename file in same location', async () => {
      const file = createMockFile('folder/old-name.md');
      (file as TFile & { parent: TFolder }).parent = createMockFolder('folder');
      const folder = createMockFolder('folder', [file]);
      const rootFolder = createMockFolder('', [folder]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/folder/old-name.md/rename')
        .send({ newName: 'new-name.md' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Renamed');
      expect(res.body.oldPath).toBe('folder/old-name.md');
      expect(res.body.newPath).toBe('folder/new-name.md');
    });

    it('should wait for metadata ready after rename', async () => {
      const { waitForMetadataReady } = await import('../../../src/utils/metadata-ready');
      const file = createMockFile('old-name.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      await request(app)
        .post('/vault/old-name.md/rename')
        .send({ newName: 'new-name.md' });

      expect(waitForMetadataReady).toHaveBeenCalledWith(mockApp, 'new-name.md', { forceWait: true });
    });

    it('should rename file at root level', async () => {
      const file = createMockFile('old-name.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/old-name.md/rename')
        .send({ newName: 'new-name.md' });

      expect(res.status).toBe(200);
      expect(res.body.newPath).toBe('new-name.md');
    });

    it('should return 404 for non-existent file', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/nonexistent.md/rename')
        .send({ newName: 'new-name.md' });

      expect(res.status).toBe(404);
    });

    it('should return 409 if target name already exists', async () => {
      const file1 = createMockFile('file1.md');
      const file2 = createMockFile('file2.md');
      const rootFolder = createMockFolder('', [file1, file2]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/file1.md/rename')
        .send({ newName: 'file2.md' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Target path already exists');
    });

    it('should return 400 when newName is missing', async () => {
      const file = createMockFile('source.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app).post('/vault/source.md/rename').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('newName is required in request body');
    });

    it('should return 400 when newName is not a string', async () => {
      const file = createMockFile('source.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/source.md/rename')
        .send({ newName: { name: 'bad' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('newName is required in request body');
    });

    it('should return 404 when path is missing (empty path becomes root)', async () => {
      const rootFolder = createMockFolder('', []);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      // Empty path results in 404 (file not found) because the route pattern
      // /*/rename requires at least one character
      const res = await request(app).post('/vault//rename').send({ newName: 'new.md' });

      expect(res.status).toBe(404);
    });

    it('should reject path traversal in newName', async () => {
      const file = createMockFile('source.md');
      const rootFolder = createMockFolder('', [file]);
      const mockApp = createMockAppWithTree(rootFolder);
      const app = createTestApp(mockApp, 'move-rename');

      const res = await request(app)
        .post('/vault/source.md/rename')
        .send({ newName: '../../../malicious.md' });

      expect(res.status).toBe(400);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Vault Router Error Handling', () => {
  it('should handle vault.read errors gracefully', async () => {
    const file = createMockFile('error.md');
    const rootFolder = createMockFolder('', [file]);
    const mockApp = createMockAppWithTree(rootFolder);

    // Make vault.read throw an error
    mockApp.vault.read = vi.fn().mockRejectedValue(new Error('Read failed'));

    const app = createTestApp(mockApp);
    const res = await request(app).get('/vault/error.md');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('should handle vault.modify errors gracefully', async () => {
    const file = createMockFile('error.md');
    const rootFolder = createMockFolder('', [file]);
    const mockApp = createMockAppWithTree(rootFolder);

    // Make vault.modify throw an error
    mockApp.vault.modify = vi.fn().mockRejectedValue(new Error('Modify failed'));

    const app = createTestApp(mockApp);
    const res = await request(app)
      .put('/vault/error.md')
      .set('Content-Type', 'text/markdown')
      .send('content');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('should handle vault.create errors gracefully', async () => {
    const rootFolder = createMockFolder('', []);
    const mockApp = createMockAppWithTree(rootFolder);

    // Make vault.create throw an error
    mockApp.vault.create = vi.fn().mockRejectedValue(new Error('Create failed'));

    const app = createTestApp(mockApp);
    const res = await request(app)
      .put('/vault/new.md')
      .set('Content-Type', 'text/markdown')
      .send('content');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('should handle vault.delete errors gracefully', async () => {
    const file = createMockFile('error.md');
    const rootFolder = createMockFolder('', [file]);
    const mockApp = createMockAppWithTree(rootFolder);

    // Make vault.delete throw an error
    mockApp.vault.delete = vi.fn().mockRejectedValue(new Error('Delete failed'));

    const app = createTestApp(mockApp);
    const res = await request(app).delete('/vault/error.md');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('should handle fileManager.renameFile errors gracefully', async () => {
    const file = createMockFile('source.md');
    const rootFolder = createMockFolder('', [file]);
    const mockApp = createMockAppWithTree(rootFolder);

    // Make fileManager.renameFile throw an error
    mockApp.fileManager.renameFile = vi.fn().mockRejectedValue(new Error('Rename failed'));

    const app = createTestApp(mockApp, 'move-rename');
    const res = await request(app)
      .post('/vault/source.md/move')
      .send({ newPath: 'target.md' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});
