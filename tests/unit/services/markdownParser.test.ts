import { describe, it, expect } from 'vitest';
import { parseMarkdownMetadata } from '../../../src/services/markdownParser';

describe('Markdown Parser', () => {
  describe('parseMarkdownMetadata', () => {
    it('should parse empty content', () => {
      const result = parseMarkdownMetadata('');

      expect(result.frontmatter).toEqual({});
      expect(result.tags).toEqual([]);
    });

    it('should parse content without frontmatter', () => {
      const content = '# Title\n\nSome content here';
      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter).toEqual({});
    });

    it('should parse simple frontmatter', () => {
      const content = `---
title: My Note
author: John
---

Content`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.title).toBe('My Note');
      expect(result.frontmatter.author).toBe('John');
    });

    it('should parse numeric values', () => {
      const content = `---
count: 42
price: 19.99
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.count).toBe(42);
      expect(result.frontmatter.price).toBe(19.99);
    });

    it('should parse boolean values', () => {
      const content = `---
published: true
draft: false
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.published).toBe(true);
      expect(result.frontmatter.draft).toBe(false);
    });

    it('should parse null value', () => {
      const content = `---
empty: null
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.empty).toBe(null);
    });

    it('should parse quoted strings', () => {
      const content = `---
single: 'hello'
double: "world"
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.single).toBe('hello');
      expect(result.frontmatter.double).toBe('world');
    });

    it('should parse inline array', () => {
      const content = `---
tags: [one, two, three]
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.tags).toEqual(['one', 'two', 'three']);
    });

    it('should parse JSON inline array', () => {
      const content = `---
items: ["a", "b", "c"]
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.items).toEqual(['a', 'b', 'c']);
    });

    it('should parse multiline list', () => {
      const content = `---
tags:
  - first
  - second
  - third
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter.tags).toEqual(['first', 'second', 'third']);
    });

    it('should extract tags from frontmatter array', () => {
      const content = `---
tags: [javascript, typescript]
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.tags).toContain('#javascript');
      expect(result.tags).toContain('#typescript');
    });

    it('should extract tags from frontmatter string', () => {
      const content = `---
tags: single-tag
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.tags).toContain('#single-tag');
    });

    it('should parse inline tags from content', () => {
      const content = `---
title: Note
---

This is a note about #programming and #coding.`;

      const result = parseMarkdownMetadata(content);

      expect(result.tags).toContain('#programming');
      expect(result.tags).toContain('#coding');
    });

    it('should not duplicate tags', () => {
      const content = `---
tags: [test]
---

#test appears again`;

      const result = parseMarkdownMetadata(content);

      // #test should only appear once
      const testCount = result.tags.filter(t => t === '#test').length;
      expect(testCount).toBe(1);
    });

    it('should parse Korean tags', () => {
      const content = `This has #한글태그 and #테스트`;

      const result = parseMarkdownMetadata(content);

      expect(result.tags).toContain('#한글태그');
      expect(result.tags).toContain('#테스트');
    });

    it('should parse hyphenated keys', () => {
      const content = `---
created-date: 2024-01-01
last-modified: today
---`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter['created-date']).toBe('2024-01-01');
      expect(result.frontmatter['last-modified']).toBe('today');
    });

    it('should handle empty frontmatter', () => {
      const content = `---
---

Content only`;

      const result = parseMarkdownMetadata(content);

      expect(result.frontmatter).toEqual({});
    });
  });
});
