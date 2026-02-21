import type { Request, Response } from 'express';
import { App } from 'obsidian';
import {
  ensureParentFolder,
  getFileWithFallback,
  resolveSafeFilePathWithNormalized,
} from '../../../utils/file-helpers';
import { extractAppendContent } from '../../../utils/content';
import { waitForMetadataReady } from '../../../utils/metadata-ready';
import { Errors } from '../../../middleware/error';
import { buildVaultPathResponse, resolveValidatedVaultPath } from '../utils';

export async function handleVaultPut(app: App, req: Request, res: Response): Promise<Response | void> {
  const { requestPath } = resolveValidatedVaultPath(req, { required: true });

  const { file: existingFile, normalizedPath } = resolveSafeFilePathWithNormalized(app, requestPath);
  const content = extractAppendContent(req);

  if (existingFile) {
    await app.vault.modify(existingFile, content);
    await waitForMetadataReady(app, normalizedPath, { forceWait: true });
    return res.json(buildVaultPathResponse('File updated', normalizedPath));
  }

  await ensureParentFolder(app, normalizedPath);
  await app.vault.create(normalizedPath, content);
  await waitForMetadataReady(app, normalizedPath);
  return res.status(201).json(buildVaultPathResponse('File created', normalizedPath));
}

export async function handleVaultPost(app: App, req: Request, res: Response): Promise<Response | void> {
  const { requestPath } = resolveValidatedVaultPath(req, { required: true });

  const { file, normalizedPath } = resolveSafeFilePathWithNormalized(app, requestPath);
  if (!file) {
    throw Errors.notFound('File');
  }

  const content = extractAppendContent(req);
  const existingContent = await app.vault.read(file);
  const newContent = `${existingContent}\n${content}`;

  await app.vault.modify(file, newContent);
  await waitForMetadataReady(app, normalizedPath, { forceWait: true });
  return res.json(buildVaultPathResponse('Content appended', normalizedPath));
}

export async function handleVaultDelete(app: App, req: Request, res: Response): Promise<Response | void> {
  const { requestPath } = resolveValidatedVaultPath(req, { required: true });
  const { file, path: finalPath } = getFileWithFallback(app, requestPath);
  if (!file) {
    throw Errors.notFound('File');
  }

  await app.vault.delete(file);
  return res.json(buildVaultPathResponse('File deleted', finalPath));
}
