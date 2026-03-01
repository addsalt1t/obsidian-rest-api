import type { Request, Response } from 'express';
import { App, TFile, TFolder } from 'obsidian';
import { getFileWithFallback } from '../../../utils/file-helpers';
import { parseIntParam } from '../../../utils/request-parsers';
import { buildNoteJsonResponse } from '../../../utils/response-builders';
import { Errors } from '../../../middleware/error';
import {
  DEFAULT_RESPONSE_POLICY_SETTINGS,
  resolveNoteJsonFields,
  type PolicySettingsProvider,
} from '../../../security/response-policy';
import {
  MIME_TYPE,
  TREE_DEFAULT_DEPTH,
  TREE_DEPTH_MAX,
  TREE_DEPTH_MIN,
} from '../../../constants';
import { buildFolderTree, listFolderChildren } from '../tree';
import { resolveValidatedVaultPath } from '../utils';

function parseFolderViewOptions(req: Request): { recursive: boolean; maxDepth: number } {
  const recursive = req.query.recursive === 'true';
  const maxDepth = parseIntParam(req.query.maxDepth, TREE_DEFAULT_DEPTH) as number;

  if (recursive && (isNaN(maxDepth) || maxDepth < TREE_DEPTH_MIN || maxDepth > TREE_DEPTH_MAX)) {
    throw Errors.validationError(
      `maxDepth must be a positive integer between ${TREE_DEPTH_MIN} and ${TREE_DEPTH_MAX}`
    );
  }

  return { recursive, maxDepth };
}

function respondFolder(folder: TFolder, req: Request, res: Response): Response {
  const { recursive, maxDepth } = parseFolderViewOptions(req);

  if (recursive) {
    return res.json({ tree: buildFolderTree(folder, 1, maxDepth) });
  }

  const { files, folders } = listFolderChildren(folder);
  return res.json({ files, folders });
}

async function serveFile(
  app: App,
  file: TFile,
  req: Request,
  acceptHeader: string,
  res: Response,
  getPolicySettings: PolicySettingsProvider,
): Promise<Response> {
  const content = await app.vault.read(file);

  if (acceptHeader.includes(MIME_TYPE.NOTE_JSON)) {
    const includeFields = resolveNoteJsonFields(req, getPolicySettings());
    return res.json(buildNoteJsonResponse(app, file, content, { includeFields }));
  }

  res.setHeader('Content-Type', `${MIME_TYPE.TEXT_MARKDOWN}; charset=utf-8`);
  return res.send(content);
}

export async function handleVaultRead(
  app: App,
  req: Request,
  res: Response,
  getPolicySettings: PolicySettingsProvider = () => DEFAULT_RESPONSE_POLICY_SETTINGS,
): Promise<Response> {
  const { requestPath, normalizedPath } = resolveValidatedVaultPath(req);
  const acceptHeader = req.headers.accept || MIME_TYPE.JSON;

  if (!normalizedPath || requestPath.endsWith('/')) {
    const folder = normalizedPath
      ? app.vault.getAbstractFileByPath(normalizedPath)
      : app.vault.getRoot();

    if (!folder || !(folder instanceof TFolder)) {
      throw Errors.notFound('Folder');
    }

    return respondFolder(folder, req, res);
  }

  const file = app.vault.getAbstractFileByPath(normalizedPath);
  if (!file) {
    const { file: fallbackFile } = getFileWithFallback(app, normalizedPath);
    if (!fallbackFile) {
      throw Errors.notFound('File');
    }
    return serveFile(app, fallbackFile, req, acceptHeader, res, getPolicySettings);
  }

  if (file instanceof TFolder) {
    return respondFolder(file, req, res);
  }

  if (file instanceof TFile) {
    return serveFile(app, file, req, acceptHeader, res, getPolicySettings);
  }

  throw Errors.notFound('Resource');
}
