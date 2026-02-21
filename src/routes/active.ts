import { Router, Request, Response } from 'express';
import { App, TFile, MarkdownView } from 'obsidian';
import { extractAppendContent } from '../utils/content';
import { dispatchPatch } from '../utils/patch-dispatcher';
import { buildNoteJsonResponse } from '../utils/response-builders';
import { Errors } from '../middleware/error';
import { ERROR_MSG, MIME_TYPE } from '../constants';
import { parsePatchRequestParts } from '../utils/patch-request';
import { asyncHandler } from '../middleware/asyncHandler';
import { waitForMetadataReady } from '../utils/metadata-ready';

export function createActiveRouter(app: App): Router {
  const router = Router();

  /**
   * 현재 활성화된 마크다운 파일 가져오기
   */
  function getActiveFile(): TFile | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file || null;
  }

  /**
   * GET /active/
   * 현재 활성화된 파일 내용 조회
   */
  router.get('/', asyncHandler(async (req: Request, res: Response) => {
      const file = getActiveFile();

      if (!file) {
        throw Errors.notFound(ERROR_MSG.NO_ACTIVE_FILE);
      }

      const acceptHeader = req.headers.accept || MIME_TYPE.TEXT_MARKDOWN;

      const content = await app.vault.read(file);

      if (acceptHeader.includes(MIME_TYPE.NOTE_JSON)) {
        return res.json(buildNoteJsonResponse(app, file, content));
      }

      // text/markdown (기본)
      res.setHeader('Content-Type', `${MIME_TYPE.TEXT_MARKDOWN}; charset=utf-8`);
      res.send(content);
      return;
    }));

  /**
   * PUT /active/
   * 활성 파일 내용 덮어쓰기
   */
  router.put('/', asyncHandler(async (req: Request, res: Response) => {
      const file = getActiveFile();

      if (!file) {
        throw Errors.notFound(ERROR_MSG.NO_ACTIVE_FILE);
      }

      const content = extractAppendContent(req);
      await app.vault.modify(file, content);
      await waitForMetadataReady(app, file.path, { forceWait: true });

      res.json({ message: 'Active file updated', path: file.path });
      return;
    }));

  /**
   * POST /active/
   * 활성 파일 끝에 내용 추가
   */
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
      const file = getActiveFile();

      if (!file) {
        throw Errors.notFound(ERROR_MSG.NO_ACTIVE_FILE);
      }

      const content = extractAppendContent(req);
      const existingContent = await app.vault.read(file);
      const newContent = existingContent + '\n' + content;

      await app.vault.modify(file, newContent);
      await waitForMetadataReady(app, file.path, { forceWait: true });

      res.json({ message: 'Content appended to active file', path: file.path });
      return;
    }));

  /**
   * PATCH /active/
   * 활성 파일 부분 수정
   */
  router.patch('/', asyncHandler(async (req: Request, res: Response) => {
      const file = getActiveFile();

      if (!file) {
        throw Errors.notFound(ERROR_MSG.NO_ACTIVE_FILE);
      }

      const { operation, targetType, target } = parsePatchRequestParts(req);
      const content = extractAppendContent(req);

      const existingContent = await app.vault.read(file);

      const result = dispatchPatch(existingContent, {
        targetType: targetType || '',
        target: target || '',
        operation,
        content,
      });

      if (!result.found) {
        const err = Errors.notFound(result.targetLabel!, { file: file.path });
        return res.status(err.statusCode).json(err.toResponse());
      }

      const newContent = result.content;

      await app.vault.modify(file, newContent);
      await waitForMetadataReady(app, file.path, { forceWait: true });

      res.json({ message: 'Active file patched', path: file.path });
      return;
    }));

  /**
   * DELETE /active/
   * 활성 파일 삭제
   */
  router.delete('/', asyncHandler(async (_req: Request, res: Response) => {
      const file = getActiveFile();

      if (!file) {
        throw Errors.notFound(ERROR_MSG.NO_ACTIVE_FILE);
      }

      const path = file.path;
      await app.vault.delete(file);

      res.json({ message: 'Active file deleted', path });
      return;
    }));

  return router;
}
