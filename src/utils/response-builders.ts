/**
 * note+json response builder utilities
 *
 * Shared functions that consolidate the repeated metadata response
 * generation logic across vault, active, periodic, and batch routes.
 *
 * Core flow:
 *   1. Extract frontmatter/tags/links from Obsidian metadataCache
 *   2. Remove the position property from frontmatter (Obsidian internal field)
 *   3. Collect both inline and frontmatter tags via extractAllTags
 *   4. Fall back to parseMarkdownMetadata when cache is incomplete
 *   5. Build JSON response including stat information
 *
 * Anti-pattern: Extracting frontmatter/tags inline in each route instead
 * of using this function leads to behavioral inconsistencies
 * (e.g., frontmatter tags being omitted in the active route)
 */

import { App, TFile } from 'obsidian';
import { extractAllTags } from './content';
import { parseMarkdownMetadata } from '../services/markdownParser';

/**
 * Field selection options for note+json responses
 *
 * All fields are included by default.
 * Use excludeContent: true for batch/metadata where content is not needed.
 * Use excludeLinks/excludeStat for periodic where links/stat are not needed.
 */
export interface NoteJsonOptions {
  /** If true, exclude the content field (for batch/metadata) */
  excludeContent?: boolean;
  /** If true, exclude the links field */
  excludeLinks?: boolean;
  /** If true, exclude the stat field */
  excludeStat?: boolean;
}

/** Return a clean object with the position property removed from frontmatter */
export function cleanFrontmatter(
  rawFrontmatter: Record<string, unknown> & { position?: unknown }
): Record<string, unknown> {
  const { position: _position, ...frontmatter } = rawFrontmatter;
  return frontmatter;
}

/**
 * Strip # prefix from frontmatter.tags for consistency
 *
 * The presence of the # prefix may differ between Obsidian metadataCache
 * and direct parsing, so we uniformly remove it before API responses.
 * - Array: remove # from each element
 * - String: remove #
 */
export function stripTagHashes(frontmatter: Record<string, unknown>): void {
  if (Array.isArray(frontmatter.tags)) {
    frontmatter.tags = (frontmatter.tags as unknown[]).map(t => String(t).replace(/^#/, ''));
  } else if (typeof frontmatter.tags === 'string') {
    frontmatter.tags = frontmatter.tags.replace(/^#/, '');
  }
}

/**
 * Determine if a fallback file content read is needed due to incomplete cache
 *
 * For routes like metadata that need content passed separately,
 * use this function to check whether a vault.read call is necessary.
 * Uses the same logic as the fallback condition in extractMetadataFields
 * to prevent judgment inconsistencies.
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
 * Extract frontmatter/tags from cache, falling back to content when cache is incomplete
 *
 * Shared logic for buildNoteJsonResponse and buildMetadataResponse.
 * Ensures identical extraction/refinement flow to prevent behavioral
 * inconsistencies between routes.
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
 * Build a JSON response in note+json format
 *
 * @param app - Obsidian App instance
 * @param file - Target TFile
 * @param content - File content (can be empty string if excludeContent=true)
 * @param options - Field include/exclude options
 * @returns note+json response object
 *
 * @example
 * // vault GET - include all fields
 * const response = buildNoteJsonResponse(app, file, content);
 *
 * @example
 * // batch/metadata - metadata only without content
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

  // Base fields: path, name, frontmatter, tags
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
 * Build a metadata route response (excluding backlinks)
 *
 * Shares the same extractMetadataFields logic with buildNoteJsonResponse
 * for frontmatter/tags/links/stat extraction in the metadata route.
 * Backlinks are fetched from a separate service (backlinkCache) and
 * should be added by the caller.
 *
 * @param app - Obsidian App instance
 * @param file - Target TFile
 * @param normalizedPath - Normalized file path (used for the path field in response)
 * @param content - File content for cache fallback (unused if cache is complete)
 * @returns Metadata response object excluding backlinks
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
