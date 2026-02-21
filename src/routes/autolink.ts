/**
 * Autolink route handler
 *
 * Endpoints for detecting unlinked entities (scan) and auto-converting to wikilinks (linkify)
 */
import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { validatePath } from '../utils/path-validation';
import { scan, linkify } from '../services/autolink';

export function createAutolinkRouter(app: App): Router {
  const router = Router();

  // POST /autolink/scan
  router.post('/scan', asyncHandler(async (req: Request, res: Response) => {
    const { entitySourcePaths, targetPaths } = req.body;
    if (!entitySourcePaths || !Array.isArray(entitySourcePaths) || entitySourcePaths.length === 0) {
      throw Errors.badRequest('entitySourcePaths is required and must be a non-empty array');
    }
    if (entitySourcePaths.some((p: unknown) => typeof p !== 'string')) {
      throw Errors.badRequest('entitySourcePaths must contain only strings');
    }
    entitySourcePaths.forEach((p: string) => validatePath(p));
    if (Array.isArray(targetPaths)) {
      targetPaths.forEach((p: unknown) => { if (typeof p === 'string') validatePath(p); });
    }
    const result = await scan(app, { entitySourcePaths, targetPaths });
    res.json(result);
    return;
  }));

  // POST /autolink/linkify
  router.post('/linkify', asyncHandler(async (req: Request, res: Response) => {
    const { entitySourcePaths, targetPaths, dryRun, autoConfirm } = req.body;
    if (!entitySourcePaths || !Array.isArray(entitySourcePaths) || entitySourcePaths.length === 0) {
      throw Errors.badRequest('entitySourcePaths is required and must be a non-empty array');
    }
    if (entitySourcePaths.some((p: unknown) => typeof p !== 'string')) {
      throw Errors.badRequest('entitySourcePaths must contain only strings');
    }
    entitySourcePaths.forEach((p: string) => validatePath(p));
    if (Array.isArray(targetPaths)) {
      targetPaths.forEach((p: unknown) => { if (typeof p === 'string') validatePath(p); });
    }
    const result = await linkify(app, { entitySourcePaths, targetPaths, dryRun, autoConfirm });
    res.json(result);
    return;
  }));

  return router;
}
