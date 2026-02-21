import type { App, TFile } from 'obsidian';
import { filterFilesByScopes, normalizeScopePath } from '../../utils/path-scope';
import { getFileListCache } from '../fileListCache';

interface FileListCacheStats {
  cached: boolean;
}

interface FileListCacheLike {
  getMarkdownFiles: () => TFile[];
  getStats?: () => FileListCacheStats;
}

const scopedFileCacheByApp = new WeakMap<App, Map<string, TFile[]>>();

function getOrCreateScopedCache(app: App): Map<string, TFile[]> {
  let cache = scopedFileCacheByApp.get(app);
  if (!cache) {
    cache = new Map<string, TFile[]>();
    scopedFileCacheByApp.set(app, cache);
  }
  return cache;
}

function normalizePathList(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort();
}

function buildScopeKey(basePath?: string, paths?: string[]): string {
  const normalizedBasePath = basePath ? normalizeScopePath(basePath) : '__ALL__';
  if (!paths || paths.length === 0) {
    return `base:${normalizedBasePath}`;
  }

  const normalizedPaths = normalizePathList(paths);
  return `base:${normalizedBasePath}|paths:${normalizedPaths.join('|')}`;
}

function syncScopeCacheWithFileListCache(app: App, fileCache: FileListCacheLike): Map<string, TFile[]> {
  const scopedCache = getOrCreateScopedCache(app);

  if (typeof fileCache.getStats === 'function') {
    const stats = fileCache.getStats();
    if (!stats.cached) {
      scopedCache.clear();
    }
  }

  return scopedCache;
}

export function resolveScopedMarkdownFiles(app: App, basePath?: string): TFile[] {
  const fileCache = getFileListCache(app) as unknown as FileListCacheLike;
  const scopedCache = syncScopeCacheWithFileListCache(app, fileCache);
  const scopeKey = buildScopeKey(basePath);

  const cached = scopedCache.get(scopeKey);
  if (cached) {
    return cached;
  }

  const allFiles = fileCache.getMarkdownFiles();
  const scopedFiles = filterFilesByScopes(allFiles, basePath ? [basePath] : undefined);
  scopedCache.set(scopeKey, scopedFiles);
  return scopedFiles;
}

export function resolveScopedMarkdownFilesWithPaths(
  app: App,
  options: { basePath?: string; paths?: string[] }
): TFile[] {
  const { basePath, paths } = options;
  if (!paths || paths.length === 0) {
    return resolveScopedMarkdownFiles(app, basePath);
  }

  const fileCache = getFileListCache(app) as unknown as FileListCacheLike;
  const scopedCache = syncScopeCacheWithFileListCache(app, fileCache);
  const scopeKey = buildScopeKey(basePath, paths);

  const cached = scopedCache.get(scopeKey);
  if (cached) {
    return cached;
  }

  const scopedFiles = resolveScopedMarkdownFiles(app, basePath);
  const pathSet = new Set(paths);
  const filtered = scopedFiles.filter(file => pathSet.has(file.path));
  scopedCache.set(scopeKey, filtered);
  return filtered;
}
