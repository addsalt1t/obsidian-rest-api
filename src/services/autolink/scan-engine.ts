import type {
  AutolinkLinkifyChange,
  AutolinkScanMatch,
} from '@obsidian-workspace/shared-types';
import {
  CONTEXT_WINDOW_AFTER,
  CONTEXT_WINDOW_BEFORE,
} from './constants';
import type { NameEntry } from './types';

const CJK_CHAR_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u3040-\u30FF]/u;
const HANGUL_CHAR_PATTERN = /[\uAC00-\uD7AF]/u;

function isCjkText(text: string): boolean {
  return CJK_CHAR_PATTERN.test(text);
}

function isHangulText(text: string): boolean {
  return HANGUL_CHAR_PATTERN.test(text);
}

function hasStrictKoreanSingleCharBoundary(
  line: string,
  matchStart: number,
  matchEnd: number,
  matchedText: string
): boolean {
  if (matchedText.length !== 1 || !isHangulText(matchedText)) {
    return true;
  }

  const previousChar = matchStart > 0 ? line[matchStart - 1] : '';
  const nextChar = matchEnd < line.length ? line[matchEnd] : '';

  return !isHangulText(previousChar) && !isHangulText(nextChar);
}

function getScanConfidence(
  matchedText: string,
  entity: NameEntry['entity'],
  passesKoreanSingleCharBoundary: boolean
): 'high' | 'medium' | 'low' {
  if (matchedText.length <= 2) {
    if (!passesKoreanSingleCharBoundary) {
      return 'low';
    }
    if (isCjkText(matchedText) && matchedText === entity.name) {
      return 'high';
    }
    return 'low';
  }
  if (entity.aliases.includes(matchedText) && matchedText !== entity.name) {
    return 'medium';
  }
  return 'high';
}

function getLinkifyConfidence(
  matchedText: string,
  entity: NameEntry['entity'],
  passesKoreanSingleCharBoundary: boolean
): 'high' | 'medium' | 'low' {
  if (matchedText.length <= 2) {
    if (!passesKoreanSingleCharBoundary) {
      return 'low';
    }
    if (
      isCjkText(matchedText) &&
      matchedText.toLowerCase() === entity.name.toLowerCase()
    ) {
      return 'high';
    }
    return 'low';
  }
  if (matchedText.toLowerCase() !== entity.name.toLowerCase()) {
    return 'medium';
  }
  return 'high';
}

interface ScanEngineParams {
  filePath: string;
  lines: string[];
  sortedNames: NameEntry[];
  patternMap: Map<string, RegExp>;
}

export function runScanEngine({
  filePath,
  lines,
  sortedNames,
  patternMap,
}: ScanEngineParams): {
  fileMatches: AutolinkScanMatch[];
  fileByEntity: Record<string, number>;
} {
  const fileMatches: AutolinkScanMatch[] = [];
  const fileByEntity: Record<string, number> = {};

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const alreadyMatched = new Set<number>();

    for (const { name, entity } of sortedNames) {
      const shared = patternMap.get(name);
      if (!shared) {
        continue;
      }
      // Clone to avoid shared mutable lastIndex state across concurrent calls
      const pattern = new RegExp(shared.source, shared.flags);

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const col = match.index;
        const matchLength = match[0].length;

        let overlaps = false;
        for (let i = col; i < col + matchLength; i++) {
          if (alreadyMatched.has(i)) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) {
          continue;
        }

        for (let i = col; i < col + matchLength; i++) {
          alreadyMatched.add(i);
        }

        const matchedText = match[1];
        const passesKoreanSingleCharBoundary = hasStrictKoreanSingleCharBoundary(
          line,
          col,
          col + matchLength,
          matchedText
        );
        const context = line.substring(
          Math.max(0, col - CONTEXT_WINDOW_BEFORE),
          Math.min(line.length, col + matchLength + CONTEXT_WINDOW_AFTER)
        );

        fileMatches.push({
          entityName: entity.name,
          entityPath: entity.path,
          matchedText,
          filePath,
          line: lineNum + 1,
          column: col,
          context,
          confidence: getScanConfidence(
            matchedText,
            entity,
            passesKoreanSingleCharBoundary
          ),
        });

        fileByEntity[entity.name] = (fileByEntity[entity.name] || 0) + 1;
      }
    }
  }

  return { fileMatches, fileByEntity };
}

interface LinkifyEngineParams extends ScanEngineParams {
  dryRun: boolean;
  autoConfirm: boolean;
}

export function runLinkifyEngine({
  filePath,
  lines,
  sortedNames,
  patternMap,
  dryRun,
  autoConfirm,
}: LinkifyEngineParams): {
  updatedLines: string[];
  fileChanges: AutolinkLinkifyChange[];
  fileModified: boolean;
  fileSkipped: number;
} {
  const updatedLines = [...lines];
  const fileChanges: AutolinkLinkifyChange[] = [];
  let fileModified = false;
  let fileSkipped = 0;

  for (let lineNum = 0; lineNum < updatedLines.length; lineNum++) {
    let line = updatedLines[lineNum];
    const originalLine = line;

    for (const { name, entity } of sortedNames) {
      const shared = patternMap.get(name);
      if (!shared) {
        continue;
      }
      // Clone to avoid shared mutable lastIndex state across concurrent calls
      const pattern = new RegExp(shared.source, shared.flags);

      let match: RegExpExecArray | null;
      let offset = 0;

      while ((match = pattern.exec(originalLine)) !== null) {
        const matchedText = match[1];
        const particle = match[2] || '';
        const matchLength = match[0].length;
        const passesKoreanSingleCharBoundary = hasStrictKoreanSingleCharBoundary(
          originalLine,
          match.index,
          match.index + matchLength,
          matchedText
        );
        const confidence = getLinkifyConfidence(
          matchedText,
          entity,
          passesKoreanSingleCharBoundary
        );
        const shouldApply = autoConfirm || confidence === 'high';

        if (!shouldApply) {
          fileSkipped++;
          continue;
        }

        const linkText = matchedText.toLowerCase() === entity.name.toLowerCase()
          ? `[[${entity.name}]]${particle}`
          : `[[${entity.name}|${matchedText}]]${particle}`;

        const before = `${matchedText}${particle}`;
        const col = match.index + offset;

        const lineStart = line.substring(0, col);
        const lineEnd = line.substring(col + before.length);
        const newLine = lineStart + linkText + lineEnd;

        if (!dryRun) {
          line = newLine;
          updatedLines[lineNum] = line;
          fileModified = true;
        }

        fileChanges.push({
          filePath,
          line: lineNum + 1,
          before,
          after: linkText,
          applied: !dryRun && shouldApply,
        });

        offset += linkText.length - before.length;
      }
    }
  }

  return {
    updatedLines,
    fileChanges,
    fileModified,
    fileSkipped,
  };
}
