import { App } from 'obsidian';
import { DATAVIEW_MAX_RESULTS, QUERY_TIMEOUT_MS, ERROR_MSG } from '../constants';
import { createLogger } from '../utils/logger';
import { Errors } from '../middleware/error';
import { toErrorMessage } from '../utils/errors';

const logger = createLogger('Dataview');

/** Extract DQL string from body: string body directly, or .query property from object body. */
function parseDqlBody(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  const query = body && typeof body === 'object' && (body as Record<string, unknown>).query;
  return typeof query === 'string' && query || undefined;
}

export interface DataviewQueryResult {
  type: string;
  results: unknown[];
  headers?: string[];
  truncated?: true;
  totalCount?: number;
  limit?: number;
}

/**
 * Execute a Dataview DQL query and return the formatted result.
 * Throws ApiError on plugin-missing, empty query, or execution failure.
 */
export async function executeDataviewQuery(app: App, body: unknown): Promise<DataviewQueryResult> {
  // @ts-expect-error - Dataview plugin API (unofficial)
  const dataviewPlugin = app.plugins?.plugins?.dataview;

  if (!dataviewPlugin?.api) {
    throw Errors.pluginNotEnabled('Dataview');
  }

  const dql = parseDqlBody(body);
  if (!dql) {
    throw Errors.badRequest(ERROR_MSG.DQL_QUERY_REQUIRED);
  }

  try {
    let timeoutId: ReturnType<typeof setTimeout>;
    const result = await Promise.race([
      dataviewPlugin.api.query(dql),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timeoutId!);

    if (!result.successful) {
      logger.warn('Dataview query failed', result.error);
      throw Errors.badRequest('Dataview query failed');
    }

    const values = result.value.values || [];
    const truncated = values.length > DATAVIEW_MAX_RESULTS;

    return {
      type: result.value.type,
      results: values.slice(0, DATAVIEW_MAX_RESULTS),
      ...(result.value.headers && { headers: result.value.headers as string[] }),
      ...(truncated && { truncated: true as const, totalCount: values.length, limit: DATAVIEW_MAX_RESULTS }),
    };
  } catch (e) {
    if (e instanceof Error && 'statusCode' in e) throw e;
    logger.error('Dataview query execution failed', toErrorMessage(e));
    throw Errors.internal('Dataview query execution failed');
  }
}
