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
  // @ts-expect-error - plugins는 Obsidian API에 공식적으로 노출되지 않음
  const dataviewPlugin = app.plugins?.plugins?.dataview;
  return dataviewPlugin?.api || null;
}

function createDataviewHandler(app: App, expectedType: string | null) {
  return asyncHandler(async (req: Request, res: Response) => {
      // Zod 스키마로 요청 본문 검증
      const parseResult = DataviewQuerySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw Errors.validationError('Invalid request body', parseResult.error.issues);
      }

      const { query } = parseResult.data;

      // 쿼리 타입 검증 (expectedType이 null이면 모든 타입 허용)
      if (expectedType) {
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith(expectedType)) {
          throw Errors.invalidQuery(`This endpoint only accepts ${expectedType} queries. Use /dataview/query for other query types.`);
        }
      }

      const dataview = getDataviewApi(app)!;

      // 타임아웃 적용
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
        // TABLE 쿼리는 headers 포함
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

  // 미들웨어: Dataview 플러그인 존재 여부 확인
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
