import type { Request, Response } from 'express';
import { App } from 'obsidian';
import { resolveHeadingPath } from '../../../services/filePatching';
import { dispatchPatch } from '../../../utils/patch-dispatcher';
import { resolveSafeFilePathWithNormalized } from '../../../utils/file-helpers';
import { parsePatchRequestParts } from '../../../utils/patch-request';
import { extractContent } from '../../../utils/content';
import { waitForMetadataReady } from '../../../utils/metadata-ready';
import { Errors } from '../../../middleware/error';
import { HTTP_STATUS } from '../../../constants';
import { buildVaultPathResponse, resolveValidatedVaultPath } from '../utils';

export async function handleVaultPatch(app: App, req: Request, res: Response): Promise<Response> {
  const { requestPath } = resolveValidatedVaultPath(req, { required: true });

  const { file, normalizedPath } = resolveSafeFilePathWithNormalized(app, requestPath);
  if (!file) {
    throw Errors.notFound('File');
  }

  const { operation, targetType, target } = parsePatchRequestParts(req);
  const content = extractContent(req);

  const existingContent = await app.vault.read(file);

  let patchTarget = target;
  if (targetType === 'heading' && patchTarget) {
    const resolve = req.query.resolve === 'true';
    if (resolve && !patchTarget.includes('::')) {
      const resolveResult = resolveHeadingPath(existingContent, patchTarget);
      if (resolveResult.error) {
        throw Errors.notFound(`Heading '${patchTarget}'`, { file: normalizedPath });
      }
      if (resolveResult.ambiguous) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Ambiguous heading',
          message: `Multiple headings found with text '${patchTarget}'. Use full path.`,
          candidates: resolveResult.headings.map((heading) => heading.fullPath),
        });
      }
      patchTarget = resolveResult.headings[0].fullPath;
    }
  }

  const result = dispatchPatch(existingContent, {
    targetType: targetType || '',
    target: patchTarget || '',
    operation,
    content,
  });

  if (!result.found) {
    throw Errors.notFound(result.targetLabel!, { file: normalizedPath });
  }

  await app.vault.modify(file, result.content);
  await waitForMetadataReady(app, normalizedPath, { forceWait: true });
  return res.json(buildVaultPathResponse('File patched', normalizedPath));
}
