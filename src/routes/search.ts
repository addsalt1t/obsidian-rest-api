import { Router, Request, Response } from 'express';
import { App, TFile } from 'obsidian';
import * as jsonLogic from 'json-logic-js';
import safeRegex from 'safe-regex';
import { LRUCache } from 'lru-cache';
import type { RestSearchMatch, RestSearchResult, JsonLogicResult } from '@obsidian-workspace/shared-types';
import { extractAllTags } from '../utils/content';
import { escapeGlobPattern, escapeRegExp } from '../utils/regex';
import { mapWithConcurrency } from '../utils/concurrency';
import { getFileListCache } from '../services/fileListCache';
import {
  GLOB_CACHE_MAX_SIZE,
  MAX_JSONLOGIC_DEPTH,
  SEARCH_CONCURRENCY,
  SEARCH_CONTEXT_CHARS,
  MAX_MATCHES_PER_FILE,
  SEARCH_SCORE_MULTIPLIER,
  ERROR_MSG,
  MIME_TYPE,
} from '../constants';
import { executeDataviewQuery } from '../services/dataviewQuery';
import { parseStringParam, parsePagination } from '../utils/request-parsers';
import type { PaginationParams } from '../utils/request-parsers';
import { filterFilesByScopes } from '../utils/path-scope';
import { validatePath } from '../utils/path-validation';
import { createLogger } from '../utils/logger';
import { asyncHandler } from '../middleware/asyncHandler';
import { Errors } from '../middleware/error';
import { toErrorMessage } from '../utils/errors';
import {
  DEFAULT_RESPONSE_POLICY_SETTINGS,
  resolveSearchSimpleFields,
} from '../security/response-policy';

type PolicySettingsProvider = () => {
  allowSensitiveFields: boolean;
  sensitiveFieldAllowlist: string;
  legacyFullResponseCompat: boolean;
};

const logger = createLogger('Search');

// glob pattern cache (LRU: keeps frequently used patterns)
const globRegexCache = new LRUCache<string, RegExp>({
  max: GLOB_CACHE_MAX_SIZE,
});

// ReDoS-unsafe pattern rejection cache (avoids re-evaluation by safeRegex)
const unsafeGlobPatterns = new Set<string>();

/**
 * Type guard: both arguments must be strings.
 * Used by JsonLogic custom operations (glob, regex).
 */
function isStringPair(a: unknown, b: unknown): a is string {
  return typeof a === 'string' && typeof b === 'string';
}

/**
 * Compile a glob pattern to a cached RegExp.
 * Returns undefined when the pattern is rejected as unsafe (ReDoS).
 */
function compileGlobRegex(pattern: string): RegExp | undefined {
  // Return cached regex, or undefined when pattern is known-unsafe (cache miss + unsafe set hit)
  const cached = globRegexCache.get(pattern);
  if (cached || unsafeGlobPatterns.has(pattern)) return cached;

  const regexPattern = escapeGlobPattern(pattern)
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/{{GLOBSTAR}}/g, '.*');

  const fullPattern = `^${regexPattern}$`;

  if (!safeRegex(fullPattern)) {
    logger.warn(`Unsafe glob regex pattern rejected: "${pattern}"`);
    unsafeGlobPatterns.add(pattern);
    return undefined;
  }

  const regex = new RegExp(fullPattern);
  globRegexCache.set(pattern, regex);
  return regex;
}

/** Glob pattern matching (with LRU cache and ReDoS protection). */
function globMatch(pattern: string, value: string): boolean {
  const regex = compileGlobRegex(pattern);
  return regex !== undefined && regex.test(value);
}

// Register glob operator on JsonLogic
jsonLogic.add_operation('glob', (pattern: string, value: string) => {
  return isStringPair(pattern, value) && globMatch(pattern, value);
});

// Register regex operator on JsonLogic (with ReDoS protection via safe-regex)
jsonLogic.add_operation('regex', (pattern: string, value: string) => {
  if (!isStringPair(pattern, value)) return false;
  if (!safeRegex(pattern)) {
    logger.warn(`Unsafe regex pattern rejected: "${pattern}"`);
    return false;
  }
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
});

/** Apply pagination (offset + limit) to a result array. */
function applyPagination<T>(items: T[], pagination: PaginationParams): { items: T[]; total: number } {
  return {
    items: items.slice(pagination.offset, pagination.offset + pagination.limit),
    total: items.length,
  };
}

/** Count newlines before `index` to determine 1-based line number. */
function getLineNumberAt(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

/**
 * Recursively compute the nesting depth of a JSON value.
 * Returns early when depth exceeds MAX_JSONLOGIC_DEPTH (DoS prevention).
 */
function getJsonDepth(obj: unknown, current = 0): number {
  if (current > MAX_JSONLOGIC_DEPTH) return current;
  if (obj === null || typeof obj !== 'object') return current;
  if (Array.isArray(obj)) {
    return Math.max(current, ...obj.map(item => getJsonDepth(item, current + 1)));
  }
  return Math.max(current, ...Object.values(obj).map(v => getJsonDepth(v, current + 1)));
}

/** Build file metadata object used by JsonLogic evaluation. */
function buildFileData(file: TFile, app: App) {
  const cache = app.metadataCache.getFileCache(file);
  const allTags = extractAllTags(cache);

  return {
    path: file.path,
    name: file.basename,
    extension: file.extension,
    size: file.stat.size,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
    tags: allTags,
    frontmatter: cache?.frontmatter || {},
  };
}

/** Resolve basePath scope from query params or request body. */
function resolveScopePaths(
  query: Record<string, unknown>,
  body: unknown
): string[] | undefined {
  const queryBasePath = parseStringParam(query.basePath);
  if (queryBasePath) {
    validatePath(queryBasePath);
    return [queryBasePath];
  }

  // Extract basePath from plain-object body
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const bodyBasePath = parseStringParam((body as Record<string, unknown>).basePath);
    if (bodyBasePath) {
      validatePath(bodyBasePath);
      return [bodyBasePath];
    }
  }
  return undefined;
}

/**
 * Search a single file and collect regex matches with context.
 * Returns null when no matches are found.
 */
function searchFileForMatches(
  content: string,
  searchRegex: RegExp,
  filePath: string
): RestSearchResult | null {
  searchRegex.lastIndex = 0;
  const matches: RestSearchMatch[] = [];
  let regexMatch: RegExpExecArray | null;

  while ((regexMatch = searchRegex.exec(content)) !== null) {
    const index = regexMatch.index;
    const matchLength = regexMatch[0].length;
    const contextStart = Math.max(0, index - SEARCH_CONTEXT_CHARS);
    const contextEnd = Math.min(content.length, index + matchLength + SEARCH_CONTEXT_CHARS);

    matches.push({
      line: getLineNumberAt(content, index),
      context: content.slice(contextStart, contextEnd),
      match: { start: index - contextStart, end: index - contextStart + matchLength },
    });

    if (matches.length >= MAX_MATCHES_PER_FILE) break;
  }

  if (matches.length === 0) return null;
  const score = (matches.length * SEARCH_SCORE_MULTIPLIER) / Math.max(content.length, 1);
  return { path: filePath, score, matches };
}

export function createSearchRouter(
  app: App,
  getPolicySettings: PolicySettingsProvider = () => DEFAULT_RESPONSE_POLICY_SETTINGS,
): Router {
  const router = Router();
  const fileCache = getFileListCache(app);

  /** POST /search/glob/ - Glob pattern file search */
  router.post('/glob/', asyncHandler(async (req: Request, res: Response) => {
    const pattern = parseStringParam(req.query.pattern) || parseStringParam(req.body?.pattern);
    if (!pattern) {
      throw Errors.badRequest(ERROR_MSG.PATTERN_REQUIRED);
    }

    const pagination = parsePagination(req.query as Record<string, unknown>);
    const scopePaths = resolveScopePaths(req.query as Record<string, unknown>, req.body);
    const files = filterFilesByScopes(fileCache.getMarkdownFiles(), scopePaths);
    const matched = files
      .filter(f => globMatch(pattern, f.path))
      .map(f => ({ path: f.path }));

    const { items, total } = applyPagination(matched, pagination);
    res.json({ results: items, total, limit: pagination.limit, offset: pagination.offset });
    return;
  }));

  /** POST /search/simple/ - Text search with concurrent file scanning */
  router.post('/simple/', asyncHandler(async (req: Request, res: Response) => {
    const query = parseStringParam(req.query.query) || parseStringParam(req.body?.query);
    if (!query) {
      throw Errors.badRequest(ERROR_MSG.QUERY_REQUIRED);
    }

    const pagination = parsePagination(req.query as Record<string, unknown>);
    const scopePaths = resolveScopePaths(req.query as Record<string, unknown>, req.body);
    const includeFields = resolveSearchSimpleFields(req, getPolicySettings());
    const includeContext = includeFields.has('context');
    const includeOffset = includeFields.has('offset');
    const files = filterFilesByScopes(fileCache.getMarkdownFiles(), scopePaths);
    const escapedQuery = escapeRegExp(query);

    const allResults = await mapWithConcurrency(
      files,
      async (file): Promise<RestSearchResult | null> => {
        const content = await app.vault.cachedRead(file);
        return searchFileForMatches(content, new RegExp(escapedQuery, 'gi'), file.path);
      },
      SEARCH_CONCURRENCY
    );

    // Filter nulls and sort by score descending
    const results = allResults
      .filter((r): r is RestSearchResult => r !== null)
      .sort((a, b) => b.score - a.score);

    const { items, total } = applyPagination(results, pagination);
    const shapedItems = items.map((result) => ({
      path: result.path,
      score: result.score,
      matches: result.matches.map((match) => ({
        line: match.line,
        ...(includeContext && { context: match.context }),
        ...(includeOffset && { match: match.match }),
      })),
    }));

    res.json({ results: shapedItems, total, limit: pagination.limit, offset: pagination.offset });
    return;
  }));

  /**
   * JsonLogic query executor with early termination.
   * Stops scanning once enough results are collected (unless exactCount=true).
   * Reports hasMore/scanned/totalFiles when stopped early.
   */
  function executeJsonLogicQuery(
    query: unknown,
    pagination: PaginationParams,
    options: { exactCount?: boolean; scopePaths?: string[] } = {}
  ) {
    const results: JsonLogicResult[] = [];
    const files = filterFilesByScopes(fileCache.getMarkdownFiles(), options.scopePaths);
    const targetCount = pagination.offset + pagination.limit;
    let scannedCount = 0;
    let stoppedEarly = false;

    if (getJsonDepth(query) > MAX_JSONLOGIC_DEPTH) {
      throw Errors.invalidQuery(`JsonLogic query too deeply nested (max depth: ${MAX_JSONLOGIC_DEPTH})`);
    }

    if (!jsonLogic.is_logic(query)) {
      throw Errors.invalidQuery('Not a valid JsonLogic expression');
    }

    // Preflight validation: catch structural errors before scanning all files
    try {
      jsonLogic.apply(query, {});
    } catch (e) {
      throw Errors.invalidQuery(
        'JsonLogic structural error in query',
        { reason: toErrorMessage(e) }
      );
    }

    let errorCount = 0;
    let lastError: unknown;
    for (const file of files) {
      const data = buildFileData(file, app);
      scannedCount++;

      try {
        const result = jsonLogic.apply(query, data);
        if (result) results.push({ path: file.path, result });
        if (!options.exactCount && results.length >= targetCount) {
          stoppedEarly = true;
          break;
        }
      } catch (error) {
        errorCount++;
        lastError = error;
        logger.debug(`JsonLogic evaluation failed on ${file.path}:`, error);
      }
    }

    // All files errored: likely a query structural issue missed by preflight
    if (errorCount > 0 && errorCount === scannedCount && results.length === 0) {
      throw Errors.invalidQuery(
        'JsonLogic query failed on all files',
        { reason: toErrorMessage(lastError) }
      );
    }

    const items = results.slice(pagination.offset, pagination.offset + pagination.limit);

    return {
      results: items,
      total: results.length,
      limit: pagination.limit,
      offset: pagination.offset,
      ...(stoppedEarly && { hasMore: true, scanned: scannedCount, totalFiles: files.length }),
    };
  }

  /** POST /search/ - JsonLogic or Dataview DQL search (dispatched by Content-Type) */
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const contentType = req.headers['content-type'] || '';
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const scopePaths = resolveScopePaths(req.query as Record<string, unknown>, req.body);

    // JsonLogic query (explicit MIME or default JSON)
    if (contentType.includes(MIME_TYPE.JSONLOGIC) ||
        (contentType.includes(MIME_TYPE.JSON) && req.body)) {
      let query: unknown = req.body;
      try {
        if (typeof req.body === 'string') query = JSON.parse(req.body as string);
      } catch {
        throw Errors.invalidQuery('Invalid JSON body');
      }
      const exactCount = req.query.exactCount === 'true';
      return res.json(executeJsonLogicQuery(query, pagination, { exactCount, scopePaths }));
    }

    // Dataview DQL
    if (contentType.includes(MIME_TYPE.DATAVIEW_DQL)) {
      return res.json(await executeDataviewQuery(app, req.body));
    }

    throw Errors.badRequest('Unsupported Content-Type');
  }));

  return router;
}

/**
 * Clear glob regex caches.
 * Called on plugin unload.
 */
export function clearGlobCache(): void {
  globRegexCache.clear();
  unsafeGlobPatterns.clear();
}
