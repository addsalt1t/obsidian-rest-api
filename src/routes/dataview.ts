import { Router, Request, Response } from 'express';
import { App } from 'obsidian';
import { z } from 'zod';
import { QUERY_TIMEOUT_MS, DATAVIEW_MAX_RESULTS } from '../constants';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { createLogger } from '../utils/logger';

const logger = createLogger('Dataview');

const DataviewQuerySchema = z.object({
  query: z.string().min(1)
});

interface DataviewApi {
  query(query: string, sourcePath?: string): Promise<DataviewQueryResult>;
  pages(source?: string): DataArray<Record<string, unknown>>;
  pagePaths(source?: string): DataArray<string>;
}

interface DataviewQueryResult {
  successful: boolean;
  value?: {
    type: string;
    values: unknown[];
    headers?: string[];
  };
  error?: string;
}

interface DataArray<T> {
  values: T[];
  array(): T[];
}

function getDataviewApi(app: App): DataviewApi | null {
  // @ts-expect-error - plugins is not officially exposed in Obsidian API
  const dataviewPlugin = app.plugins?.plugins?.dataview;
  return dataviewPlugin?.api || null;
}

function createDataviewHandler(app: App, expectedType: string | null) {
  return asyncHandler(async (req: Request, res: Response) => {
      // Validate request body with Zod schema
      const parseResult = DataviewQuerySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw Errors.validationError('Invalid request body', parseResult.error.issues);
      }

      const { query } = parseResult.data;

      // Validate query type (all types allowed when expectedType is null)
      if (expectedType) {
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith(expectedType)) {
          throw Errors.invalidQuery(`This endpoint only accepts ${expectedType} queries. Use /dataview/query for other query types.`);
        }
      }

      const dataview = getDataviewApi(app)!;

      // Apply timeout
      const result = await Promise.race([
        dataview.query(query),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS)
        )
      ]);

      if (result.successful && result.value) {
        const values = result.value.values || [];
        const truncated = values.length > DATAVIEW_MAX_RESULTS;
        const limitedValues = truncated ? values.slice(0, DATAVIEW_MAX_RESULTS) : values;

        const response: Record<string, unknown> = {
          type: result.value.type,
          values: limitedValues,
          ...(truncated && { truncated: true, totalCount: values.length, limit: DATAVIEW_MAX_RESULTS }),
        };
        // Include headers for TABLE queries
        if (result.value.headers) {
          response.headers = result.value.headers;
        }
        res.json(response);
      } else {
        logger.warn('Dataview query failed', result.error);
        throw Errors.badRequest('Query execution failed');
      }
    });
}

export function createDataviewRouter(app: App): Router {
  const router = Router();

  // Middleware: Check if Dataview plugin is available
  router.use((_req, _res, next) => {
    const dataview = getDataviewApi(app);
    if (!dataview) {
      return next(Errors.pluginNotEnabled('Dataview'));
    }
    next();
  });

  router.post('/list', createDataviewHandler(app, 'LIST'));
  router.post('/task', createDataviewHandler(app, 'TASK'));
  router.post('/table', createDataviewHandler(app, 'TABLE'));
  router.post('/query', createDataviewHandler(app, null));

  return router;
}
