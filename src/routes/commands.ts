import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import type { Command } from '@obsidian-workspace/shared-types';
import { isBlockedCommand } from '../constants';
import { validatePath } from '../utils/path-validation';
import { ensureMarkdownPath, getFileOrNull } from '../utils/file-helpers';
import { createLogger } from '../utils/logger';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { extractRequestPath } from './vault/utils';

const logger = createLogger('Commands');

export function createCommandsRouter(app: App): Router {
  const router = Router();

  /**
   * GET /commands/
   * 사용 가능한 모든 명령어 목록
   */
  router.get('/', asyncHandler(async (_req: Request, res: Response) => {
      // @ts-expect-error - commands is internal API
      const commands = app.commands?.commands || {};

      const commandList: Command[] = Object.entries(commands).map(([id, cmd]: [string, unknown]) => ({
        id,
        name: (cmd as { name?: string })?.name || id,
      }));

      // 이름순 정렬
      commandList.sort((a, b) => a.name.localeCompare(b.name));

      res.json({ commands: commandList });
      return;
    }));

  /**
   * POST /commands/:commandId
   * 특정 명령어 실행
   */
  router.post('/', asyncHandler(async () => {
      throw Errors.badRequest('Command ID is required');
    }));

  router.post('/:commandId', asyncHandler(async (req: Request, res: Response) => {
      const rawCommandId = req.params.commandId;
      if (typeof rawCommandId !== 'string') {
        throw Errors.badRequest('Command ID is required');
      }

      // 트레일링 슬래시 정규화 (방어적 처리)
      const commandId = rawCommandId.replace(/\/$/, '');

      if (!commandId) {
        throw Errors.badRequest('Command ID is required');
      }

      // 위험한 명령어 차단
      if (isBlockedCommand(commandId)) {
        logger.warn(`Blocked command execution attempt: ${commandId}`);
        throw Errors.forbidden('This command is blocked for security reasons');
      }

      // @ts-expect-error - commands is internal API
      const commands = app.commands?.commands || {};

      if (!commands[commandId]) {
        throw Errors.notFound('Command', { commandId });
      }

      // 명령어 실행
      // @ts-expect-error - executeCommandById is internal API
      const result = app.commands.executeCommandById(commandId);

      res.json({
        message: 'Command executed',
        commandId,
        result: result ?? null,
      });
      return;
    }));

  return router;
}

/**
 * /open/:path 라우트를 위한 별도 라우터
 */
export function createOpenRouter(app: App): Router {
  const router = Router();

  /**
   * POST /open/:path
   * 파일을 에디터에서 열기
   */
  router.post('/', asyncHandler(async () => {
      throw Errors.badRequest('Path is required');
    }));

  router.post('/*', asyncHandler(async (req: Request, res: Response) => {
      const requestPath = extractRequestPath(req);
      if (!requestPath) {
        throw Errors.badRequest('Path is required');
      }

      // Path traversal 검증
      validatePath(requestPath);

      const normalizedPath = ensureMarkdownPath(requestPath);
      const file = getFileOrNull(app, normalizedPath);

      if (!file) {
        throw Errors.notFound('File', { path: normalizedPath });
      }

      // 새 탭 옵션 확인
      const newLeaf = req.query.newLeaf === 'true' || req.body?.newLeaf === true;

      // 파일 열기
      await app.workspace.getLeaf(newLeaf).openFile(file);

      res.json({
        message: 'File opened',
        path: normalizedPath,
        newLeaf,
      });
      return;
    }));

  return router;
}
