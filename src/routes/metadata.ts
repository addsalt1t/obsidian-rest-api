import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { HTTP_STATUS, ERROR_MSG } from '../constants';
import { resolveSafeFilePathWithNormalized } from '../utils/file-helpers';
import { needsFallbackRead, buildMetadataResponse } from '../utils/response-builders';
import { getBacklinkCacheService } from '../services/backlinkCache';
import { asyncHandler } from '../middleware/asyncHandler';
import { extractRequestPath } from './vault/utils';

/**
 * 통합 메타데이터 라우터
 * GET /metadata/{path} - 파일의 모든 메타데이터를 한 번에 반환
 */
export function createMetadataRouter(app: App): Router {
  const router = Router();

  // GET /metadata/{path} - 통합 메타데이터 조회
  router.get('/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MSG.PATH_REQUIRED });
      }

      const { file, normalizedPath } = resolveSafeFilePathWithNormalized(app, requestPath);
      if (!file) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_MSG.FILE_NOT_FOUND });
      }

      // 캐시 불완전 시에만 vault.read 호출 (불필요한 I/O 방지)
      const content = needsFallbackRead(app, file)
        ? await app.vault.read(file)
        : '';

      const base = buildMetadataResponse(app, file, normalizedPath, content);

      // 백링크 (역방향 인덱스를 사용한 O(1) 조회)
      const backlinkIndex = getBacklinkCacheService(app).getIndex();
      const backlinks = backlinkIndex.get(normalizedPath) || [];

      res.json({ ...base, backlinks });
      return;
    }));

  return router;
}
