import { Router, Request, Response } from 'express';
import { App, TFolder } from 'obsidian';
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

  // POST /batch/read - 여러 파일 내용 일괄 조회
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

  // POST /batch/metadata - 여러 파일 메타데이터 일괄 조회
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

        // buildNoteJsonResponse에서 content/links 제외 후 links를 string[]로 별도 추가
        // (batch/metadata는 links를 { link, displayText } 객체가 아닌 string[]로 반환)
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

  // POST /batch/write - 여러 파일 일괄 생성/수정
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
          // 기존 파일 수정
          await app.vault.modify(existingFile, op.content);
          await waitForMetadataReady(app, normalizedPath, { forceWait: true });
        } else {
          // 새 파일 생성 (폴더가 없으면 자동 생성)
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

  // POST /batch/delete - 여러 파일 일괄 삭제
  router.post('/delete', asyncHandler(async (req: Request, res: Response) => {
      const { paths, force } = req.body as { paths: string[]; force?: boolean };

      const validation = validateBatchArray(paths);
      if (!validation.valid) {
        throw Errors.badRequest(validation.error!, validation.meta);
      }

      const results = await mapWithConcurrencySettled(paths, async (path: string) => {
        // Path traversal 검증
        validatePath(path);

        const { file, path: normalizedPath } = getFileWithFallback(app, path);

        if (!file) {
          throw new Error(`File not found: ${normalizedPath}`);
        }

        // 폴더인 경우 비어있지 않으면 force 필요
        if (file instanceof TFolder && !force && file.children.length > 0) {
          throw new Error(`Folder is not empty: ${normalizedPath}. Use force=true to delete`);
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
