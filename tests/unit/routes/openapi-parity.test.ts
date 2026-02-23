import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { PARITY_CATALOG } from '@obsidian-workspace/shared-types';
import { createOpenApiRouter } from '../../../src/routes/openapi';
import { createTagsRouter } from '../../../src/routes/tags';
import { createDataviewRouter } from '../../../src/routes/dataview';
import { createVaultRouter, createFolderRouter, createMoveRenameRouter } from '../../../src/routes/vault';
import { createSearchRouter } from '../../../src/routes/search';
import { createActiveRouter } from '../../../src/routes/active';
import { createPeriodicRouter } from '../../../src/routes/periodic';
import { createCommandsRouter, createOpenRouter } from '../../../src/routes/commands';
import { createGraphRouter } from '../../../src/routes/graph';
import { createBatchRouter } from '../../../src/routes/batch';
import { createMetadataRouter } from '../../../src/routes/metadata';
import { createAutolinkRouter } from '../../../src/routes/autolink';
import { createVectorRouter } from '../../../src/routes/vector';
import { errorHandler } from '../../../src/middleware/error';
import { disposeTagCache } from '../../../src/services/tagCache';
import { disposeFileListCache } from '../../../src/services/fileListCache';
import { disposeBacklinkCache } from '../../../src/services/backlinkCache';
import { ERROR_CODE, ERROR_MSG, MIME_TYPE } from '../../../src/constants';
import { createMockApp } from '../../helpers';

function createRuntimeParityApp(obsidianApp: App): express.Express {
  const app = express();

  app.use(express.json({
    type: [MIME_TYPE.JSON, MIME_TYPE.JSONLOGIC],
  }));
  app.use(express.text({
    type: [MIME_TYPE.TEXT_MARKDOWN, MIME_TYPE.TEXT_PLAIN, MIME_TYPE.DATAVIEW_DQL],
  }));

  app.use('/tags', createTagsRouter(obsidianApp));
  app.use('/dataview', createDataviewRouter(obsidianApp));
  app.use('/vault/folder', createFolderRouter(obsidianApp));
  app.use('/vault', createMoveRenameRouter(obsidianApp));
  app.use('/vault', createVaultRouter(obsidianApp));
  app.use('/search', createSearchRouter(obsidianApp));
  app.use('/active', createActiveRouter(obsidianApp));
  app.use('/periodic', createPeriodicRouter(obsidianApp));
  app.use('/commands', createCommandsRouter(obsidianApp));
  app.use('/open', createOpenRouter(obsidianApp));
  app.use('/graph', createGraphRouter(obsidianApp));
  app.use('/batch', createBatchRouter(obsidianApp));
  app.use('/metadata', createMetadataRouter(obsidianApp));
  app.use('/autolink', createAutolinkRouter(obsidianApp));
  app.use('/vector', createVectorRouter(obsidianApp));

  app.use((_req, res) => {
    res.status(404).json({
      error: ERROR_CODE.NOT_FOUND,
      message: ERROR_MSG.ENDPOINT_NOT_FOUND,
    });
  });
  app.use(errorHandler);

  return app;
}

function createRuntimeParityMockApp(): App {
  const files = new Map<string, { file: TFile; content: string }>([
    ['notes/test.md', { file: new TFile('notes/test.md'), content: '# test\n\nbody' }],
  ]);
  const folders = new Set<string>(['notes']);
  const vaultListeners = new Set<(...args: unknown[]) => void>();
  const metadataListeners = new Set<(...args: unknown[]) => void>();
  const activeFile = files.get('notes/test.md')!.file;

  const mockApp = createMockApp();
  const vault = mockApp.vault as unknown as Record<string, unknown>;
  const metadataCache = mockApp.metadataCache as unknown as Record<string, unknown>;
  const commands = mockApp.commands as unknown as Record<string, unknown>;
  const workspace = mockApp.workspace as unknown as Record<string, unknown>;

  const getAbstractFileByPath = (rawPath: string) => {
    const path = normalizePath(rawPath);
    const file = files.get(path);
    if (file) return file.file;
    if (folders.has(path)) return new TFolder(path);
    return null;
  };

  vault.getAbstractFileByPath = vi.fn(getAbstractFileByPath);
  vault.getMarkdownFiles = vi.fn(() => Array.from(files.values()).map((entry) => entry.file));
  vault.getFiles = vi.fn(() => Array.from(files.values()).map((entry) => entry.file));
  vault.read = vi.fn(async (file: TFile) => files.get(file.path)?.content ?? '');
  vault.cachedRead = vi.fn(async (file: TFile) => files.get(file.path)?.content ?? '');
  vault.create = vi.fn(async (path: string, content: string) => {
    const normalized = normalizePath(path);
    const createdFile = new TFile(normalized);
    files.set(normalized, { file: createdFile, content });
    return createdFile;
  });
  vault.modify = vi.fn(async (file: TFile, content: string) => {
    files.set(file.path, { file, content });
  });
  vault.delete = vi.fn(async (file: TFile | TFolder) => {
    files.delete(file.path);
  });
  vault.on = vi.fn((_: string, callback: (...args: unknown[]) => void) => {
    vaultListeners.add(callback);
    return callback;
  });
  vault.offref = vi.fn((ref: unknown) => {
    vaultListeners.delete(ref as (...args: unknown[]) => void);
  });

  metadataCache.resolvedLinks = {};
  metadataCache.getFileCache = vi.fn((file: TFile) => (files.has(file.path) ? {} : null));
  metadataCache.getTags = vi.fn(() => ({ '#sample-tag': 1 }));
  metadataCache.on = vi.fn((_: string, callback: (...args: unknown[]) => void) => {
    metadataListeners.add(callback);
    return callback;
  });
  metadataCache.offref = vi.fn((ref: unknown) => {
    metadataListeners.delete(ref as (...args: unknown[]) => void);
  });

  workspace.getActiveViewOfType = vi.fn(() => ({ file: activeFile }));
  commands.commands = { 'editor:toggle-bold': { name: 'Toggle bold' } };
  (mockApp as unknown as { plugins?: unknown }).plugins = { plugins: {} };

  return mockApp;
}

function toRuntimePath(openApiPath: string): string {
  return openApiPath
    .replace('{path}', 'notes/test.md')
    .replace('{tag}', 'sample-tag')
    .replace('{period}', 'daily');
}

async function callParityEndpoint(
  app: express.Express,
  entry: (typeof PARITY_CATALOG)[number],
) {
  const runtimePath = toRuntimePath(entry.rest.openApiPath);
  const method = entry.rest.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  let req = request(app)[method](runtimePath);

  switch (entry.id) {
    case 'vault.batchRead':
      req = req.send({ paths: ['notes/test.md'] });
      break;
    case 'search.text':
      req = req.query({ query: 'test' });
      break;
    case 'search.jsonLogic':
      req = req
        .set('Content-Type', MIME_TYPE.JSON)
        .send({ '==': [1, 1] });
      break;
    case 'dataview.query':
      req = req
        .set('Content-Type', MIME_TYPE.DATAVIEW_DQL)
        .send('LIST FROM ""');
      break;
    case 'autolink.scan':
      req = req.send({
        entitySourcePaths: ['notes'],
        targetPaths: ['notes'],
      });
      break;
    default:
      break;
  }

  return req;
}

describe('OpenAPI parity gate', () => {
  beforeEach(() => {
    disposeTagCache();
    disposeFileListCache();
    disposeBacklinkCache();
  });

  afterEach(() => {
    disposeTagCache();
    disposeFileListCache();
    disposeBacklinkCache();
  });

  it('contains all REST paths declared in PARITY_CATALOG', async () => {
    const app = express();
    app.use(createOpenApiRouter());
    const res = await request(app).get('/openapi.json');
    const paths = res.body.paths as Record<string, Record<string, unknown>>;

    for (const entry of PARITY_CATALOG) {
      const pathDef = paths[entry.rest.openApiPath];
      expect(pathDef, `${entry.id} path missing`).toBeDefined();
      const methodKey = entry.rest.method.toLowerCase();
      expect(pathDef[methodKey], `${entry.id} method missing`).toBeDefined();
    }
  });

  it('maps every catalog REST entry to a mounted runtime route', async () => {
    const mockApp = createRuntimeParityMockApp();
    const app = createRuntimeParityApp(mockApp);

    for (const entry of PARITY_CATALOG) {
      const res = await callParityEndpoint(app, entry);
      const isFallback404 =
        res.status === 404 &&
        res.body?.error === ERROR_CODE.NOT_FOUND &&
        res.body?.message === ERROR_MSG.ENDPOINT_NOT_FOUND;

      expect(
        isFallback404,
        `${entry.id} is missing from runtime router mount: ${entry.rest.method} ${entry.rest.openApiPath}`
      ).toBe(false);

      expect(
        res.status,
        `${entry.id} returned 5xx for ${entry.rest.method} ${entry.rest.openApiPath}`
      ).toBeLessThan(500);
    }
  });
});
