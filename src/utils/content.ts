/**
 * Common content processing utilities
 */

import { Request } from 'express';
import { CachedMetadata } from 'obsidian';
import { Errors } from '../middleware/error';

/**
 * Extract content from request body
 * Supports both text/markdown and application/json
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
 * Extract content for append operations from request body
 * Uses the content property if present
 */
export function extractAppendContent(req: Request): string {
  if (typeof req.body === 'string') {
    return req.body;
  }
  return req.body?.content || '';
}

/**
 * Extract all tags from Obsidian cache (inline + frontmatter)
 * @param cache - Obsidian metadata cache
 * @param withHash - If true, include # prefix; if false, remove it
 */
export function extractAllTags(cache: CachedMetadata | null, withHash = false): string[] {
  // Body inline tags (#tag format)
  const inlineTags = cache?.tags?.map(t =>
    withHash ? t.tag : t.tag.replace(/^#/, '')
  ) || [];

  // Frontmatter tags array
  const fmTags = cache?.frontmatter?.tags;
  const frontmatterTags = normalizeFrontmatterTags(fmTags, withHash);

  // Merge with deduplication
  return [...new Set([...inlineTags, ...frontmatterTags])];
}

/**
 * Normalize frontmatter tags field
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
