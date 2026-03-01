import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { ERROR_MSG } from '../constants';
import { resolveSafeFilePathWithNormalized } from '../utils/file-helpers';
import { needsFallbackRead, buildMetadataResponse } from '../utils/response-builders';
import { getBacklinkCacheService } from '../services/backlinkCache';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { extractRequestPath } from './vault/utils';
import {
  DEFAULT_RESPONSE_POLICY_SETTINGS,
  resolveMetadataFields,
  type MetadataField,
  type PolicySettingsProvider,
} from '../security/response-policy';

/**
 * Unified metadata router
 * GET /metadata/{path} - Return all metadata for a file in a single response
 */
export function createMetadataRouter(
  app: App,
  getPolicySettings: PolicySettingsProvider = () => DEFAULT_RESPONSE_POLICY_SETTINGS,
): Router {
  const router = Router();

  // GET /metadata/{path} - Unified metadata retrieval
  router.get('/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        throw Errors.badRequest(ERROR_MSG.PATH_REQUIRED);
      }

      const { file, normalizedPath } = resolveSafeFilePathWithNormalized(app, requestPath);
      if (!file) {
        throw Errors.notFound('File');
      }

      const includeFields = resolveMetadataFields(req, getPolicySettings());
      const includeBacklinks = includeFields.has('backlinks');
      const metadataFields = new Set(
        [...includeFields].filter((field): field is Exclude<MetadataField, 'backlinks'> => field !== 'backlinks')
      );

      // Only call vault.read when cache is incomplete (avoid unnecessary I/O)
      const needsFrontmatterOrTags = metadataFields.has('frontmatter') || metadataFields.has('tags');
      const content = (needsFrontmatterOrTags && needsFallbackRead(app, file))
        ? await app.vault.read(file)
        : '';

      const base = buildMetadataResponse(app, file, normalizedPath, content, {
        includeFields: metadataFields,
      });

      if (!includeBacklinks) {
        res.json(base);
        return;
      }

      const backlinkIndex = getBacklinkCacheService(app).getIndex();
      const backlinks = backlinkIndex.get(normalizedPath) || [];

      res.json({ ...base, backlinks });
      return;
    }));

  return router;
}
