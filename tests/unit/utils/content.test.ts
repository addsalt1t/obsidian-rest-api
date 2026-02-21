import { describe, it, expect, vi } from 'vitest';
import { Request } from 'express';
import { extractContent, extractAppendContent, extractAllTags } from '../../../src/utils/content';
import type { CachedMetadata } from 'obsidian';

// Mock express Request
function createMockRequest(body: unknown): Request {
  return { body } as Request;
}

describe('Content Utils', () => {
  describe('extractContent', () => {
    it('should extract string body directly', () => {
      const req = createMockRequest('raw markdown content');
      const result = extractContent(req);

      expect(result).toBe('raw markdown content');
    });

    it('should extract content property from object', () => {
      const req = createMockRequest({ content: 'markdown from content field' });
      const result = extractContent(req);

      expect(result).toBe('markdown from content field');
    });

    it('should throw error for object without content property', () => {
      const req = createMockRequest({ title: 'test', value: 123 });

      expect(() => extractContent(req)).toThrow(
        'Request body must be a string (text/markdown) or JSON with a "content" property'
      );
    });

    it('should return empty string for undefined body', () => {
      const req = createMockRequest(undefined);
      const result = extractContent(req);

      expect(result).toBe('');
    });

    it('should return empty string for null body', () => {
      const req = createMockRequest(null);
      const result = extractContent(req);

      expect(result).toBe('');
    });
  });

  describe('extractAppendContent', () => {
    it('should extract string body directly', () => {
      const req = createMockRequest('append this');
      const result = extractAppendContent(req);

      expect(result).toBe('append this');
    });

    it('should extract content property from object', () => {
      const req = createMockRequest({ content: 'appended content' });
      const result = extractAppendContent(req);

      expect(result).toBe('appended content');
    });

    it('should return empty string if no content property', () => {
      const req = createMockRequest({ other: 'value' });
      const result = extractAppendContent(req);

      expect(result).toBe('');
    });

    it('should return empty string for undefined body', () => {
      const req = createMockRequest(undefined);
      const result = extractAppendContent(req);

      expect(result).toBe('');
    });
  });

  describe('extractAllTags', () => {
    it('should return empty array for null cache', () => {
      const result = extractAllTags(null);

      expect(result).toEqual([]);
    });

    it('should extract inline tags without hash', () => {
      const cache: CachedMetadata = {
        tags: [
          { tag: '#javascript', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } },
          { tag: '#coding', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } },
        ],
      };

      const result = extractAllTags(cache, false);

      expect(result).toContain('javascript');
      expect(result).toContain('coding');
    });

    it('should extract inline tags with hash', () => {
      const cache: CachedMetadata = {
        tags: [
          { tag: '#test', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } },
        ],
      };

      const result = extractAllTags(cache, true);

      expect(result).toContain('#test');
    });

    it('should extract frontmatter array tags', () => {
      const cache: CachedMetadata = {
        frontmatter: {
          tags: ['frontend', 'react'],
        },
      };

      const result = extractAllTags(cache, false);

      expect(result).toContain('frontend');
      expect(result).toContain('react');
    });

    it('should extract frontmatter string tag', () => {
      const cache: CachedMetadata = {
        frontmatter: {
          tags: 'single-tag',
        },
      };

      const result = extractAllTags(cache, false);

      expect(result).toContain('single-tag');
    });

    it('should merge inline and frontmatter tags without duplicates', () => {
      const cache: CachedMetadata = {
        tags: [
          { tag: '#shared', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } },
          { tag: '#inline-only', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } },
        ],
        frontmatter: {
          tags: ['shared', 'fm-only'],
        },
      };

      const result = extractAllTags(cache, false);

      expect(result).toContain('shared');
      expect(result).toContain('inline-only');
      expect(result).toContain('fm-only');
      // No duplicates
      expect(result.filter(t => t === 'shared').length).toBe(1);
    });

    it('should handle frontmatter tags with hash prefix', () => {
      const cache: CachedMetadata = {
        frontmatter: {
          tags: ['#already-hashed', 'no-hash'],
        },
      };

      const result = extractAllTags(cache, true);

      expect(result).toContain('#already-hashed');
      expect(result).toContain('#no-hash');
    });

    it('should return empty array when cache has no tags', () => {
      const cache: CachedMetadata = {
        frontmatter: { title: 'Note' },
      };

      const result = extractAllTags(cache, false);

      expect(result).toEqual([]);
    });
  });
});
