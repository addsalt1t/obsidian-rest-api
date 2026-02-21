import { Router, Request, Response } from 'express';
import { App, normalizePath } from 'obsidian';
import { validatePath } from '../utils/path-validation';
import { getFolderOrNull } from '../utils/file-helpers';
import { HTTP_STATUS, ERROR_MSG } from '../constants';
import { asyncHandler } from '../middleware/asyncHandler';
import { waitForMetadataReady } from '../utils/metadata-ready';
import { handleVaultRead } from './vault/handlers/read';
import { handleVaultPut, handleVaultPost, handleVaultDelete } from './vault/handlers/write';
import { handleVaultPatch } from './vault/handlers/patch';
import { extractRequestPath } from './vault/utils';

function getValidatedNormalizedPath(req: Request, res: Response): string | null {
  const requestPath = extractRequestPath(req);
  if (!requestPath) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MSG.PATH_REQUIRED });
    return null;
  }

  validatePath(requestPath);
  return normalizePath(requestPath);
}

export function createVaultRouter(app: App): Router {
  const router = Router();

  router.get('/*', asyncHandler(async (req: Request, res: Response) => {
    return handleVaultRead(app, req, res);
  }));

  router.put('/*', asyncHandler(async (req: Request, res: Response) => {
    return handleVaultPut(app, req, res);
  }));

  router.post('/*', asyncHandler(async (req: Request, res: Response) => {
    return handleVaultPost(app, req, res);
  }));

  router.patch('/*', asyncHandler(async (req: Request, res: Response) => {
    return handleVaultPatch(app, req, res);
  }));

  router.delete('/*', asyncHandler(async (req: Request, res: Response) => {
    return handleVaultDelete(app, req, res);
  }));

  return router;
}

/**
 * 폴더 관리 라우터
 * POST /vault/folder/{path} - 폴더 생성
 * DELETE /vault/folder/{path} - 폴더 삭제
 */
export function createFolderRouter(app: App): Router {
  const router = Router();

  // POST /vault/folder/{path} - 폴더 생성
  router.post('/*', asyncHandler(async (req: Request, res: Response) => {
      const normalizedPath = getValidatedNormalizedPath(req, res);
      if (!normalizedPath) {
        return;
      }

      // 이미 존재하는지 확인
      if (app.vault.getAbstractFileByPath(normalizedPath)) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: ERROR_MSG.TARGET_EXISTS });
      }

      await app.vault.createFolder(normalizedPath);
      res.status(HTTP_STATUS.CREATED).json({ message: 'Folder created', path: normalizedPath });
      return;
  }));

  // DELETE /vault/folder/{path} - 폴더 삭제
  router.delete('/*', asyncHandler(async (req: Request, res: Response) => {
      const normalizedPath = getValidatedNormalizedPath(req, res);
      if (!normalizedPath) {
        return;
      }

      const force = req.query.force === 'true';
      const folder = getFolderOrNull(app, normalizedPath);

      if (!folder) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_MSG.FOLDER_NOT_FOUND });
      }

      // 비어있지 않은 폴더 삭제 시 force 필요
      if (!force && folder.children.length > 0) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: ERROR_MSG.FOLDER_NOT_EMPTY });
      }

      await app.vault.delete(folder, true);
      res.json({ message: 'Folder deleted', path: normalizedPath });
      return;
  }));

  return router;
}

/**
 * 파일/폴더 이동 및 이름 변경 라우터
 * POST /vault/{path}/move - 이동 (링크 자동 업데이트)
 * POST /vault/{path}/rename - 이름 변경 (링크 자동 업데이트)
 */
export function createMoveRenameRouter(app: App): Router {
  const router = Router();

  // POST /vault/{path}/move - 파일/폴더 이동
  router.post(/^\/(.+)\/move\/?$/, asyncHandler(async (req: Request, res: Response) => {
      const oldPath = getValidatedNormalizedPath(req, res);
      if (!oldPath) {
        return;
      }

      const { newPath } = req.body;
      if (!newPath || typeof newPath !== 'string') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MSG.NEW_PATH_REQUIRED });
      }

      // Path traversal 검증 (대상 경로)
      validatePath(newPath);

      const normalizedNewPath = normalizePath(newPath);

      const file = app.vault.getAbstractFileByPath(oldPath);
      if (!file) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_MSG.FILE_NOT_FOUND });
      }

      // 대상 경로에 이미 파일이 있는지 확인
      const targetExists = app.vault.getAbstractFileByPath(normalizedNewPath);
      if (targetExists) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: ERROR_MSG.TARGET_EXISTS });
      }

      // fileManager.renameFile은 링크를 자동으로 업데이트함
      await app.fileManager.renameFile(file, normalizedNewPath);
      // metadataCache 재인덱싱 대기 (캐시 무효화는 vault 이벤트가 자동 트리거)
      await waitForMetadataReady(app, normalizedNewPath, { forceWait: true });
      res.json({ message: 'Moved', oldPath, newPath: normalizedNewPath });
      return;
  }));

  // POST /vault/{path}/rename - 파일/폴더 이름 변경
  router.post(/^\/(.+)\/rename\/?$/, asyncHandler(async (req: Request, res: Response) => {
      const oldPath = getValidatedNormalizedPath(req, res);
      if (!oldPath) {
        return;
      }

      const { newName } = req.body;
      if (!newName || typeof newName !== 'string') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'newName is required in request body' });
      }

      // Path traversal 검증 (새 이름)
      validatePath(newName);

      const file = app.vault.getAbstractFileByPath(oldPath);
      if (!file) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_MSG.FILE_NOT_FOUND });
      }

      // 부모 경로 + 새 이름으로 새 경로 생성
      const parentPath = file.parent ? file.parent.path : '';
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      const normalizedNewPath = normalizePath(newPath);

      // 대상 경로에 이미 파일이 있는지 확인
      const targetExists = app.vault.getAbstractFileByPath(normalizedNewPath);
      if (targetExists) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: ERROR_MSG.TARGET_EXISTS });
      }

      // fileManager.renameFile은 링크를 자동으로 업데이트함
      await app.fileManager.renameFile(file, normalizedNewPath);
      // metadataCache 재인덱싱 대기 (캐시 무효화는 vault 이벤트가 자동 트리거)
      await waitForMetadataReady(app, normalizedNewPath, { forceWait: true });
      res.json({ message: 'Renamed', oldPath, newPath: normalizedNewPath });
      return;
  }));

  return router;
}
