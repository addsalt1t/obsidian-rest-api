import { Router, Request, Response } from 'express';
import { App, moment, normalizePath } from 'obsidian';
import type { PeriodicNotePeriod } from '@obsidian-workspace/shared-types';
import { extractAppendContent } from '../utils/content';
import { dispatchPatch } from '../utils/patch-dispatcher';
import { buildNoteJsonResponse } from '../utils/response-builders';
import { getFileOrNull, ensureParentFolder } from '../utils/file-helpers';
import { Errors } from '../middleware/error';
import { MIME_TYPE } from '../constants';
import { parsePatchRequestParts } from '../utils/patch-request';
import { asyncHandler } from '../middleware/asyncHandler';
import { waitForMetadataReady } from '../utils/metadata-ready';
import { parsePeriodicRequest } from './periodic-context';

interface PeriodicNotesPlugin {
  settings: {
    daily: { folder: string; format: string; template: string };
    weekly: { folder: string; format: string; template: string };
    monthly: { folder: string; format: string; template: string };
    quarterly: { folder: string; format: string; template: string };
    yearly: { folder: string; format: string; template: string };
  };
}

export function createPeriodicRouter(app: App): Router {
  const router = Router();
  const momentFactory = moment as unknown as (input?: {
    year?: number;
    month?: number;
    day?: number;
  }) => { format: (format: string) => string };

  /**
   * Get Periodic Notes plugin settings
   */
  function getPeriodicNotesPlugin(): PeriodicNotesPlugin | null {
    // @ts-expect-error - Periodic Notes plugin API
    const plugin = app.plugins?.plugins?.['periodic-notes'];
    return plugin || null;
  }

  /**
   * Generate note path based on date
   */
  function getNotePath(period: PeriodicNotePeriod, year?: number, month?: number, day?: number): string | null {
    const plugin = getPeriodicNotesPlugin();

    // Default settings (when Periodic Notes plugin is not installed)
    const defaultSettings: Record<PeriodicNotePeriod, { folder: string; format: string }> = {
      daily: { folder: '', format: 'YYYY-MM-DD' },
      weekly: { folder: '', format: 'YYYY-[W]ww' },
      monthly: { folder: '', format: 'YYYY-MM' },
      quarterly: { folder: '', format: 'YYYY-[Q]Q' },
      yearly: { folder: '', format: 'YYYY' },
    };

    const settings = plugin?.settings?.[period] || defaultSettings[period];
    const folder = settings.folder || '';
    const format = settings.format || defaultSettings[period].format;

    // Calculate date
    let date = momentFactory();
    if (year !== undefined) {
      date = momentFactory({ year, month: (month ?? 1) - 1, day: day ?? 1 });
    }

    const filename = date.format(format) + '.md';
    const raw = folder ? `${folder}/${filename}` : filename;
    return normalizePath(raw);
  }

  function resolvePeriodicNotePathFromRequest(req: Request): string {
    const { period, year, month, day } = parsePeriodicRequest(
      req.params as Record<string, string | undefined>,
    );

    if (!period) {
      throw Errors.badRequest('Invalid period. Use: daily, weekly, monthly, quarterly, yearly');
    }

    const notePath = getNotePath(period, year, month, day);
    if (!notePath) {
      throw Errors.badRequest('Could not determine note path');
    }

    return notePath;
  }

  /**
   * GET /periodic/:period/
   * GET /periodic/:period/:year/
   * GET /periodic/:period/:year/:month/
   * GET /periodic/:period/:year/:month/:day/
   */
  router.get(['/:period/', '/:period/:year/', '/:period/:year/:month/', '/:period/:year/:month/:day/'], asyncHandler(async (req: Request, res: Response) => {
      const notePath = resolvePeriodicNotePathFromRequest(req);

      const file = getFileOrNull(app, notePath);
      if (!file) {
        throw Errors.notFound('Periodic note', { path: notePath });
      }

      const acceptHeader = req.headers.accept || 'text/markdown';

      const content = await app.vault.read(file);

      if (acceptHeader.includes(MIME_TYPE.NOTE_JSON)) {
        return res.json(buildNoteJsonResponse(app, file, content, {
          excludeLinks: true,
        }));
      }

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(content);
      return;
    }));

  /**
   * PUT /periodic/:period/...
   * Create or overwrite a periodic note
   */
  router.put(['/:period/', '/:period/:year/', '/:period/:year/:month/', '/:period/:year/:month/:day/'], asyncHandler(async (req: Request, res: Response) => {
      const notePath = resolvePeriodicNotePathFromRequest(req);

      const content = extractAppendContent(req);
      const existingFile = getFileOrNull(app, notePath);

      if (existingFile) {
        await app.vault.modify(existingFile, content);
        await waitForMetadataReady(app, notePath, { forceWait: true });
        res.json({ message: 'Periodic note updated', path: notePath });
      } else {
        // Create folder if it doesn't exist
        await ensureParentFolder(app, notePath);
        await app.vault.create(notePath, content);
        await waitForMetadataReady(app, notePath);
        res.status(201).json({ message: 'Periodic note created', path: notePath });
      }
      return;
    }));

  /**
   * POST /periodic/:period/...
   * Append content to the end of a periodic note
   */
  router.post(['/:period/', '/:period/:year/', '/:period/:year/:month/', '/:period/:year/:month/:day/'], asyncHandler(async (req: Request, res: Response) => {
      const notePath = resolvePeriodicNotePathFromRequest(req);

      const file = getFileOrNull(app, notePath);
      if (!file) {
        throw Errors.notFound(`Periodic note not found: ${notePath}`);
      }

      const content = extractAppendContent(req);
      const existingContent = await app.vault.read(file);
      const newContent = existingContent + '\n' + content;

      await app.vault.modify(file, newContent);
      await waitForMetadataReady(app, notePath, { forceWait: true });
      res.json({ message: 'Content appended to periodic note', path: notePath });
      return;
    }));

  /**
   * PATCH /periodic/:period/...
   * Partially modify a periodic note
   */
  router.patch(['/:period/', '/:period/:year/', '/:period/:year/:month/', '/:period/:year/:month/:day/'], asyncHandler(async (req: Request, res: Response) => {
      const notePath = resolvePeriodicNotePathFromRequest(req);

      const file = getFileOrNull(app, notePath);
      if (!file) {
        throw Errors.notFound(`Periodic note not found: ${notePath}`);
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
        const err = Errors.notFound(result.targetLabel!, { file: notePath });
        return res.status(err.statusCode).json(err.toResponse());
      }

      const newContent = result.content;

      await app.vault.modify(file, newContent);
      await waitForMetadataReady(app, notePath, { forceWait: true });
      res.json({ message: 'Periodic note patched', path: notePath });
      return;
    }));

  return router;
}
