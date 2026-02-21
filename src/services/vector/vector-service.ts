/**
 * TF-IDF 벡터 계산, 코사인 유사도, 임베딩 캐시 관리
 *
 * basePath 파라미터로 대상 폴더를 지정할 수 있으며,
 * 미지정 시 볼트 전체 마크다운 파일을 대상으로 합니다.
 */
import type { App, TFile } from 'obsidian';
import type {
  VectorEmbeddingStatus,
  VectorEmbedResponse,
  VectorSearchResult,
  VectorSearchResponse,
} from '@obsidian-workspace/shared-types';
import { Errors } from '../../middleware/error';
import { mapWithConcurrency } from '../../utils/concurrency';
import {
  MAX_CACHE_SIZE,
  DEFAULT_VECTOR_LIMIT,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  EXCERPT_WINDOW,
  SEARCH_CONCURRENCY,
} from './constants';
import {
  ensureIdfAndVectors,
  getEmbeddingCount,
  getEmbeddingEntries,
  getEmbeddingPaths,
  getFromEmbeddingCache,
  setToEmbeddingCache,
} from './cache';
import { resolveScopedMarkdownFiles, resolveScopedMarkdownFilesWithPaths } from './scope';
import { tokenize, computeTfIdf, cosineSimilarity } from './tfidf';

export { tokenize, computeTfIdf, cosineSimilarity };

/**
 * 임베딩 상태 조회
 *
 * @param app - Obsidian App
 * @param basePath - 대상 폴더 경로 (없으면 볼트 전체)
 */
export async function getEmbeddingStatus(
  app: App,
  basePath?: string
): Promise<VectorEmbeddingStatus & { cacheMaxSize: number; cacheUsage: string }> {
  const targetFiles = resolveScopedMarkdownFiles(app, basePath);

  const targetPathSet = new Set(targetFiles.map((file) => file.path));
  let embeddedInScope = 0;
  for (const path of getEmbeddingPaths()) {
    if (targetPathSet.has(path)) {
      embeddedInScope++;
    }
  }

  return {
    totalDocuments: targetFiles.length,
    embeddedDocuments: embeddedInScope,
    pendingDocuments: Math.max(0, targetFiles.length - embeddedInScope),
    modelName: 'tfidf-local',
    cacheMaxSize: MAX_CACHE_SIZE,
    cacheUsage: `${getEmbeddingCount()}/${MAX_CACHE_SIZE}`,
  };
}

/**
 * 문서 임베딩 생성/업데이트
 *
 * @param app - Obsidian App
 * @param options.basePath - 대상 폴더 경로 (없으면 볼트 전체)
 * @param options.paths - 특정 파일만 임베딩 (basePath 내에서 필터)
 * @param options.force - 기존 임베딩 무시하고 재생성
 */
export async function embed(
  app: App,
  options: { basePath?: string; paths?: string[]; force?: boolean }
): Promise<VectorEmbedResponse> {
  const { basePath, paths, force = false } = options;

  const scopedPaths = paths && Array.isArray(paths) && paths.length > 0 ? paths : undefined;
  const targetFiles = resolveScopedMarkdownFilesWithPaths(app, { basePath, paths: scopedPaths });

  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;

  const filesToRead: typeof targetFiles = [];
  for (const file of targetFiles) {
    const cached = getFromEmbeddingCache(file.path);
    if (!force && cached && cached.mtime === file.stat.mtime) {
      skipped++;
    } else {
      filesToRead.push(file);
    }
  }

  const readResults = await mapWithConcurrency(
    filesToRead,
    async (file) => {
      try {
        const content = await app.vault.cachedRead(file);
        const cache = app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;

        const textParts = [file.basename];
        if (fm) {
          for (const value of Object.values(fm)) {
            if (typeof value === 'string') textParts.push(value);
          }
        }
        textParts.push(content);

        return { file, tokens: tokenize(textParts.join(' ')), error: null as string | null };
      } catch (err) {
        return {
          file,
          tokens: null as string[] | null,
          error: `${file.path}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  );

  for (const result of readResults) {
    if (result.error) {
      errors.push(result.error);
      continue;
    }

    if (result.tokens) {
      setToEmbeddingCache(result.file.path, {
        path: result.file.path,
        mtime: result.file.stat.mtime,
        vector: [],
        tokens: result.tokens,
      });
      processed++;
    }
  }

  // idfDirty is already set by setToEmbeddingCache for each inserted entry.
  // ensureIdfAndVectors() in vectorSearch() handles lazy rebuild on demand,
  // avoiding redundant full rebuilds after every embed() call.

  return { success: true, processed, skipped, errors };
}

/**
 * Compute scored candidates by comparing query vector against all embeddings.
 * Returns results sorted by descending similarity score.
 */
function computeScoredCandidates(
  queryVector: number[],
  scopedPathSet: Set<string> | null,
  threshold: number,
): Array<{ path: string; score: number }> {
  const results: Array<{ path: string; score: number }> = [];
  for (const entry of getEmbeddingEntries()) {
    if (scopedPathSet && !scopedPathSet.has(entry.path)) continue;
    const score = cosineSimilarity(queryVector, entry.vector);
    if (score >= threshold) results.push({ path: entry.path, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Build a single VectorSearchResult from a scored candidate.
 * Returns null if the file is missing or doesn't match the frontmatter filter.
 */
async function buildSearchResult(
  app: App,
  candidate: { path: string; score: number },
  fileMap: Map<string, TFile>,
  queryTokens: string[],
  frontmatterFilter?: Record<string, unknown>,
): Promise<VectorSearchResult | null> {
  const file = fileMap.get(candidate.path);
  if (!file) return null;

  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;

  // Frontmatter filter check
  if (frontmatterFilter) {
    if (!fm) return null;
    for (const [key, value] of Object.entries(frontmatterFilter)) {
      if (fm[key] !== value) return null;
    }
  }

  // Generate excerpt
  let excerpt: string | undefined;
  try {
    const content = await app.vault.cachedRead(file);
    for (const token of queryTokens) {
      const idx = content.toLowerCase().indexOf(token.toLowerCase());
      if (idx !== -1) {
        const start = Math.max(0, idx - EXCERPT_WINDOW);
        const end = Math.min(content.length, idx + token.length + EXCERPT_WINDOW);
        excerpt = '...' + content.substring(start, end).replace(/\n/g, ' ') + '...';
        break;
      }
    }
  } catch { /* excerpt generation failure is non-fatal */ }

  // Build frontmatter (exclude position key)
  let frontmatter: Record<string, unknown> | undefined;
  if (fm) {
    frontmatter = {};
    for (const [key, value] of Object.entries(fm)) {
      if (key !== 'position') frontmatter[key] = value;
    }
  }

  return {
    path: candidate.path,
    name: fm?.name || file.basename,
    score: Math.round(candidate.score * 1000) / 1000,
    frontmatter,
    excerpt,
  };
}

/**
 * 벡터 유사도 검색
 *
 * @param app - Obsidian App
 * @param options.query - 검색 쿼리
 * @param options.basePath - 검색 범위 폴더 (없으면 임베딩된 전체)
 * @param options.limit - 결과 수 제한
 * @param options.threshold - 최소 유사도 임계값
 * @param options.frontmatterFilter - frontmatter 키-값 필터
 */
export async function vectorSearch(
  app: App,
  options: {
    query: string;
    basePath?: string;
    limit?: number;
    threshold?: number;
    frontmatterFilter?: Record<string, unknown>;
  }
): Promise<VectorSearchResponse> {
  const {
    query,
    basePath,
    limit = DEFAULT_VECTOR_LIMIT,
    threshold = DEFAULT_SIMILARITY_THRESHOLD,
    frontmatterFilter,
  } = options;

  const safeLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);

  if (getEmbeddingCount() === 0) {
    throw Errors.badRequest('No embeddings found. Call POST /vector/embed first.');
  }

  const idf = ensureIdfAndVectors();
  const queryTokens = tokenize(query);
  const queryVector = computeTfIdf(queryTokens, idf);

  const scopedFiles = resolveScopedMarkdownFiles(app, basePath);
  const scopedPathSet = basePath ? new Set(scopedFiles.map(file => file.path)) : null;

  const candidates = computeScoredCandidates(queryVector, scopedPathSet, threshold);
  const fileMap = new Map(scopedFiles.map(file => [file.path, file]));

  // Over-fetch to account for frontmatter filter rejections, then parallelize I/O
  const OVERFETCH_FACTOR = frontmatterFilter ? 3 : 1;
  const candidatesToFetch = candidates.slice(0, safeLimit * OVERFETCH_FACTOR);

  const fetchedResults = await mapWithConcurrency(
    candidatesToFetch,
    (candidate) => buildSearchResult(app, candidate, fileMap, queryTokens, frontmatterFilter),
    SEARCH_CONCURRENCY,
  );

  const results = fetchedResults
    .filter((r): r is VectorSearchResult => r !== null)
    .slice(0, safeLimit);

  return { results, query, totalSearched: getEmbeddingCount() };
}
