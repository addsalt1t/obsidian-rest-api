import { Router } from 'express';
import { App } from 'obsidian';
import { parseIntParam, parseStringParam, parseEnumParam, parsePagination } from '../utils/request-parsers';
import { asyncHandler } from '../middleware/asyncHandler';
import { getTagCacheService } from '../services/tagCache';

export function createTagsRouter(app: App): Router {
  const router = Router();

  // GET /tags - Tag list with usage counts (cached, supports filtering/sorting)
  router.get('/', asyncHandler(async (req, res) => {
      const prefix = parseStringParam(req.query.prefix);
      const q = parseStringParam(req.query.q);
      const limit = parseIntParam(req.query.limit);
      const sort = parseEnumParam(req.query.sort, ['name', 'count'] as const, 'count');

      let tags = getTagCacheService(app).getTags();

      // prefix filter: handle both with and without # prefix
      if (prefix) {
        const normalizedPrefix = prefix.replace(/^#/, '').toLowerCase();
        tags = tags.filter(t => t.tag.toLowerCase().startsWith(normalizedPrefix));
      }

      // q filter: substring search (case-insensitive)
      if (q) {
        const query = q.toLowerCase();
        tags = tags.filter(t => t.tag.toLowerCase().includes(query));
      }

      // Sort
      if (sort === 'name') {
        tags = [...tags].sort((a, b) => a.tag.localeCompare(b.tag));
      }
      // sort === 'count' needs no additional sorting since cache is already sorted by count descending

      // Apply limit (max 500)
      if (limit !== undefined) {
        const clampedLimit = Math.min(Math.max(1, limit), 500);
        tags = tags.slice(0, clampedLimit);
      }

      res.json({ tags });
    }));

  // GET /tags/:tag/files - List files with a specific tag (supports pagination)
  router.get('/:tag/files', asyncHandler(async (req, res) => {
      const { tag } = req.params;
      const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;

      // Pagination parameters
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);

      const allFiles: Array<{ path: string; name: string }> = [];
      const markdownFiles = app.vault.getMarkdownFiles();

      for (const file of markdownFiles) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache) continue;

        // Check frontmatter tags
        const frontmatterTags = cache.frontmatter?.tags || [];
        const normalizedFmTags = Array.isArray(frontmatterTags)
          ? frontmatterTags.map((t: string) => t.startsWith('#') ? t : `#${t}`)
          : [];

        // Check inline tags
        const inlineTags = (cache.tags || []).map(t => t.tag);

        const allTags = [...normalizedFmTags, ...inlineTags];

        // Also match nested tags (e.g., #parent/child matches a #parent search)
        const hasTag = allTags.some(t =>
          t === normalizedTag || t.startsWith(`${normalizedTag}/`)
        );

        if (hasTag) {
          allFiles.push({
            path: file.path,
            name: file.basename
          });
        }
      }

      // Apply pagination
      const totalCount = allFiles.length;
      const paginatedFiles = allFiles.slice(offset, offset + limit);

      res.json({
        tag: tag.replace(/^#/, ''),
        totalCount,
        count: paginatedFiles.length,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
        files: paginatedFiles
      });
    }));

  return router;
}
