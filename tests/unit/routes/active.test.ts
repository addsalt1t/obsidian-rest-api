import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createActiveRouter } from '../../../src/routes/active';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { createMockApp, createRouterTestApp } from '../../helpers';

vi.mock('../../../src/utils/metadata-ready', () => ({
  waitForMetadataReady: vi.fn().mockResolvedValue(true),
}));

function createMockFile(path: string): TFile {
  return new TFile(path) as unknown as TFile;
}

function buildActiveApp(activeFile: TFile | null, fileContent = ''): App {
  const view = activeFile ? { file: activeFile } : null;
  return createMockApp({
    workspace: {
      getActiveViewOfType: vi.fn().mockReturnValue(view),
    },
    vault: {
      read: vi.fn().mockResolvedValue(fileContent),
    },
    metadataCache: {
      getFileCache: vi.fn().mockReturnValue(null),
    },
  });
}

function createTestApp(mockApp: App) {
  return createRouterTestApp(createActiveRouter(mockApp), '/active');
}

describe('Active Router', () => {
  describe('GET /active/', () => {
    it('should return markdown text by default', async () => {
      const file = createMockFile('notes/active.md');
      const mockApp = buildActiveApp(file, '# Active Note\nContent here');
      const app = createTestApp(mockApp);

      const res = await request(app).get('/active/');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/markdown/);
      expect(res.text).toBe('# Active Note\nContent here');
    });

    it('should return JSON when Accept is note+json', async () => {
      const file = createMockFile('notes/active.md');
      const mockApp = buildActiveApp(file, '# Active Note\nContent');
      const app = createTestApp(mockApp);

      const res = await request(app)
        .get('/active/')
        .set('Accept', 'application/vnd.olrapi.note+json');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('notes/active.md');
      expect(res.body.content).toBe('# Active Note\nContent');
    });

    it('should return 404 when no active file', async () => {
      const mockApp = buildActiveApp(null);
      const app = createTestApp(mockApp);

      const res = await request(app).get('/active/');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  describe('PUT /active/', () => {
    it('should overwrite content', async () => {
      const file = createMockFile('notes/active.md');
      const mockApp = buildActiveApp(file, 'old content');
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/active/')
        .set('Content-Type', 'text/markdown')
        .send('new content');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Active file updated');
      expect(res.body.path).toBe('notes/active.md');
      expect(mockApp.vault.modify).toHaveBeenCalledWith(file, 'new content');
    });

    it('should return 404 when no active file', async () => {
      const mockApp = buildActiveApp(null);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .put('/active/')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  describe('POST /active/', () => {
    it('should append content', async () => {
      const file = createMockFile('notes/active.md');
      const mockApp = buildActiveApp(file, 'existing');
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/active/')
        .set('Content-Type', 'text/markdown')
        .send('appended');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Content appended to active file');
      expect(res.body.path).toBe('notes/active.md');
      expect(mockApp.vault.modify).toHaveBeenCalledWith(file, 'existing\nappended');
    });

    it('should return 404 when no active file', async () => {
      const mockApp = buildActiveApp(null);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .post('/active/')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /active/', () => {
    it('should patch content (fallback: full replacement)', async () => {
      const file = createMockFile('notes/active.md');
      const mockApp = buildActiveApp(file, '# Heading\nOld content');
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/active/')
        .set('Content-Type', 'text/markdown')
        .send('New full content');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Active file patched');
      expect(res.body.path).toBe('notes/active.md');
      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    it('should return 404 when target heading not found', async () => {
      const file = createMockFile('notes/active.md');
      const mockApp = buildActiveApp(file, '# Existing\nContent');
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/active/')
        .query({ target: 'Nonexistent' })
        .set('Content-Type', 'text/markdown')
        .set('Target-Type', 'heading')
        .send('replacement');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.details).toEqual({ file: 'notes/active.md' });
    });

    it('should return 404 when no active file', async () => {
      const mockApp = buildActiveApp(null);
      const app = createTestApp(mockApp);

      const res = await request(app)
        .patch('/active/')
        .set('Content-Type', 'text/markdown')
        .send('content');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /active/', () => {
    it('should delete active file', async () => {
      const file = createMockFile('notes/active.md');
      const mockApp = buildActiveApp(file);
      const app = createTestApp(mockApp);

      const res = await request(app).delete('/active/');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Active file deleted');
      expect(res.body.path).toBe('notes/active.md');
      expect(mockApp.vault.delete).toHaveBeenCalledWith(file);
    });

    it('should return 404 when no active file', async () => {
      const mockApp = buildActiveApp(null);
      const app = createTestApp(mockApp);

      const res = await request(app).delete('/active/');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });
});
