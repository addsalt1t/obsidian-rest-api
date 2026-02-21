/**
 * Vector route handler
 *
 * TF-IDF 기반 시맨틱 검색 엔드포인트
 */
import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { validatePath } from '../utils/path-validation';
import { getEmbeddingStatus, embed, vectorSearch } from '../services/vector';

export function createVectorRouter(app: App): Router {
  const router = Router();

  // GET /vector/status
  router.get('/status', asyncHandler(async (req: Request, res: Response) => {
    const basePath = typeof req.query.basePath === 'string' ? req.query.basePath : undefined;
    if (basePath !== undefined) validatePath(basePath);
    const result = await getEmbeddingStatus(app, basePath);
    res.json(result);
    return;
  }));

  // POST /vector/embed
  router.post('/embed', asyncHandler(async (req: Request, res: Response) => {
    const { basePath, paths, force } = req.body;

    // Input validation
    if (basePath !== undefined && typeof basePath !== 'string') {
      throw Errors.badRequest('basePath must be a string');
    }
    if (basePath !== undefined && typeof basePath === 'string') {
      validatePath(basePath);
    }
    if (paths !== undefined) {
      if (!Array.isArray(paths) || paths.some((p: unknown) => typeof p !== 'string')) {
        throw Errors.badRequest('paths must be an array of strings');
      }
      if (paths.length > 200) {
        throw Errors.badRequest('Maximum 200 paths per embed request');
      }
    }

    const result = await embed(app, { basePath, paths, force });
    res.json(result);
    return;
  }));

  // POST /vector/search
  router.post('/search', asyncHandler(async (req: Request, res: Response) => {
    const { query, basePath, limit, threshold, frontmatterFilter } = req.body;
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw Errors.badRequest('query must be a non-empty string');
    }
    if (basePath !== undefined && typeof basePath !== 'string') {
      throw Errors.badRequest('basePath must be a string');
    }
    if (basePath !== undefined && typeof basePath === 'string') {
      validatePath(basePath);
    }
    const normalizedQuery = query.trim();

    // Check if embeddings exist before attempting search
    const status = await getEmbeddingStatus(app, basePath);
    if (status.embeddedDocuments === 0) {
      throw Errors.conflict('No embeddings found. Call POST /vector/embed first to generate embeddings.');
    }

    const result = await vectorSearch(app, {
      query: normalizedQuery,
      basePath,
      limit,
      threshold,
      frontmatterFilter,
    });
    res.json(result);
    return;
  }));

  return router;
}
