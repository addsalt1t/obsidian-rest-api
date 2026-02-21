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
 * Folder management router
 * POST /vault/folder/{path} - Create folder
 * DELETE /vault/folder/{path} - Delete folder
 */
export function createFolderRouter(app: App): Router {
  const router = Router();

  // POST /vault/folder/{path} - Create folder
  router.post('/*', asyncHandler(async (req: Request, res: Response) => {
      const normalizedPath = getValidatedNormalizedPath(req, res);
      if (!normalizedPath) {
        return;
      }

      // Check if already exists
      if (app.vault.getAbstractFileByPath(normalizedPath)) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: ERROR_MSG.TARGET_EXISTS });
      }

      await app.vault.createFolder(normalizedPath);
      res.status(HTTP_STATUS.CREATED).json({ message: 'Folder created', path: normalizedPath });
      return;
  }));

  // DELETE /vault/folder/{path} - Delete folder
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

      // Deleting non-empty folders requires force flag
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
 * File/folder move and rename router
 * POST /vault/{path}/move - Move (auto-updates links)
 * POST /vault/{path}/rename - Rename (auto-updates links)
 */
export function createMoveRenameRouter(app: App): Router {
  const router = Router();

  // POST /vault/{path}/move - Move file/folder
  router.post(/^\/(.+)\/move\/?$/, asyncHandler(async (req: Request, res: Response) => {
      const oldPath = getValidatedNormalizedPath(req, res);
      if (!oldPath) {
        return;
      }

      const { newPath } = req.body;
      if (!newPath || typeof newPath !== 'string') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MSG.NEW_PATH_REQUIRED });
      }

      // Path traversal validation (target path)
      validatePath(newPath);

      const normalizedNewPath = normalizePath(newPath);

      const file = app.vault.getAbstractFileByPath(oldPath);
      if (!file) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_MSG.FILE_NOT_FOUND });
      }

      // Check if a file already exists at the target path
      const targetExists = app.vault.getAbstractFileByPath(normalizedNewPath);
      if (targetExists) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: ERROR_MSG.TARGET_EXISTS });
      }

      // fileManager.renameFile automatically updates links
      await app.fileManager.renameFile(file, normalizedNewPath);
      // Wait for metadataCache re-indexing (cache invalidation is auto-triggered by vault events)
      await waitForMetadataReady(app, normalizedNewPath, { forceWait: true });
      res.json({ message: 'Moved', oldPath, newPath: normalizedNewPath });
      return;
  }));

  // POST /vault/{path}/rename - Rename file/folder
  router.post(/^\/(.+)\/rename\/?$/, asyncHandler(async (req: Request, res: Response) => {
      const oldPath = getValidatedNormalizedPath(req, res);
      if (!oldPath) {
        return;
      }

      const { newName } = req.body;
      if (!newName || typeof newName !== 'string') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'newName is required in request body' });
      }

      // Path traversal validation (new name)
      validatePath(newName);

      const file = app.vault.getAbstractFileByPath(oldPath);
      if (!file) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: ERROR_MSG.FILE_NOT_FOUND });
      }

      // Build new path from parent path + new name
      const parentPath = file.parent ? file.parent.path : '';
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      const normalizedNewPath = normalizePath(newPath);

      // Check if a file already exists at the target path
      const targetExists = app.vault.getAbstractFileByPath(normalizedNewPath);
      if (targetExists) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: ERROR_MSG.TARGET_EXISTS });
      }

      // fileManager.renameFile automatically updates links
      await app.fileManager.renameFile(file, normalizedNewPath);
      // Wait for metadataCache re-indexing (cache invalidation is auto-triggered by vault events)
      await waitForMetadataReady(app, normalizedNewPath, { forceWait: true });
      res.json({ message: 'Renamed', oldPath, newPath: normalizedNewPath });
      return;
  }));

  return router;
}
