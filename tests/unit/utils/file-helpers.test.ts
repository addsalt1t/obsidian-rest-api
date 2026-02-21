import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';
import {
  ensureMarkdownPath,
  getFileOrNull,
  resolveSafeFilePathWithNormalized,
} from '../../../src/utils/file-helpers';
import { PathValidationError } from '../../../src/utils/path-validation';
import { createMockApp } from '../../helpers/mock-app';

/**
 * Create a TFile instance that passes instanceof checks.
 * Unlike createMockTFile (plain object), this uses the real TFile class
 * from the obsidian mock so `instanceof TFile` works in getFileOrNull.
 */
function makeTFile(path: string): TFile {
  return new TFile(path);
}

describe('ensureMarkdownPath', () => {
  it('should add .md extension when missing', () => {
    expect(ensureMarkdownPath('notes/test')).toBe('notes/test.md');
  });

  it('should not double-add .md extension', () => {
    expect(ensureMarkdownPath('notes/test.md')).toBe('notes/test.md');
  });

  it('should normalize path separators', () => {
    expect(ensureMarkdownPath('notes\\test')).toBe('notes/test.md');
  });
});

describe('getFileOrNull', () => {
  it('should return TFile when found', () => {
    const mockFile = makeTFile('note.md');
    const app = createMockApp({
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(mockFile),
      },
    });

    expect(getFileOrNull(app, 'note.md')).toBe(mockFile);
  });

  it('should return null when file not found', () => {
    const app = createMockApp();
    expect(getFileOrNull(app, 'nonexistent.md')).toBeNull();
  });

  it('should return null for non-TFile abstract file', () => {
    // getAbstractFileByPath returns something that is not a TFile
    const app = createMockApp({
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue({ path: 'folder', children: [] }),
      },
    });
    expect(getFileOrNull(app, 'folder')).toBeNull();
  });
});

describe('resolveSafeFilePathWithNormalized', () => {
  it('should return file and normalizedPath for valid path', () => {
    const mockFile = makeTFile('notes/test.md');
    const app = createMockApp({
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(mockFile),
      },
    });

    const result = resolveSafeFilePathWithNormalized(app, 'notes/test');
    expect(result.file).toBe(mockFile);
    expect(result.normalizedPath).toBe('notes/test.md');
  });

  it('should return null file with normalizedPath for non-existent file', () => {
    const app = createMockApp();

    const result = resolveSafeFilePathWithNormalized(app, 'notes/missing');
    expect(result.file).toBeNull();
    expect(result.normalizedPath).toBe('notes/missing.md');
  });

  it('should throw PathValidationError for path traversal', () => {
    const app = createMockApp();

    expect(() => resolveSafeFilePathWithNormalized(app, '../../secret')).toThrow(
      PathValidationError,
    );
    expect(app.vault.getAbstractFileByPath).not.toHaveBeenCalled();
  });

  it('should normalize path with .md extension already present', () => {
    const mockFile = makeTFile('doc.md');
    const app = createMockApp({
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(mockFile),
      },
    });

    const result = resolveSafeFilePathWithNormalized(app, 'doc.md');
    expect(result.normalizedPath).toBe('doc.md');
    expect(result.file).toBe(mockFile);
  });

  it('should normalize backslash separators', () => {
    const app = createMockApp();

    const result = resolveSafeFilePathWithNormalized(app, 'folder\\sub\\note');
    expect(result.normalizedPath).toBe('folder/sub/note.md');
  });
});
