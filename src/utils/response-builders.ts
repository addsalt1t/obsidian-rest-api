/**
 * note+json 응답 빌드 유틸리티
 *
 * vault, active, periodic, batch 라우트에서 반복되는
 * 메타데이터 응답 생성 로직을 통합한 공유 함수.
 *
 * 핵심 흐름:
 *   1. Obsidian metadataCache에서 frontmatter/tags/links 추출
 *   2. frontmatter의 position 속성 제거 (Obsidian 내부 필드)
 *   3. extractAllTags로 인라인 + 프론트매터 태그 통합 수집
 *   4. 캐시 불완전 시 parseMarkdownMetadata로 폴백
 *   5. stat 정보 포함하여 JSON 응답 빌드
 *
 * Anti-pattern: 이 함수를 사용하지 않고 각 라우트에서 인라인으로
 * frontmatter/tags를 추출하면 동작 불일치가 발생함
 * (예: active에서는 프론트매터 태그가 누락되는 등)
 */

import { App, TFile } from 'obsidian';
import { extractAllTags } from './content';
import { parseMarkdownMetadata } from '../services/markdownParser';

/**
 * note+json 응답에 포함될 필드 선택 옵션
 *
 * 기본값은 모든 필드 포함.
 * batch/metadata처럼 content가 필요 없는 경우 excludeContent: true 사용.
 * periodic처럼 links/stat이 필요 없는 경우 excludeLinks/excludeStat 사용.
 */
export interface NoteJsonOptions {
  /** true면 content 필드 제외 (batch/metadata용) */
  excludeContent?: boolean;
  /** true면 links 필드 제외 */
  excludeLinks?: boolean;
  /** true면 stat 필드 제외 */
  excludeStat?: boolean;
}

/** frontmatter의 position 속성을 제거한 클린 객체 반환 */
export function cleanFrontmatter(
  rawFrontmatter: Record<string, unknown> & { position?: unknown }
): Record<string, unknown> {
  const { position: _position, ...frontmatter } = rawFrontmatter;
  return frontmatter;
}

/**
 * frontmatter.tags에서 # prefix 제거 (일관성 보장)
 *
 * Obsidian metadataCache와 직접 파싱 간 # prefix 유무가 불일치할 수 있으므로
 * API 응답 전 통일적으로 제거한다.
 * - 배열: 각 요소에서 # 제거
 * - 문자열: # 제거
 */
export function stripTagHashes(frontmatter: Record<string, unknown>): void {
  if (Array.isArray(frontmatter.tags)) {
    frontmatter.tags = (frontmatter.tags as unknown[]).map(t => String(t).replace(/^#/, ''));
  } else if (typeof frontmatter.tags === 'string') {
    frontmatter.tags = frontmatter.tags.replace(/^#/, '');
  }
}

/**
 * 캐시가 불완전하여 파일 콘텐츠 폴백이 필요한지 판정
 *
 * metadata 라우트처럼 content를 따로 전달해야 하는 경우,
 * 이 함수로 vault.read 호출 필요 여부를 먼저 확인한다.
 * extractMetadataFields 내부의 폴백 조건과 동일한 로직을 사용하여
 * 판정 불일치를 방지한다.
 */
export function needsFallbackRead(app: App, file: TFile): boolean {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache) return true;

  const rawFrontmatter = cache.frontmatter || {};
  const frontmatter = cleanFrontmatter(
    rawFrontmatter as Record<string, unknown> & { position?: unknown }
  );
  const hasFrontmatterData = Object.keys(frontmatter).length > 0;
  const hasTagsData = extractAllTags(cache, true).length > 0;

  return !hasFrontmatterData && !hasTagsData;
}

/**
 * 캐시에서 frontmatter/tags를 추출하고, 캐시 불완전 시 content로 폴백
 *
 * buildNoteJsonResponse와 buildMetadataResponse의 공통 로직.
 * 동일한 추출/정제 흐름을 보장하여 라우트 간 동작 불일치를 방지한다.
 */
function extractMetadataFields(
  app: App,
  file: TFile,
  content: string,
): { frontmatter: Record<string, unknown>; tags: string[] } {
  const cache = app.metadataCache.getFileCache(file);

  const rawFrontmatter = cache?.frontmatter || {};
  const frontmatter = cleanFrontmatter(
    rawFrontmatter as Record<string, unknown> & { position?: unknown }
  );

  let tags = extractAllTags(cache, true);

  const hasFrontmatterData = Object.keys(frontmatter).length > 0;
  const hasTagsData = tags.length > 0;

  if (!cache || (!hasFrontmatterData && !hasTagsData)) {
    const parsed = parseMarkdownMetadata(content);
    if (!hasFrontmatterData) Object.assign(frontmatter, parsed.frontmatter);
    if (!hasTagsData) tags = parsed.tags;
  }

  stripTagHashes(frontmatter);

  return { frontmatter, tags };
}

/**
 * note+json 형식의 JSON 응답을 빌드
 *
 * @param app - Obsidian App 인스턴스
 * @param file - 대상 TFile
 * @param content - 파일 콘텐츠 (excludeContent=true면 사용되지 않으므로 빈 문자열 가능)
 * @param options - 필드 포함/제외 옵션
 * @returns note+json 응답 객체
 *
 * @example
 * // vault GET - 전체 필드 포함
 * const response = buildNoteJsonResponse(app, file, content);
 *
 * @example
 * // batch/metadata - content 없이 메타데이터만
 * const response = buildNoteJsonResponse(app, file, '', { excludeContent: true });
 */
export function buildNoteJsonResponse(
  app: App,
  file: TFile,
  content: string,
  options: NoteJsonOptions = {},
) {
  const { frontmatter, tags } = extractMetadataFields(app, file, content);
  const cache = app.metadataCache.getFileCache(file);

  // 기본 필드: path, name, frontmatter, tags
  const response: Record<string, unknown> = {
    path: file.path,
    name: file.basename,
  };

  if (!options.excludeContent) {
    response.content = content;
  }

  response.frontmatter = frontmatter;
  response.tags = tags;

  if (!options.excludeLinks) {
    response.links = cache?.links?.map(l => ({
      path: l.link,
      displayText: l.displayText,
    })) || [];
  }

  if (!options.excludeStat) {
    response.stat = {
      size: file.stat.size,
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
    };
  }

  return response;
}

/**
 * metadata 라우트 전용 응답 빌드 (backlinks 제외)
 *
 * metadata 라우트의 frontmatter/tags/links/stat 추출 로직을
 * buildNoteJsonResponse와 동일한 extractMetadataFields로 공유한다.
 * backlinks는 별도 서비스(backlinkCache)에서 가져오므로 호출부에서 추가.
 *
 * @param app - Obsidian App 인스턴스
 * @param file - 대상 TFile
 * @param normalizedPath - 정규화된 파일 경로 (응답의 path 필드에 사용)
 * @param content - 캐시 폴백용 파일 콘텐츠 (캐시 완전하면 사용되지 않음)
 * @returns backlinks를 제외한 metadata 응답 객체
 *
 * @example
 * const base = buildMetadataResponse(app, file, normalizedPath, content);
 * res.json({ ...base, backlinks });
 */
export function buildMetadataResponse(
  app: App,
  file: TFile,
  normalizedPath: string,
  content: string,
) {
  const { frontmatter, tags } = extractMetadataFields(app, file, content);
  const cache = app.metadataCache.getFileCache(file);

  const links = (cache?.links || []).map(l => ({
    path: l.link,
    displayText: l.displayText,
  }));

  return {
    path: normalizedPath,
    frontmatter,
    tags,
    links,
    stat: {
      size: file.stat.size,
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
    },
  };
}
