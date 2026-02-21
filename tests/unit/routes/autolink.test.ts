import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the autolink service barrel export
vi.mock('../../../src/services/autolink', () => ({
  scan: vi.fn(),
  linkify: vi.fn(),
}));

// Mock logger (used by asyncHandler)
vi.mock('../../../src/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { createAutolinkRouter } from '../../../src/routes/autolink';
import { scan, linkify } from '../../../src/services/autolink';
import { createMockApp } from '../../helpers/mock-app';
import { createRouterTestApp } from '../../helpers';

function createTestApp() {
  const mockApp = createMockApp();
  return createRouterTestApp(createAutolinkRouter(mockApp), '/autolink');
}

describe('Autolink Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // POST /autolink/scan
  // ---------------------------------------------------------------------------

  describe('POST /autolink/scan', () => {
    it('should return 400 when entitySourcePaths is missing', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/scan')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('entitySourcePaths');
    });

    it('should return 400 when entitySourcePaths is not an array', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/scan')
        .send({ entitySourcePaths: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('entitySourcePaths');
    });

    it('should return 400 when entitySourcePaths is empty array', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/scan')
        .send({ entitySourcePaths: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('entitySourcePaths');
    });

    it('should return 400 when entitySourcePaths contains non-string elements', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/scan')
        .send({ entitySourcePaths: [123, 'valid'] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('strings');
      expect(scan).not.toHaveBeenCalled();
    });

    it('should return 200 with valid request', async () => {
      const app = createTestApp();
      const mockResult = {
        matches: [
          {
            entityName: 'Hero',
            entityPath: 'entities/hero.md',
            matchedText: 'Hero',
            filePath: 'stories/chapter1.md',
            line: 5,
            column: 10,
            context: 'The Hero walked in.',
            confidence: 'high',
          },
        ],
        totalFiles: 3,
        totalMatches: 1,
        byEntity: { Hero: 1 },
      };
      vi.mocked(scan).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/autolink/scan')
        .send({ entitySourcePaths: ['entities'] });

      expect(res.status).toBe(200);
      expect(res.body.matches).toHaveLength(1);
      expect(res.body.totalFiles).toBe(3);
      expect(res.body.totalMatches).toBe(1);
      expect(res.body.byEntity.Hero).toBe(1);
    });

    it('should pass entitySourcePaths and targetPaths to scan service', async () => {
      const app = createTestApp();
      vi.mocked(scan).mockResolvedValue({
        matches: [],
        totalFiles: 0,
        totalMatches: 0,
        byEntity: {},
      });

      await request(app)
        .post('/autolink/scan')
        .send({
          entitySourcePaths: ['entities', 'characters'],
          targetPaths: ['stories'],
        });

      expect(scan).toHaveBeenCalledWith(
        expect.anything(),
        {
          entitySourcePaths: ['entities', 'characters'],
          targetPaths: ['stories'],
        }
      );
    });

    it('should return 500 when scan service throws', async () => {
      const app = createTestApp();
      vi.mocked(scan).mockRejectedValue(new Error('Scan failed'));

      const res = await request(app)
        .post('/autolink/scan')
        .send({ entitySourcePaths: ['entities'] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /autolink/linkify
  // ---------------------------------------------------------------------------

  describe('POST /autolink/linkify', () => {
    it('should return 400 when entitySourcePaths is missing', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/linkify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('entitySourcePaths');
    });

    it('should return 400 when entitySourcePaths is empty array', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/linkify')
        .send({ entitySourcePaths: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('entitySourcePaths');
    });

    it('should return 400 when entitySourcePaths contains non-string elements', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/linkify')
        .send({ entitySourcePaths: [null, 'valid'] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('strings');
      expect(linkify).not.toHaveBeenCalled();
    });

    it('should return 200 with valid request', async () => {
      const app = createTestApp();
      const mockResult = {
        changes: [
          {
            filePath: 'stories/chapter1.md',
            line: 5,
            before: 'Hero',
            after: '[[Hero]]',
            applied: true,
          },
        ],
        filesModified: 1,
        totalChanges: 1,
        skipped: 0,
      };
      vi.mocked(linkify).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/autolink/linkify')
        .send({ entitySourcePaths: ['entities'] });

      expect(res.status).toBe(200);
      expect(res.body.changes).toHaveLength(1);
      expect(res.body.filesModified).toBe(1);
      expect(res.body.totalChanges).toBe(1);
    });

    it('should pass dryRun and autoConfirm to linkify service', async () => {
      const app = createTestApp();
      vi.mocked(linkify).mockResolvedValue({
        changes: [],
        filesModified: 0,
        totalChanges: 0,
        skipped: 0,
      });

      await request(app)
        .post('/autolink/linkify')
        .send({
          entitySourcePaths: ['entities'],
          targetPaths: ['stories'],
          dryRun: true,
          autoConfirm: true,
        });

      expect(linkify).toHaveBeenCalledWith(
        expect.anything(),
        {
          entitySourcePaths: ['entities'],
          targetPaths: ['stories'],
          dryRun: true,
          autoConfirm: true,
        }
      );
    });

    it('should pass request body options through to the service', async () => {
      const app = createTestApp();
      vi.mocked(linkify).mockResolvedValue({
        changes: [],
        filesModified: 0,
        totalChanges: 0,
        skipped: 0,
      });

      await request(app)
        .post('/autolink/linkify')
        .send({
          entitySourcePaths: ['entities'],
          dryRun: false,
          autoConfirm: false,
        });

      expect(linkify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          entitySourcePaths: ['entities'],
          dryRun: false,
          autoConfirm: false,
        })
      );
    });

    it('should return 500 when linkify service throws', async () => {
      const app = createTestApp();
      vi.mocked(linkify).mockRejectedValue(new Error('Linkify failed'));

      const res = await request(app)
        .post('/autolink/linkify')
        .send({ entitySourcePaths: ['entities'] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // Path traversal validation
  // ---------------------------------------------------------------------------

  describe('path traversal validation', () => {
    it('should return 400 when entitySourcePaths contains path traversal', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/scan')
        .send({ entitySourcePaths: ['../../secrets'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
      expect(scan).not.toHaveBeenCalled();
    });

    it('should return 400 when targetPaths contains path traversal', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/autolink/linkify')
        .send({ entitySourcePaths: ['entities'], targetPaths: ['../outside'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
      expect(linkify).not.toHaveBeenCalled();
    });
  });
});
