import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the vector service barrel export
vi.mock('../../../src/services/vector', () => ({
  getEmbeddingStatus: vi.fn(),
  embed: vi.fn(),
  vectorSearch: vi.fn(),
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

import { createVectorRouter } from '../../../src/routes/vector';
import { getEmbeddingStatus, embed, vectorSearch } from '../../../src/services/vector';
import { createMockApp } from '../../helpers/mock-app';
import { createRouterTestApp } from '../../helpers';

function createTestApp() {
  const mockApp = createMockApp();
  return createRouterTestApp(createVectorRouter(mockApp), '/vector');
}

describe('Vector Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // GET /vector/status
  // ---------------------------------------------------------------------------

  describe('GET /vector/status', () => {
    it('should return 200 with default status', async () => {
      const app = createTestApp();
      const mockStatus = {
        totalDocuments: 10,
        embeddedDocuments: 5,
        pendingDocuments: 5,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '5/500',
      };
      vi.mocked(getEmbeddingStatus).mockResolvedValue(mockStatus);

      const res = await request(app).get('/vector/status');

      expect(res.status).toBe(200);
      expect(res.body.totalDocuments).toBe(10);
      expect(res.body.embeddedDocuments).toBe(5);
      expect(res.body.pendingDocuments).toBe(5);
      expect(res.body.modelName).toBe('tfidf-local');
    });

    it('should pass basePath query parameter to service', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 3,
        embeddedDocuments: 1,
        pendingDocuments: 2,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '1/500',
      });

      await request(app).get('/vector/status?basePath=docs');

      expect(getEmbeddingStatus).toHaveBeenCalledWith(
        expect.anything(),
        'docs'
      );
    });

    it('should call getEmbeddingStatus without basePath when not provided', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 0,
        embeddedDocuments: 0,
        pendingDocuments: 0,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '0/500',
      });

      await request(app).get('/vector/status');

      expect(getEmbeddingStatus).toHaveBeenCalledWith(
        expect.anything(),
        undefined
      );
    });

    it('should return 500 when service throws', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockRejectedValue(new Error('Status failed'));

      const res = await request(app).get('/vector/status');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /vector/embed
  // ---------------------------------------------------------------------------

  describe('POST /vector/embed', () => {
    it('should return 200 with empty body', async () => {
      const app = createTestApp();
      vi.mocked(embed).mockResolvedValue({
        success: true,
        processed: 5,
        skipped: 0,
        errors: [],
      });

      const res = await request(app)
        .post('/vector/embed')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.processed).toBe(5);
    });

    it('should pass basePath, paths, and force to embed service', async () => {
      const app = createTestApp();
      vi.mocked(embed).mockResolvedValue({
        success: true,
        processed: 1,
        skipped: 0,
        errors: [],
      });

      await request(app)
        .post('/vector/embed')
        .send({
          basePath: 'docs',
          paths: ['docs/hero.md'],
          force: true,
        });

      expect(embed).toHaveBeenCalledWith(
        expect.anything(),
        {
          basePath: 'docs',
          paths: ['docs/hero.md'],
          force: true,
        }
      );
    });

    it('should return embed results with errors', async () => {
      const app = createTestApp();
      vi.mocked(embed).mockResolvedValue({
        success: true,
        processed: 3,
        skipped: 1,
        errors: ['docs/broken.md: File not found'],
      });

      const res = await request(app)
        .post('/vector/embed')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toContain('broken.md');
      expect(res.body.skipped).toBe(1);
    });

    it('should return 500 when embed service throws', async () => {
      const app = createTestApp();
      vi.mocked(embed).mockRejectedValue(new Error('Embed failed'));

      const res = await request(app)
        .post('/vector/embed')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });

    it('should return 400 when basePath is not a string', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/embed')
        .send({ basePath: 123 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('basePath');
      expect(embed).not.toHaveBeenCalled();
    });

    it('should return 400 when paths is not an array', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/embed')
        .send({ paths: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('paths');
      expect(embed).not.toHaveBeenCalled();
    });

    it('should return 400 when paths contains non-string elements', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/embed')
        .send({ paths: ['valid.md', 123] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('paths');
      expect(embed).not.toHaveBeenCalled();
    });

    it('should return 400 when paths exceeds 200 items', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/embed')
        .send({ paths: new Array(201).fill('file.md') });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('200');
      expect(embed).not.toHaveBeenCalled();
    });

    it('should accept valid paths array within limit', async () => {
      const app = createTestApp();
      vi.mocked(embed).mockResolvedValue({
        success: true,
        processed: 2,
        skipped: 0,
        errors: [],
      });

      const res = await request(app)
        .post('/vector/embed')
        .send({ paths: ['file1.md', 'file2.md'] });

      expect(res.status).toBe(200);
      expect(embed).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /vector/search
  // ---------------------------------------------------------------------------

  describe('POST /vector/search', () => {
    it('should return 400 when query is missing', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/search')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('query');
    });

    it('should return 400 when query is empty string', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/search')
        .send({ query: '' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('query');
    });

    it('should return 400 when query is not a string', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/search')
        .send({ query: { text: 'hero' } });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('query');
      expect(getEmbeddingStatus).not.toHaveBeenCalled();
      expect(vectorSearch).not.toHaveBeenCalled();
    });

    it('should return 400 when basePath is not a string', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/search')
        .send({ query: 'test', basePath: 123 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('basePath');
      expect(vectorSearch).not.toHaveBeenCalled();
    });

    it('should return 400 when query is whitespace-only string', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/search')
        .send({ query: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('query');
      expect(getEmbeddingStatus).not.toHaveBeenCalled();
      expect(vectorSearch).not.toHaveBeenCalled();
    });

    it('should return 200 with valid query', async () => {
      const app = createTestApp();
      const mockResult = {
        results: [
          {
            path: 'docs/hero.md',
            name: 'Hero',
            score: 0.85,
            frontmatter: { name: 'Hero', type: 'character' },
            excerpt: '...the brave hero fights...',
          },
        ],
        query: 'brave hero',
        totalSearched: 10,
      };
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 10,
        embeddedDocuments: 10,
        pendingDocuments: 0,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '10/500',
      });
      vi.mocked(vectorSearch).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/vector/search')
        .send({ query: 'brave hero' });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].score).toBe(0.85);
      expect(res.body.query).toBe('brave hero');
      expect(res.body.totalSearched).toBe(10);
    });

    it('should pass all options to vectorSearch service', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 10,
        embeddedDocuments: 10,
        pendingDocuments: 0,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '10/500',
      });
      vi.mocked(vectorSearch).mockResolvedValue({
        results: [],
        query: 'test',
        totalSearched: 0,
      });

      await request(app)
        .post('/vector/search')
        .send({
          query: 'test query',
          basePath: 'docs',
          limit: 5,
          threshold: 0.5,
          frontmatterFilter: { type: 'character' },
        });

      expect(vectorSearch).toHaveBeenCalledWith(
        expect.anything(),
        {
          query: 'test query',
          basePath: 'docs',
          limit: 5,
          threshold: 0.5,
          frontmatterFilter: { type: 'character' },
        }
      );
    });

    it('should pass frontmatterFilter to service', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 10,
        embeddedDocuments: 10,
        pendingDocuments: 0,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '10/500',
      });
      vi.mocked(vectorSearch).mockResolvedValue({
        results: [],
        query: 'filter test',
        totalSearched: 0,
      });

      const filter = { type: 'location', status: 'active' };

      await request(app)
        .post('/vector/search')
        .send({
          query: 'filter test',
          frontmatterFilter: filter,
        });

      expect(vectorSearch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          frontmatterFilter: filter,
        })
      );
    });

    it('should return 409 when no embeddings exist', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 10,
        embeddedDocuments: 0,
        pendingDocuments: 10,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '0/500',
      });

      const res = await request(app)
        .post('/vector/search')
        .send({ query: 'test' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CONFLICT');
      expect(res.body.message).toContain('/vector/embed');
      expect(vectorSearch).not.toHaveBeenCalled();
    });

    it('should return 409 when no embeddings exist in the requested basePath', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 3,
        embeddedDocuments: 0,
        pendingDocuments: 3,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '20/500',
      });

      const res = await request(app)
        .post('/vector/search')
        .send({ query: 'test', basePath: 'docs' });

      expect(getEmbeddingStatus).toHaveBeenCalledWith(
        expect.anything(),
        'docs'
      );
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CONFLICT');
      expect(vectorSearch).not.toHaveBeenCalled();
    });

    it('should return 500 when vectorSearch throws', async () => {
      const app = createTestApp();
      vi.mocked(getEmbeddingStatus).mockResolvedValue({
        totalDocuments: 10,
        embeddedDocuments: 5,
        pendingDocuments: 5,
        modelName: 'tfidf-local',
        cacheMaxSize: 500,
        cacheUsage: '5/500',
      });
      vi.mocked(vectorSearch).mockRejectedValue(
        new Error('Unexpected error')
      );

      const res = await request(app)
        .post('/vector/search')
        .send({ query: 'test' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
      expect(res.body.message).toBe('Internal server error');
    });
  });

  // ---------------------------------------------------------------------------
  // basePath path traversal validation
  // ---------------------------------------------------------------------------

  describe('basePath path traversal validation', () => {
    it('should return 400 when GET /status basePath contains path traversal', async () => {
      const app = createTestApp();

      const res = await request(app).get('/vector/status?basePath=../../secrets');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
      expect(getEmbeddingStatus).not.toHaveBeenCalled();
    });

    it('should return 400 when POST /embed basePath contains path traversal', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/embed')
        .send({ basePath: '../outside' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
      expect(embed).not.toHaveBeenCalled();
    });

    it('should return 400 when POST /search basePath contains path traversal', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/vector/search')
        .send({ query: 'test', basePath: '../../etc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
      expect(vectorSearch).not.toHaveBeenCalled();
    });
  });
});
