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

/**
 * Validates entitySourcePaths (required, non-empty string[]) and targetPaths (optional string[]).
 * Throws ApiError on invalid input.
 */
function validateAutolinkPaths(body: Record<string, unknown>): {
  entitySourcePaths: string[];
  targetPaths: string[] | undefined;
} {
  const { entitySourcePaths, targetPaths } = body;
  if (!entitySourcePaths || !Array.isArray(entitySourcePaths) || entitySourcePaths.length === 0) {
    throw Errors.badRequest('entitySourcePaths is required and must be a non-empty array');
  }
  if (entitySourcePaths.some((p: unknown) => typeof p !== 'string')) {
    throw Errors.badRequest('entitySourcePaths must contain only strings');
  }
  entitySourcePaths.forEach((p: string) => validatePath(p));
  if (Array.isArray(targetPaths)) {
    if (targetPaths.some((p: unknown) => typeof p !== 'string')) {
      throw Errors.badRequest('targetPaths must contain only strings');
    }
    targetPaths.forEach((p: string) => validatePath(p));
  }
  return {
    entitySourcePaths: entitySourcePaths as string[],
    targetPaths: Array.isArray(targetPaths) ? targetPaths as string[] : undefined,
  };
}

export function createAutolinkRouter(app: App): Router {
  const router = Router();

  // POST /autolink/scan
  router.post('/scan', asyncHandler(async (req: Request, res: Response) => {
    const { entitySourcePaths, targetPaths } = validateAutolinkPaths(req.body);
    const result = await scan(app, { entitySourcePaths, targetPaths });
    res.json(result);
    return;
  }));

  // POST /autolink/linkify
  router.post('/linkify', asyncHandler(async (req: Request, res: Response) => {
    const { dryRun, autoConfirm } = req.body;
    const { entitySourcePaths, targetPaths } = validateAutolinkPaths(req.body);
    const result = await linkify(app, { entitySourcePaths, targetPaths, dryRun, autoConfirm });
    res.json(result);
    return;
  }));

  return router;
}
