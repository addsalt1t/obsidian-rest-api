import { Router, Request, Response } from 'express';
import { App, normalizePath, TAbstractFile } from 'obsidian';
import { validatePath } from '../utils/path-validation';
import { getFolderOrNull } from '../utils/file-helpers';
import { HTTP_STATUS, ERROR_MSG } from '../constants';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { waitForMetadataReady } from '../utils/metadata-ready';
import { handleVaultRead } from './vault/handlers/read';
import { handleVaultPut, handleVaultPost, handleVaultDelete } from './vault/handlers/write';
import { handleVaultPatch } from './vault/handlers/patch';
import { extractRequestPath } from './vault/utils';
import {
  DEFAULT_RESPONSE_POLICY_SETTINGS,
  type PolicySettingsProvider,
} from '../security/response-policy';

function getValidatedNormalizedPath(req: Request): string {
  const requestPath = extractRequestPath(req);
  if (!requestPath) {
    throw Errors.badRequest(ERROR_MSG.PATH_REQUIRED);
  }

  validatePath(requestPath);
  return normalizePath(requestPath);
}

export function createVaultRouter(
  app: App,
  getPolicySettings: PolicySettingsProvider = () => DEFAULT_RESPONSE_POLICY_SETTINGS,
): Router {
  const router = Router();

  router.get('/*', asyncHandler(async (req: Request, res: Response) => {
    return handleVaultRead(app, req, res, getPolicySettings);
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
      const normalizedPath = getValidatedNormalizedPath(req);

      // Check if already exists
      if (app.vault.getAbstractFileByPath(normalizedPath)) {
        throw Errors.conflict(ERROR_MSG.TARGET_EXISTS);
      }

      await app.vault.createFolder(normalizedPath);
      res.status(HTTP_STATUS.CREATED).json({ message: 'Folder created', path: normalizedPath });
      return;
  }));

  // DELETE /vault/folder/{path} - Delete folder
  router.delete('/*', asyncHandler(async (req: Request, res: Response) => {
      const normalizedPath = getValidatedNormalizedPath(req);

      const force = req.query.force === 'true';
      const folder = getFolderOrNull(app, normalizedPath);

      if (!folder) {
        throw Errors.notFound('Folder');
      }

      // Deleting non-empty folders requires force flag
      if (!force && folder.children.length > 0) {
        throw Errors.conflict(ERROR_MSG.FOLDER_NOT_EMPTY);
      }

      await app.vault.delete(folder, true);
      res.json({ message: 'Folder deleted', path: normalizedPath });
      return;
  }));

  return router;
}

function extractMoveNewPath(req: Request): string {
  const { newPath } = req.body;
  if (!newPath || typeof newPath !== 'string') {
    throw Errors.badRequest(ERROR_MSG.NEW_PATH_REQUIRED);
  }
  validatePath(newPath);
  return normalizePath(newPath);
}

function extractRenameNewPath(req: Request, file: TAbstractFile): string {
  const { newName } = req.body;
  if (!newName || typeof newName !== 'string') {
    throw Errors.badRequest('newName is required in request body');
  }
  validatePath(newName);
  const parentPath = file.parent ? file.parent.path : '';
  return normalizePath(parentPath ? `${parentPath}/${newName}` : newName);
}

async function performMoveRename(
  app: App, req: Request, res: Response,
  resolveNewPath: (req: Request, file: TAbstractFile) => string,
  message: string,
): Promise<void> {
  const oldPath = getValidatedNormalizedPath(req);
  const file = app.vault.getAbstractFileByPath(oldPath);
  if (!file) throw Errors.notFound('File');

  const normalizedNewPath = resolveNewPath(req, file);
  if (app.vault.getAbstractFileByPath(normalizedNewPath)) throw Errors.conflict(ERROR_MSG.TARGET_EXISTS);

  await app.fileManager.renameFile(file, normalizedNewPath);
  await waitForMetadataReady(app, normalizedNewPath, { forceWait: true });
  res.json({ message, oldPath, newPath: normalizedNewPath });
}

/**
 * File/folder move and rename router
 * POST /vault/{path}/move - Move (auto-updates links)
 * POST /vault/{path}/rename - Rename (auto-updates links)
 */
export function createMoveRenameRouter(app: App): Router {
  const router = Router();

  router.post(/^\/(.+)\/move\/?$/, asyncHandler(async (req: Request, res: Response) => {
    await performMoveRename(app, req, res, extractMoveNewPath, 'Moved');
  }));

  router.post(/^\/(.+)\/rename\/?$/, asyncHandler(async (req: Request, res: Response) => {
    await performMoveRename(app, req, res, extractRenameNewPath, 'Renamed');
  }));

  return router;
}
