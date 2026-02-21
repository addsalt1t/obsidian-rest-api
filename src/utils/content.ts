/**
 * 공통 콘텐츠 처리 유틸리티
 */

import { Request } from 'express';
import { CachedMetadata } from 'obsidian';
import { Errors } from '../middleware/error';

/**
 * Request body에서 콘텐츠 추출
 * text/markdown과 application/json 모두 지원
 */
export function extractContent(req: Request): string {
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body.content === 'string') {
      return req.body.content;
    }
    throw Errors.badRequest(
      'Request body must be a string (text/markdown) or JSON with a "content" property'
    );
  }
  return '';
}

/**
 * Request body에서 append용 콘텐츠 추출
 * content 속성이 있으면 우선 사용
 */
export function extractAppendContent(req: Request): string {
  if (typeof req.body === 'string') {
    return req.body;
  }
  return req.body?.content || '';
}

/**
 * Obsidian 캐시에서 모든 태그 추출 (인라인 + 프론트매터)
 * @param cache - Obsidian 메타데이터 캐시
 * @param withHash - true면 #prefix 포함, false면 제거
 */
export function extractAllTags(cache: CachedMetadata | null, withHash = false): string[] {
  // 본문 인라인 태그 (#tag 형태)
  const inlineTags = cache?.tags?.map(t =>
    withHash ? t.tag : t.tag.replace(/^#/, '')
  ) || [];

  // 프론트매터 tags 배열
  const fmTags = cache?.frontmatter?.tags;
  const frontmatterTags = normalizeFrontmatterTags(fmTags, withHash);

  // 중복 제거하여 병합
  return [...new Set([...inlineTags, ...frontmatterTags])];
}

/**
 * 프론트매터 tags 필드 정규화
 */
function normalizeFrontmatterTags(fmTags: unknown, withHash: boolean): string[] {
  if (Array.isArray(fmTags)) {
    return fmTags.map(t => {
      const tag = String(t).replace(/^#/, '');
      return withHash ? `#${tag}` : tag;
    });
  }
  if (typeof fmTags === 'string') {
    const tag = fmTags.replace(/^#/, '');
    return [withHash ? `#${tag}` : tag];
  }
  return [];
}
