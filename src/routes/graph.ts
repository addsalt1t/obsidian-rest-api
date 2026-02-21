import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { ensureMarkdownPath } from '../utils/file-helpers';
import { parseIntParam } from '../utils/request-parsers';
import { validatePath } from '../utils/path-validation';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { getBacklinkCacheService } from '../services/backlinkCache';
import { extractRequestPath } from './vault/utils';

export function createGraphRouter(app: App): Router {
  const router = Router();

  // GET /graph/links/:path - Outbound links of a file
  router.get('/links/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        throw Errors.badRequest('Path is required');
      }

      // Path traversal validation
      validatePath(requestPath);

      const normalizedPath = ensureMarkdownPath(requestPath);
      const resolvedLinks = app.metadataCache.resolvedLinks;
      const links = resolvedLinks[normalizedPath];

      if (!links) {
        // Check if file exists (no TFile check needed)
        if (!app.vault.getAbstractFileByPath(normalizedPath)) {
          throw Errors.notFound('File');
        }
        // File exists but has no links
        return res.json({ path: normalizedPath, links: [], count: 0 });
      }

      const outlinks = Object.keys(links);
      res.json({ path: normalizedPath, links: outlinks, count: outlinks.length });
      return;
    }));

  // GET /graph/backlinks/:path - Backlinks referencing a file
  router.get('/backlinks/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        throw Errors.badRequest('Path is required');
      }

      // Path traversal validation
      validatePath(requestPath);

      const targetPath = ensureMarkdownPath(requestPath);

      // Check if file exists (no TFile check needed)
      if (!app.vault.getAbstractFileByPath(targetPath)) {
        throw Errors.notFound('File');
      }

      // O(1) lookup using reverse index
      const backlinkIndex = getBacklinkCacheService(app).getIndex();
      const backlinks = backlinkIndex.get(targetPath) || [];

      res.json({ path: targetPath, backlinks, count: backlinks.length });
      return;
    }));

  // GET /graph/orphans - Orphan notes with no links
  router.get('/orphans', asyncHandler(async (_req: Request, res: Response) => {
      const resolvedLinks = app.metadataCache.resolvedLinks;
      const allFiles = new Set(app.vault.getMarkdownFiles().map(f => f.path));
      const linkedFiles = new Set<string>();

      // Collect linked files (files linked from other files)
      for (const links of Object.values(resolvedLinks)) {
        for (const target of Object.keys(links)) {
          linkedFiles.add(target);
        }
      }

      // Orphan notes = files with no inlinks and no outlinks
      const orphans = [...allFiles].filter(f => {
        const hasInlinks = linkedFiles.has(f);
        const hasOutlinks = Object.keys(resolvedLinks[f] || {}).length > 0;
        return !hasInlinks && !hasOutlinks;
      });

      res.json({ orphans, count: orphans.length });
      return;
    }));

  // GET /graph/hubs?limit=10 - Most referenced hub notes
  router.get('/hubs', asyncHandler(async (req: Request, res: Response) => {
      const limit = parseIntParam(req.query.limit, 10) as number;
      const resolvedLinks = app.metadataCache.resolvedLinks;
      const inlinkCount: Record<string, number> = {};

      // Count how many times each file is referenced
      for (const links of Object.values(resolvedLinks)) {
        for (const [target, count] of Object.entries(links)) {
          inlinkCount[target] = (inlinkCount[target] || 0) + count;
        }
      }

      // Sort by reference count in descending order
      const hubs = Object.entries(inlinkCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([path, count]) => ({ path, inlinkCount: count }));

      res.json({ hubs });
      return;
    }));

  return router;
}
