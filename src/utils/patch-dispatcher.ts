/**
 * PATCH target type dispatcher
 *
 * Routes PATCH requests to the appropriate filePatching function
 * based on the target type (heading, block, line, frontmatter).
 *
 * Used by vault.ts, active.ts, and periodic.ts route handlers
 * to eliminate duplicated dispatch logic.
 */

import {
  patchByHeading,
  patchByLine,
  patchByBlock,
  patchFrontmatterKey,
} from '../services/filePatching';

export interface PatchParams {
  /** Target type: 'heading' | 'block' | 'line' | 'frontmatter' | 'frontmatter-key' */
  targetType: string;
  /** Target identifier (heading path, block ID, line number, frontmatter key) */
  target: string;
  /** Patch operation: 'replace' | 'append' | 'prepend' | 'delete' */
  operation: string;
  /** New content to apply */
  content: string;
}

export interface PatchDispatchResult {
  /** Resulting file content after patch */
  content: string;
  /** Whether the target was found (always true for frontmatter and fallback) */
  found: boolean;
  /** Human-readable label for error messages (e.g., "Heading 'Section'", "Line 42") */
  targetLabel?: string;
  /** True when no recognized targetType matched -- content is the raw replacement */
  fallback?: boolean;
}

/**
 * Dispatch a PATCH operation to the appropriate filePatching function.
 *
 * @param fileContent - Current file content
 * @param params - Patch parameters (targetType, target, operation, content)
 * @returns Patch result with new content and found status
 *
 * @example
 * ```ts
 * const result = dispatchPatch(existingContent, {
 *   targetType: 'heading',
 *   target: 'Section::Subsection',
 *   operation: 'replace',
 *   content: 'New section content',
 * });
 * if (!result.found) {
 *   // handle not-found using result.targetLabel
 * }
 * ```
 */
export function dispatchPatch(
  fileContent: string,
  params: PatchParams,
): PatchDispatchResult {
  const { targetType, target, operation, content } = params;

  if (targetType === 'heading' && target) {
    const patchResult = patchByHeading(fileContent, target, operation, content);
    return {
      content: patchResult.content,
      found: patchResult.found,
      targetLabel: patchResult.found ? undefined : `Heading '${target}'`,
    };
  }

  if (targetType === 'block' && target) {
    const patchResult = patchByBlock(fileContent, target, operation, content);
    return {
      content: patchResult.content,
      found: patchResult.found,
      targetLabel: patchResult.found ? undefined : `Block '${target}'`,
    };
  }

  if (targetType === 'line' && target) {
    const lineNum = parseInt(target, 10);
    const patchResult = patchByLine(fileContent, lineNum, operation, content);
    return {
      content: patchResult.content,
      found: patchResult.found,
      targetLabel: patchResult.found ? undefined : `Line ${lineNum}`,
    };
  }

  if ((targetType === 'frontmatter-key' || targetType === 'frontmatter') && target) {
    const newContent = patchFrontmatterKey(fileContent, target, content);
    return {
      content: newContent,
      found: true,
    };
  }

  // Fallback: no recognized target type -- use raw content as full replacement
  return {
    content: content,
    found: true,
    fallback: true,
  };
}
