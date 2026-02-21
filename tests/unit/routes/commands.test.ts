import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createCommandsRouter, createOpenRouter } from '../../../src/routes/commands';
import { TFile, type App } from 'obsidian';
import { createMockApp, createRouterTestApp } from '../../helpers';

function createCommandsMockApp(options: {
  commands?: Record<string, { name: string }>;
  executeCommandById?: (id: string) => unknown;
  fileExists?: boolean;
  openFile?: () => Promise<void>;
}): App {
  const {
    commands = {},
    executeCommandById = vi.fn(),
    fileExists = false,
    openFile = vi.fn(() => Promise.resolve()),
  } = options;

  return createMockApp({
    commands: {
      commands,
      executeCommandById,
    },
    vault: {
      getAbstractFileByPath: vi.fn((path: string) => {
        // Return TFile instance for paths containing 'existing'
        if (fileExists || path.includes('existing')) {
          return new TFile(path);
        }
        return null;
      }),
    },
    workspace: {
      getLeaf: vi.fn(() => ({
        openFile,
      })),
    },
  });
}

function createTestApp(mockApp: App, type: 'commands' | 'open' = 'commands') {
  if (type === 'commands') {
    return createRouterTestApp(createCommandsRouter(mockApp), '/commands');
  }
  return createRouterTestApp(createOpenRouter(mockApp), '/open');
}

describe('Commands Router', () => {
  describe('GET /commands/', () => {
    it('should return list of commands sorted by name', async () => {
      const mockApp = createCommandsMockApp({
        commands: {
          'editor:bold': { name: 'Bold' },
          'app:quit': { name: 'Quit' },
          'editor:italic': { name: 'Italic' },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/commands/');

      expect(res.status).toBe(200);
      expect(res.body.commands).toHaveLength(3);
      // Sorted by name
      expect(res.body.commands[0].name).toBe('Bold');
      expect(res.body.commands[1].name).toBe('Italic');
      expect(res.body.commands[2].name).toBe('Quit');
    });

    it('should return empty array when no commands', async () => {
      const mockApp = createCommandsMockApp({ commands: {} });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/commands/');

      expect(res.status).toBe(200);
      expect(res.body.commands).toEqual([]);
    });

    it('should use id as name if name is missing', async () => {
      const mockApp = createCommandsMockApp({
        commands: {
          'custom:command': { name: '' },
        },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).get('/commands/');

      expect(res.status).toBe(200);
      expect(res.body.commands[0].id).toBe('custom:command');
      expect(res.body.commands[0].name).toBe('custom:command');
    });
  });

  describe('POST /commands/:commandId', () => {
    it('should execute command and return success', async () => {
      const executeCommandById = vi.fn(() => true);
      const mockApp = createCommandsMockApp({
        commands: { 'editor:bold': { name: 'Bold' } },
        executeCommandById,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).post('/commands/editor:bold');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Command executed');
      expect(res.body.commandId).toBe('editor:bold');
      expect(executeCommandById).toHaveBeenCalledWith('editor:bold');
    });

    it('should return 404 for unknown command', async () => {
      const mockApp = createCommandsMockApp({ commands: {} });
      const app = createTestApp(mockApp);

      const res = await request(app).post('/commands/unknown:command');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Command not found');
    });

    it('should return 400 when command ID is empty', async () => {
      const mockApp = createCommandsMockApp({});
      const app = createTestApp(mockApp);

      const res = await request(app).post('/commands/');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
      expect(res.body.message).toBe('Command ID is required');
    });

    it('should block dangerous commands', async () => {
      const mockApp = createCommandsMockApp({
        commands: { 'app:delete-vault': { name: 'Delete Vault' } },
      });
      const app = createTestApp(mockApp);

      const res = await request(app).post('/commands/app:delete-vault');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(res.body.message).toBe('This command is blocked for security reasons');
    });

    it('should handle trailing slash in command ID', async () => {
      const executeCommandById = vi.fn(() => true);
      const mockApp = createCommandsMockApp({
        commands: { 'editor:save': { name: 'Save' } },
        executeCommandById,
      });
      const app = createTestApp(mockApp);

      const res = await request(app).post('/commands/editor:save/');

      expect(res.status).toBe(200);
      expect(res.body.commandId).toBe('editor:save');
    });
  });
});

describe('Open Router', () => {
  describe('POST /open/:path', () => {
    it('should open existing file', async () => {
      const openFile = vi.fn(() => Promise.resolve());
      const mockApp = createCommandsMockApp({ openFile });
      const app = createTestApp(mockApp, 'open');

      const res = await request(app).post('/open/notes/existing');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('File opened');
      expect(res.body.path).toBe('notes/existing.md');
    });

    it('should return 404 for non-existent file', async () => {
      const mockApp = createCommandsMockApp({});
      const app = createTestApp(mockApp, 'open');

      const res = await request(app).post('/open/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('File not found');
    });

    it('should return 400 when path is empty', async () => {
      const mockApp = createCommandsMockApp({});
      const app = createTestApp(mockApp, 'open');

      const res = await request(app).post('/open/');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
      expect(res.body.message).toBe('Path is required');
    });

    it('should handle newLeaf query parameter', async () => {
      const openFile = vi.fn(() => Promise.resolve());
      const mockApp = createCommandsMockApp({ openFile });
      const app = createTestApp(mockApp, 'open');

      const res = await request(app).post('/open/notes/existing?newLeaf=true');

      expect(res.status).toBe(200);
      expect(res.body.newLeaf).toBe(true);
    });

    it('should handle newLeaf in request body', async () => {
      const openFile = vi.fn(() => Promise.resolve());
      const mockApp = createCommandsMockApp({ openFile });
      const app = createTestApp(mockApp, 'open');

      const res = await request(app)
        .post('/open/notes/existing')
        .send({ newLeaf: true });

      expect(res.status).toBe(200);
      expect(res.body.newLeaf).toBe(true);
    });

    it('should reject path traversal attempts with encoded dots', async () => {
      const mockApp = createCommandsMockApp({});
      const app = createTestApp(mockApp, 'open');

      // Use URL-encoded path traversal: %2e%2e = ..
      const res = await request(app).post('/open/%2e%2e/%2e%2e/etc/passwd');

      // Express normalizes URL, so the path becomes etc/passwd which is not found
      expect(res.status).toBe(404);
    });
  });
});
