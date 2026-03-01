/**
 * File patching service
 * Line, block, and frontmatter key-based patches.
 * Heading-based patching is in heading-patching.ts and re-exported here.
 */

import type { PatchOperation } from '@obsidian-workspace/shared-types';
import { escapeRegExp } from '../utils/regex';
import { formatYamlValue } from './yaml-formatter';
import { normalizeOperation, type PatchResult } from './patch-constants';

// Re-export heading-patching module for backward compatibility
export { resolveHeadingPath, patchByHeading } from './heading-patching';
export type { HeadingInfo, HeadingResolveResult } from './heading-patching';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type LineEnding = '\n' | '\r\n';

interface LinePatchContext {
  lines: string[];
  index: number;
  newContent: string;
}

interface BlockPatchContext {
  lines: string[];
  targetIndex: number;
  newContent: string;
  blockId: string;
}

type LinePatchHandler = (context: LinePatchContext) => void;
type BlockPatchHandler = (context: BlockPatchContext) => void;

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

// Omits optional trailing newline `(?:\r?\n)?` intentionally:
// patching operations need precise --- boundary without consuming trailing newline.
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

function detectLineEnding(content: string): LineEnding {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Determines whether a line is a top-level YAML boundary (next key/comment start).
 * Used to replace remaining lines of multiline values together.
 */
const TOP_LEVEL_YAML_KEY_OR_COMMENT = /^(?:#|([^"'#\s][^:]*|".*?"|'.*?')\s*:)/;
function isTopLevelYamlBoundary(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== '' && !(/^\s/.test(line)) && TOP_LEVEL_YAML_KEY_OR_COMMENT.test(trimmed);
}

// ---------------------------------------------------------------------------
// Line-based patch
// ---------------------------------------------------------------------------

const LINE_PATCH_HANDLERS: Record<PatchOperation, LinePatchHandler> = {
  append: ({ lines, index, newContent }) => {
    lines.splice(index + 1, 0, newContent);
  },
  prepend: ({ lines, index, newContent }) => {
    lines.splice(index, 0, newContent);
  },
  replace: ({ lines, index, newContent }) => {
    lines[index] = newContent;
  },
  delete: ({ lines, index }) => {
    lines.splice(index, 1);
  },
};

/**
 * Line-based patch
 * @param content - Original file content
 * @param lineNum - Line number (1-based)
 * @param operation - Patch operation type
 * @param newContent - New content
 */
export function patchByLine(
  content: string,
  lineNum: number,
  operation: PatchOperation | string,
  newContent: string
): PatchResult {
  const lines = content.split('\n');
  const index = lineNum - 1; // 1-based to 0-based

  if (index < 0 || index >= lines.length) {
    return { content, found: false };
  }

  const resultLines = [...lines];
  LINE_PATCH_HANDLERS[normalizeOperation(operation)]({ lines: resultLines, index, newContent });

  return { content: resultLines.join('\n'), found: true };
}

// ---------------------------------------------------------------------------
// Block ID-based patch
// ---------------------------------------------------------------------------

function blockIdSuffix(line: string, blockId: string): string {
  return line.match(/(\s*\^[\w-]+\s*)$/)?.[1] ?? ` ^${blockId}`;
}

const BLOCK_PATCH_HANDLERS: Record<PatchOperation, BlockPatchHandler> = {
  append: ({ lines, targetIndex, newContent }) => {
    lines.splice(targetIndex + 1, 0, newContent);
  },
  prepend: ({ lines, targetIndex, newContent }) => {
    lines.splice(targetIndex, 0, newContent);
  },
  replace: ({ lines, targetIndex, newContent, blockId }) => {
    lines[targetIndex] = newContent.replace(/\s*\^[\w-]+\s*$/, '') + blockIdSuffix(lines[targetIndex], blockId);
  },
  delete: ({ lines, targetIndex }) => {
    lines.splice(targetIndex, 1);
  },
};

/**
 * Block ID-based patch
 * @param content - Original file content
 * @param blockId - Block ID (without the ^ prefix from ^id format)
 * @param operation - Patch operation type
 * @param newContent - New content
 */
export function patchByBlock(
  content: string,
  blockId: string,
  operation: PatchOperation | string,
  newContent: string
): PatchResult {
  const lines = content.split('\n');
  const blockPattern = new RegExp(`\\^${escapeRegExp(blockId)}\\s*$`);

  let targetIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (blockPattern.test(lines[i])) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    return { content, found: false }; // Block not found
  }

  const resultLines = [...lines];
  BLOCK_PATCH_HANDLERS[normalizeOperation(operation)]({
    lines: resultLines,
    targetIndex,
    newContent,
    blockId,
  });

  return { content: resultLines.join('\n'), found: true };
}

// ---------------------------------------------------------------------------
// Frontmatter key patch
// ---------------------------------------------------------------------------

function parseFrontmatterValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function createFrontmatterFieldLines(key: string, value: string): string[] {
  const yamlValue = formatYamlValue(parseFrontmatterValue(value));
  return `${key}: ${yamlValue}`.split('\n');
}

function createFrontmatter(content: string, fieldLines: string[], lineEnding: LineEnding): string {
  return `---${lineEnding}${fieldLines.join(lineEnding)}${lineEnding}---${lineEnding}${lineEnding}${content}`;
}

function parseFrontmatterLines(frontmatterBody: string): string[] {
  return (frontmatterBody && frontmatterBody.split(/\r?\n/)) || [];
}

function findFrontmatterKeyIndex(frontmatterLines: string[], key: string): number {
  const keyLineRegex = new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(?:.*)$`);
  return frontmatterLines.findIndex((line) => keyLineRegex.test(line));
}

function findFrontmatterValueEnd(frontmatterLines: string[], startIndex: number): number {
  let endIndex = startIndex + 1;
  while (endIndex < frontmatterLines.length) {
    const line = frontmatterLines[endIndex];
    const indent = (line.match(/^\s*/) ?? [''])[0].length;
    if (indent <= 0 && isTopLevelYamlBoundary(line)) {
      return endIndex;
    }
    endIndex++;
  }
  return endIndex;
}

function upsertFrontmatterLines(
  frontmatterBody: string,
  key: string,
  newFieldLines: string[]
): string[] {
  const frontmatterLines = parseFrontmatterLines(frontmatterBody);
  const keyLineIndex = findFrontmatterKeyIndex(frontmatterLines, key);

  if (keyLineIndex === -1) {
    return [...frontmatterLines, ...newFieldLines];
  }

  const endIndex = findFrontmatterValueEnd(frontmatterLines, keyLineIndex);
  return [
    ...frontmatterLines.slice(0, keyLineIndex),
    ...newFieldLines,
    ...frontmatterLines.slice(endIndex),
  ];
}

function replaceFrontmatter(content: string, frontmatterLines: string[], lineEnding: LineEnding): string {
  const newFrontmatter = frontmatterLines.join(lineEnding);
  return content.replace(
    FRONTMATTER_PATTERN,
    `---${lineEnding}${newFrontmatter}${lineEnding}---`
  );
}

/**
 * Frontmatter key patch
 * @param content - Original file content
 * @param key - Frontmatter key
 * @param value - New value (JSON string or plain string)
 */
export function patchFrontmatterKey(content: string, key: string, value: string): string {
  const lineEnding = detectLineEnding(content);
  const newFieldLines = createFrontmatterFieldLines(key, value);

  const frontmatterMatch = content.match(FRONTMATTER_PATTERN);

  if (!frontmatterMatch) {
    return createFrontmatter(content, newFieldLines, lineEnding);
  }

  const updatedFrontmatterLines = upsertFrontmatterLines(frontmatterMatch[1], key, newFieldLines);
  return replaceFrontmatter(content, updatedFrontmatterLines, lineEnding);
}
