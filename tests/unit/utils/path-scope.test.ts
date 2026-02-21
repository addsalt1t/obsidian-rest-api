import { describe, it, expect } from 'vitest';
import { filterFilesByScopes, normalizeScopePath } from '../../../src/utils/path-scope';

interface ScopedFile {
  path: string;
}

function createFiles(): ScopedFile[] {
  return [
    { path: 'notes/daily/today.md' },
    { path: 'notes/ideas.md' },
    { path: 'projects/app/spec.md' },
    { path: 'archive/2024/january.md' },
  ];
}

describe('path-scope utils', () => {
  describe('normalizeScopePath', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeScopePath('')).toBe('');
    });

    it('converts backslashes to forward slashes', () => {
      expect(normalizeScopePath('notes\\daily\\today.md')).toBe('notes/daily/today.md');
    });

    it('normalizes duplicate slashes', () => {
      expect(normalizeScopePath('notes//daily///today.md')).toBe('notes/daily/today.md');
    });

    it('removes leading ./', () => {
      expect(normalizeScopePath('./notes/daily')).toBe('notes/daily');
    });

    it('removes trailing slash', () => {
      expect(normalizeScopePath('notes/daily/')).toBe('notes/daily');
    });

    it('supports unicode paths', () => {
      expect(normalizeScopePath('한글/경로/메모.md')).toBe('한글/경로/메모.md');
    });
  });

  describe('filterFilesByScopes', () => {
    it('returns all files when scopes is undefined', () => {
      const files = createFiles();

      expect(filterFilesByScopes(files, undefined)).toEqual(files);
    });

    it('returns all files when scopes is an empty array', () => {
      const files = createFiles();

      expect(filterFilesByScopes(files, [])).toEqual(files);
    });

    it('filters files by a single scope', () => {
      const files = createFiles();

      expect(filterFilesByScopes(files, ['notes'])).toEqual([
        { path: 'notes/daily/today.md' },
        { path: 'notes/ideas.md' },
      ]);
    });

    it('filters files by multiple scopes', () => {
      const files = createFiles();

      expect(filterFilesByScopes(files, ['projects', 'archive/2024'])).toEqual([
        { path: 'projects/app/spec.md' },
        { path: 'archive/2024/january.md' },
      ]);
    });

    it('returns empty array when no files match scopes', () => {
      const files = createFiles();

      expect(filterFilesByScopes(files, ['missing/scope'])).toEqual([]);
    });
  });
});
