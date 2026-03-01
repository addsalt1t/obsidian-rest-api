/**
 * Heading-based patching service
 * Heading resolution and section-level patch operations
 */

import type {
  PatchOperation,
  HeadingInfo,
  HeadingResolveResult,
} from '@obsidian-workspace/shared-types';
import { normalizeOperation, type PatchResult } from './patch-constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type HeadingPatchHandler = (context: HeadingPatchContext) => string[];

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const HEADING_BOUNDARY_PATTERN = /^(#{1,6})(\s|$)/;

function parseHeadingLine(line: string): ParsedHeading | null {
  const match = line.match(HEADING_PATTERN);
  return (match && { level: match[1].length, text: match[2].trim() }) || null;
}

function trimHeadingStackByLevel(stack: ParsedHeading[], level: number): void {
  while (stack.length > 0 && stack[stack.length - 1].level >= level) {
    stack.pop();
  }
}

// ---------------------------------------------------------------------------
// Section finding
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section splitting & patch handlers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
