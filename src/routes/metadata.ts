import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { HTTP_STATUS, ERROR_MSG } from '../constants';
import { resolveSafeFilePathWithNormalized } from '../utils/file-helpers';
import { needsFallbackRead, buildMetadataResponse } from '../utils/response-builders';
import { getBacklinkCacheService } from '../services/backlinkCache';
import { asyncHandler } from '../middleware/asyncHandler';
import { extractRequestPath } from './vault/utils';

/**
 * Unified metadata router
 * GET /metadata/{path} - Return all metadata for a file in a single response
 */
export function createMetadataRouter(app: App): Router {
  const router = Router();

  // GET /metadata/{path} - Unified metadata retrieval
  router.get('/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MSG.PATH_REQUIRED });
      }

      const { file, normalizedPath } = resolveSafeFilePathWithNormalized(app, requestPath);
      if (!file) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_MSG.FILE_NOT_FOUND });
      }

      // Only call vault.read when cache is incomplete (avoid unnecessary I/O)
      const content = needsFallbackRead(app, file)
        ? await app.vault.read(file)
        : '';

      const base = buildMetadataResponse(app, file, normalizedPath, content);

      // Backlinks (O(1) lookup using reverse index)
      const backlinkIndex = getBacklinkCacheService(app).getIndex();
      const backlinks = backlinkIndex.get(normalizedPath) || [];

      res.json({ ...base, backlinks });
      return;
    }));

  return router;
}
