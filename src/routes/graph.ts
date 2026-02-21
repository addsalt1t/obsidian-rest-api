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

  // GET /graph/links/:path - 파일의 outbound 링크
  router.get('/links/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        throw Errors.badRequest('Path is required');
      }

      // Path traversal 검증
      validatePath(requestPath);

      const normalizedPath = ensureMarkdownPath(requestPath);
      const resolvedLinks = app.metadataCache.resolvedLinks;
      const links = resolvedLinks[normalizedPath];

      if (!links) {
        // 파일이 존재하는지 확인 (TFile 체크 불필요)
        if (!app.vault.getAbstractFileByPath(normalizedPath)) {
          throw Errors.notFound('File');
        }
        // 파일은 있지만 링크가 없는 경우
        return res.json({ path: normalizedPath, links: [], count: 0 });
      }

      const outlinks = Object.keys(links);
      res.json({ path: normalizedPath, links: outlinks, count: outlinks.length });
      return;
    }));

  // GET /graph/backlinks/:path - 파일을 참조하는 백링크
  router.get('/backlinks/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        throw Errors.badRequest('Path is required');
      }

      // Path traversal 검증
      validatePath(requestPath);

      const targetPath = ensureMarkdownPath(requestPath);

      // 파일 존재 확인 (TFile 체크 불필요)
      if (!app.vault.getAbstractFileByPath(targetPath)) {
        throw Errors.notFound('File');
      }

      // 역방향 인덱스를 사용한 O(1) 조회
      const backlinkIndex = getBacklinkCacheService(app).getIndex();
      const backlinks = backlinkIndex.get(targetPath) || [];

      res.json({ path: targetPath, backlinks, count: backlinks.length });
      return;
    }));

  // GET /graph/orphans - 링크 없는 고립 노트
  router.get('/orphans', asyncHandler(async (_req: Request, res: Response) => {
      const resolvedLinks = app.metadataCache.resolvedLinks;
      const allFiles = new Set(app.vault.getMarkdownFiles().map(f => f.path));
      const linkedFiles = new Set<string>();

      // 링크된 파일 수집 (다른 파일에서 링크하는 파일들)
      for (const links of Object.values(resolvedLinks)) {
        for (const target of Object.keys(links)) {
          linkedFiles.add(target);
        }
      }

      // 고립 노트 = 다른 파일에서 링크하지 않고, 자신도 다른 파일을 링크하지 않는 파일
      const orphans = [...allFiles].filter(f => {
        const hasInlinks = linkedFiles.has(f);
        const hasOutlinks = Object.keys(resolvedLinks[f] || {}).length > 0;
        return !hasInlinks && !hasOutlinks;
      });

      res.json({ orphans, count: orphans.length });
      return;
    }));

  // GET /graph/hubs?limit=10 - 가장 많이 참조되는 허브 노트
  router.get('/hubs', asyncHandler(async (req: Request, res: Response) => {
      const limit = parseIntParam(req.query.limit, 10) as number;
      const resolvedLinks = app.metadataCache.resolvedLinks;
      const inlinkCount: Record<string, number> = {};

      // 각 파일이 몇 번 참조되는지 계산
      for (const links of Object.values(resolvedLinks)) {
        for (const [target, count] of Object.entries(links)) {
          inlinkCount[target] = (inlinkCount[target] || 0) + count;
        }
      }

      // 참조 횟수 기준 내림차순 정렬
      const hubs = Object.entries(inlinkCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([path, count]) => ({ path, inlinkCount: count }));

      res.json({ hubs });
      return;
    }));

  return router;
}
