import { Router } from 'express';
import { App } from 'obsidian';
import { parseIntParam, parseStringParam, parseEnumParam, parsePagination } from '../utils/request-parsers';
import { asyncHandler } from '../middleware/asyncHandler';
import { getTagCacheService } from '../services/tagCache';

export function createTagsRouter(app: App): Router {
  const router = Router();

  // GET /tags - 태그 목록 및 사용 횟수 (캐시 적용, 필터링/정렬 지원)
  router.get('/', asyncHandler(async (req, res) => {
      const prefix = parseStringParam(req.query.prefix);
      const q = parseStringParam(req.query.q);
      const limit = parseIntParam(req.query.limit);
      const sort = parseEnumParam(req.query.sort, ['name', 'count'] as const, 'count');

      let tags = getTagCacheService(app).getTags();

      // prefix 필터: # 유무 모두 처리
      if (prefix) {
        const normalizedPrefix = prefix.replace(/^#/, '').toLowerCase();
        tags = tags.filter(t => t.tag.toLowerCase().startsWith(normalizedPrefix));
      }

      // q 필터: 부분 문자열 검색 (case-insensitive)
      if (q) {
        const query = q.toLowerCase();
        tags = tags.filter(t => t.tag.toLowerCase().includes(query));
      }

      // 정렬
      if (sort === 'name') {
        tags = [...tags].sort((a, b) => a.tag.localeCompare(b.tag));
      }
      // sort === 'count'는 캐시가 이미 count 내림차순이므로 추가 정렬 불필요

      // limit 적용 (최대 500)
      if (limit !== undefined) {
        const clampedLimit = Math.min(Math.max(1, limit), 500);
        tags = tags.slice(0, clampedLimit);
      }

      res.json({ tags });
    }));

  // GET /tags/:tag/files - 특정 태그를 가진 파일 목록 (페이지네이션 지원)
  router.get('/:tag/files', asyncHandler(async (req, res) => {
      const { tag } = req.params;
      const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;

      // 페이지네이션 파라미터
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);

      const allFiles: Array<{ path: string; name: string }> = [];
      const markdownFiles = app.vault.getMarkdownFiles();

      for (const file of markdownFiles) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache) continue;

        // frontmatter 태그 확인
        const frontmatterTags = cache.frontmatter?.tags || [];
        const normalizedFmTags = Array.isArray(frontmatterTags)
          ? frontmatterTags.map((t: string) => t.startsWith('#') ? t : `#${t}`)
          : [];

        // 인라인 태그 확인
        const inlineTags = (cache.tags || []).map(t => t.tag);

        const allTags = [...normalizedFmTags, ...inlineTags];

        // 중첩 태그도 매칭 (예: #parent/child는 #parent 검색에도 매칭)
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

      // 페이지네이션 적용
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
