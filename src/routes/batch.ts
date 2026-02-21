import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { z } from 'zod';
import type { BatchWriteOperation } from '@obsidian-workspace/shared-types';
import { Errors } from '../middleware/error';
import { mapWithConcurrencySettled } from '../utils/concurrency';
import { getFileWithFallback, ensureParentFolder, resolveSafeFilePathWithNormalized } from '../utils/file-helpers';
import { validatePath } from '../utils/path-validation';
import { buildNoteJsonResponse } from '../utils/response-builders';
import { asyncHandler } from '../middleware/asyncHandler';
import { partitionSettledResults } from '../utils/batch-helpers';
import { waitForMetadataReady } from '../utils/metadata-ready';
import { validateBatchArray } from '../utils/batch-validation';

const BatchWriteOpSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export function createBatchRouter(app: App): Router {
  const router = Router();

  // POST /batch/read - Batch read multiple file contents
  router.post('/read', asyncHandler(async (req: Request, res: Response) => {
      const { paths } = req.body as { paths: string[] };

      const validation = validateBatchArray(paths);
      if (!validation.valid) {
        throw Errors.badRequest(validation.error!, validation.meta);
      }

      const results = await mapWithConcurrencySettled(paths, async (path: string) => {
        const { file, normalizedPath } = resolveSafeFilePathWithNormalized(app, path);
        if (!file) {
          throw new Error(`File not found: ${normalizedPath}`);
        }

        const content = await app.vault.cachedRead(file);
        return { path: normalizedPath, content };
      });

      const { success, errors } = partitionSettledResults(results, paths, (path) => path);
      res.json({ success, errors, total: paths.length });
      return;
    }));

  // POST /batch/metadata - Batch read multiple file metadata
  router.post('/metadata', asyncHandler(async (req: Request, res: Response) => {
      const { paths } = req.body as { paths: string[] };

      const validation = validateBatchArray(paths);
      if (!validation.valid) {
        throw Errors.badRequest(validation.error!, validation.meta);
      }

      const results = await mapWithConcurrencySettled(paths, async (path: string) => {
        const { file, normalizedPath } = resolveSafeFilePathWithNormalized(app, path);
        if (!file) {
          throw new Error(`File not found: ${normalizedPath}`);
        }

        // Exclude content/links from buildNoteJsonResponse, then add links as separate field
        // (batch/metadata returns links as { path, displayText } objects, not the full note-json link format)
        const noteJson = buildNoteJsonResponse(app, file, '', {
          excludeContent: true,
          excludeLinks: true,
        });

        const cache = app.metadataCache.getFileCache(file);

        return {
          path: normalizedPath,
          frontmatter: noteJson.frontmatter as Record<string, unknown>,
          tags: noteJson.tags as string[],
          links: cache?.links?.map((l) => ({ path: l.link, displayText: l.displayText })) || [],
          stat: noteJson.stat as { size: number; ctime: number; mtime: number },
        };
      });

      const { success, errors } = partitionSettledResults(results, paths, (path) => path);
      res.json({ success, errors, total: paths.length });
      return;
    }));

  // POST /batch/write - Batch create/update multiple files
  router.post('/write', asyncHandler(async (req: Request, res: Response) => {
      const { operations } = req.body as { operations: BatchWriteOperation[] };

      const validation = validateBatchArray(operations, undefined, 'operations array is required', false);
      if (!validation.valid) {
        throw Errors.badRequest(validation.error!, validation.meta);
      }

      // Validate individual operation structure (path and content must be strings)
      for (const op of operations) {
        const parseResult = BatchWriteOpSchema.safeParse(op);
        if (!parseResult.success) {
          throw Errors.validationError('Invalid operation: each item must have a non-empty path (string) and content (string)', parseResult.error.issues);
        }
      }

      const results = await mapWithConcurrencySettled(operations, async (op: BatchWriteOperation) => {
        const { file: existingFile, normalizedPath } = resolveSafeFilePathWithNormalized(app, op.path);
        const operation = op.operation || 'upsert';

        if (operation === 'create' && existingFile) {
          throw new Error(`File already exists: ${normalizedPath}`);
        }

        if (operation === 'update' && !existingFile) {
          throw new Error(`File not found: ${normalizedPath}`);
        }

        let created = false;
        if (existingFile) {
          // Modify existing file
          await app.vault.modify(existingFile, op.content);
          await waitForMetadataReady(app, normalizedPath, { forceWait: true });
        } else {
          // Create new file (auto-create parent folder if missing)
          await ensureParentFolder(app, normalizedPath);
          await app.vault.create(normalizedPath, op.content);
          await waitForMetadataReady(app, normalizedPath);
          created = true;
        }

        return { path: normalizedPath, created };
      });

      const { success, errors } = partitionSettledResults(results, operations, (op) => op.path);
      res.json({ success, errors, total: operations.length });
      return;
    }));

  // POST /batch/delete - Batch delete multiple files
  router.post('/delete', asyncHandler(async (req: Request, res: Response) => {
      const { paths } = req.body as { paths: string[] };

      const validation = validateBatchArray(paths);
      if (!validation.valid) {
        throw Errors.badRequest(validation.error!, validation.meta);
      }

      const results = await mapWithConcurrencySettled(paths, async (path: string) => {
        // Path traversal validation
        validatePath(path);

        const { file, path: normalizedPath } = getFileWithFallback(app, path);

        if (!file) {
          throw new Error(`File not found: ${normalizedPath}`);
        }

        await app.vault.delete(file, true);
        return normalizedPath;
      });

      const { success, errors } = partitionSettledResults(results, paths, (path) => path);
      res.json({ success, errors, total: paths.length });
      return;
    }));

  return router;
}
