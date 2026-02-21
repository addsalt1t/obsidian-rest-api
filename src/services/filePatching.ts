/**
 * File patching service
 * Unified patch logic for heading, line, and frontmatter key-based patches
 */

import type {
  PatchOperation,
  HeadingInfo,
  HeadingResolveResult,
} from '@obsidian-workspace/shared-types';
import { escapeRegExp } from '../utils/regex';
import { formatYamlValue } from './yaml-formatter';

type LineEnding = '\n' | '\r\n';

interface ParsedHeading {
  level: number;
  text: string;
}

interface HeadingSectionRange {
  start: number;
  end: number;
}

interface HeadingSectionSlices {
  beforeWithoutHeading: string[];
  beforeWithHeading: string[];
  sectionBody: string[];
  after: string[];
}

interface HeadingPatchContext {
  lines: string[];
  range: HeadingSectionRange;
  newContent: string;
}

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

type HeadingPatchHandler = (context: HeadingPatchContext) => string[];
type LinePatchHandler = (context: LinePatchContext) => void;
type BlockPatchHandler = (context: BlockPatchContext) => void;

// Omits optional trailing newline `(?:\r?\n)?` intentionally:
// patching operations need precise --- boundary without consuming trailing newline.
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const OPERATION_BY_NAME: Record<string, PatchOperation> = {
  append: 'append',
  prepend: 'prepend',
  replace: 'replace',
  delete: 'delete',
};

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

function parseHeadingLine(line: string): ParsedHeading | null {
  const match = line.match(HEADING_PATTERN);
  return (match && { level: match[1].length, text: match[2].trim() }) || null;
}

function trimHeadingStackByLevel(stack: ParsedHeading[], level: number): void {
  while (stack.length > 0 && stack[stack.length - 1].level >= level) {
    stack.pop();
  }
}

function normalizeOperation(operation: PatchOperation | string): PatchOperation {
  return OPERATION_BY_NAME[operation] ?? 'replace';
}

interface PatchResult {
  content: string;
  found: boolean;
}

export type { HeadingInfo, HeadingResolveResult };

/**
 * Resolve full path by heading text
 * @param content - File content
 * @param headingText - Heading text to find (e.g., "Subsection")
 * @returns Resolution result (found headings and whether there are duplicates)
 */
export function resolveHeadingPath(content: string, headingText: string): HeadingResolveResult {
  const lines = content.split('\n');
  const headingStack: ParsedHeading[] = [];
  const foundHeadings: HeadingInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parsedHeading = parseHeadingLine(lines[i]);
    if (!parsedHeading) {
      continue;
    }

    trimHeadingStackByLevel(headingStack, parsedHeading.level);
    headingStack.push(parsedHeading);

    if (parsedHeading.text === headingText) {
      foundHeadings.push({
        level: parsedHeading.level,
        text: parsedHeading.text,
        fullPath: headingStack.map((h) => h.text).join('::'),
        line: i,
      });
    }
  }

  if (foundHeadings.length === 0) {
    return {
      headings: [],
      ambiguous: false,
      error: `Heading '${headingText}' not found`,
    };
  }

  return {
    headings: foundHeadings,
    ambiguous: foundHeadings.length > 1,
  };
}

const HEADING_BOUNDARY_PATTERN = /^(#{1,6})(\s|$)/;

function findHeadingSectionEnd(lines: string[], startLine: number, level: number): number {
  for (let i = startLine; i < lines.length; i++) {
    const match = lines[i].match(HEADING_BOUNDARY_PATTERN);
    if (match && match[1].length <= level) {
      return i;
    }
  }
  return lines.length;
}

function findHeadingSectionByPath(lines: string[], headingPath: string[]): HeadingSectionRange | null {
  let currentLevel = 0;
  let targetStartIndex = -1;
  let currentPathIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const heading = parseHeadingLine(lines[i]);
    if (!heading) {
      continue;
    }

    const pathMatched =
      currentPathIndex < headingPath.length && heading.text === headingPath[currentPathIndex];
    if (pathMatched) {
      const isTarget = currentPathIndex === headingPath.length - 1;
      currentPathIndex++;
      if (!isTarget) {
        continue;
      }
      targetStartIndex = i;
      currentLevel = heading.level;
      continue;
    }

    if (targetStartIndex !== -1 && heading.level <= currentLevel) {
      return { start: targetStartIndex, end: i };
    }
  }

  return targetStartIndex !== -1 ? { start: targetStartIndex, end: lines.length } : null;
}

function findHeadingSectionByTitle(lines: string[], title: string): HeadingSectionRange | null {
  for (let i = 0; i < lines.length; i++) {
    const heading = parseHeadingLine(lines[i]);
    if (!heading || heading.text !== title) {
      continue;
    }
    return {
      start: i,
      end: findHeadingSectionEnd(lines, i + 1, heading.level),
    };
  }
  return null;
}

function resolveHeadingSection(lines: string[], headingPath: string[]): HeadingSectionRange | null {
  return findHeadingSectionByPath(lines, headingPath)
    ?? findHeadingSectionByTitle(lines, headingPath[headingPath.length - 1]);
}

function splitHeadingSection(lines: string[], range: HeadingSectionRange): HeadingSectionSlices {
  return {
    beforeWithoutHeading: lines.slice(0, range.start),
    beforeWithHeading: lines.slice(0, range.start + 1),
    sectionBody: lines.slice(range.start + 1, range.end),
    after: lines.slice(range.end),
  };
}

const HEADING_PATCH_HANDLERS: Record<PatchOperation, HeadingPatchHandler> = {
  append: ({ lines, range, newContent }) => {
    const section = splitHeadingSection(lines, range);
    return [...section.beforeWithHeading, ...section.sectionBody, newContent, ...section.after];
  },
  prepend: ({ lines, range, newContent }) => {
    const section = splitHeadingSection(lines, range);
    return [...section.beforeWithHeading, newContent, ...section.sectionBody, ...section.after];
  },
  replace: ({ lines, range, newContent }) => {
    const section = splitHeadingSection(lines, range);
    return [...section.beforeWithHeading, newContent, ...section.after];
  },
  delete: ({ lines, range }) => {
    const section = splitHeadingSection(lines, range);
    return [...section.beforeWithoutHeading, ...section.after];
  },
};

/**
 * Heading-based patch
 * @param content - Original file content
 * @param heading - Heading path (e.g., "Section::Subsection")
 * @param operation - Patch operation type
 * @param newContent - New content
 */
export function patchByHeading(
  content: string,
  heading: string,
  operation: PatchOperation | string,
  newContent: string
): PatchResult {
  const lines = content.split('\n');
  const headingPath = heading.split('::');
  const sectionRange = resolveHeadingSection(lines, headingPath);

  if (!sectionRange) {
    return { content, found: false };
  }

  const resultLines = HEADING_PATCH_HANDLERS[normalizeOperation(operation)]({
    lines,
    range: sectionRange,
    newContent,
  });

  return { content: resultLines.join('\n'), found: true };
}

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
