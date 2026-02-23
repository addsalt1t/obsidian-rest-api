import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { createPeriodicRouter } from '../../../src/routes/periodic';
import { MIME_TYPE } from '../../../src/constants';
import { createMockApp, createRouterTestApp } from '../../helpers';

interface PeriodicPluginSettings {
  daily: { folder: string; format: string; template: string };
  weekly: { folder: string; format: string; template: string };
  monthly: { folder: string; format: string; template: string };
  quarterly: { folder: string; format: string; template: string };
  yearly: { folder: string; format: string; template: string };
}

interface PeriodicHarness {
  app: ReturnType<typeof createRouterTestApp>;
  mockApp: App;
  vaultSpies: {
    create: ReturnType<typeof vi.fn>;
    modify: ReturnType<typeof vi.fn>;
    createFolder: ReturnType<typeof vi.fn>;
  };
}

function createPeriodicHarness(options?: {
  files?: Array<{ path: string; content: string }>;
  pluginSettings?: PeriodicPluginSettings;
}): PeriodicHarness {
  const files = new Map<string, { file: TFile; content: string }>();
  const folders = new Set<string>();

  for (const file of options?.files ?? []) {
    const normalized = normalizePath(file.path);
    files.set(normalized, { file: new TFile(normalized), content: file.content });
    const folderPath = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
    if (folderPath) folders.add(folderPath);
  }

  const mockApp = createMockApp();
  const vault = mockApp.vault as unknown as Record<string, unknown>;
  const metadataCache = mockApp.metadataCache as unknown as Record<string, unknown>;

  const read = vi.fn(async (file: TFile) => files.get(file.path)?.content ?? '');
  const create = vi.fn(async (path: string, content: string) => {
    const normalized = normalizePath(path);
    const file = new TFile(normalized);
    files.set(normalized, { file, content });
    const folderPath = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
    if (folderPath) folders.add(folderPath);
    return file;
  });
  const modify = vi.fn(async (file: TFile, content: string) => {
    files.set(file.path, { file, content });
  });
  const createFolder = vi.fn(async (path: string) => {
    folders.add(normalizePath(path));
  });

  vault.getAbstractFileByPath = vi.fn((path: string) => {
    const normalized = normalizePath(path);
    const file = files.get(normalized);
    if (file) return file.file;
    if (folders.has(normalized)) return new TFolder(normalized);
    return null;
  });
  vault.read = read;
  vault.create = create;
  vault.modify = modify;
  vault.createFolder = createFolder;

  metadataCache.getFileCache = vi.fn((file: TFile) => (files.has(file.path) ? {} : null));

  if (options?.pluginSettings) {
    (mockApp as unknown as { plugins?: unknown }).plugins = {
      plugins: {
        'periodic-notes': {
          settings: options.pluginSettings,
        },
      },
    };
  }

  const app = createRouterTestApp(createPeriodicRouter(mockApp), '/periodic');

  return {
    app,
    mockApp,
    vaultSpies: {
      create,
      modify,
      createFolder,
    },
  };
}

describe('Periodic Router', () => {
  it('reads an existing daily note as markdown', async () => {
    const harness = createPeriodicHarness({
      files: [{ path: '2026-02-17.md', content: '# Daily\n\nhello' }],
    });

    const res = await request(harness.app).get('/periodic/daily/2026/2/17/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('# Daily');
    expect(res.headers['content-type']).toContain('text/markdown');
  });

  it('reads an existing daily note as note+json when requested', async () => {
    const harness = createPeriodicHarness({
      files: [{ path: '2026-02-17.md', content: '# Daily\n\nhello' }],
    });

    const res = await request(harness.app)
      .get('/periodic/daily/2026/2/17/')
      .set('Accept', MIME_TYPE.NOTE_JSON);

    expect(res.status).toBe(200);
    expect(res.body.path).toBe('2026-02-17.md');
    expect(res.body.content).toContain('# Daily');
  });

  it('creates a periodic note and parent folder using periodic plugin settings', async () => {
    const harness = createPeriodicHarness({
      pluginSettings: {
        daily: { folder: 'journal/daily', format: 'YYYY-MM-DD', template: '' },
        weekly: { folder: '', format: 'YYYY-[W]ww', template: '' },
        monthly: { folder: '', format: 'YYYY-MM', template: '' },
        quarterly: { folder: '', format: 'YYYY-[Q]Q', template: '' },
        yearly: { folder: '', format: 'YYYY', template: '' },
      },
    });

    const res = await request(harness.app)
      .put('/periodic/daily/2026/2/17/')
      .set('Content-Type', 'text/markdown')
      .send('# Created');

    expect(res.status).toBe(201);
    expect(res.body.path).toBe('journal/daily/2026-02-17.md');
    expect(harness.vaultSpies.createFolder).toHaveBeenCalledWith('journal/daily');
    expect(harness.vaultSpies.create).toHaveBeenCalledWith('journal/daily/2026-02-17.md', '# Created');
  });

  it('returns 404 when appending to a missing periodic note', async () => {
    const harness = createPeriodicHarness();

    const res = await request(harness.app)
      .post('/periodic/daily/2026/2/17/')
      .send({ content: 'append me' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toContain('Periodic note not found');
  });

  it('returns 404 when patch target heading does not exist', async () => {
    const harness = createPeriodicHarness({
      files: [{ path: '2026-02-17.md', content: '# Existing\n\nBody' }],
    });

    const res = await request(harness.app)
      .patch('/periodic/daily/2026/2/17/?target=Missing')
      .set('Target-Type', 'heading')
      .set('Operation', 'replace')
      .send({ content: 'New heading body' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toContain("Heading 'Missing' not found");
  });

  it('returns 400 for an invalid periodic period', async () => {
    const harness = createPeriodicHarness();

    const res = await request(harness.app)
      .put('/periodic/not-a-period/2026/2/17/')
      .set('Content-Type', 'text/markdown')
      .send('ignored');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BAD_REQUEST');
  });
});
