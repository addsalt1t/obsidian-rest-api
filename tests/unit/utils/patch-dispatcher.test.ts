import { describe, it, expect } from 'vitest';
import { dispatchPatch } from '../../../src/utils/patch-dispatcher';

const SAMPLE_CONTENT = [
  '---',
  'title: Test',
  'tags: [a, b]',
  '---',
  '',
  '# Heading 1',
  'Some content under heading 1.',
  '',
  '## Subheading',
  'Sub content here.',
  '',
  'A block reference line ^block1',
  '',
  '# Heading 2',
  'Content under heading 2.',
].join('\n');

describe('dispatchPatch', () => {
  describe('heading target type', () => {
    it('should patch heading with replace operation', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'heading',
        target: 'Heading 1',
        operation: 'replace',
        content: 'Replaced content',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('# Heading 1');
      expect(result.content).toContain('Replaced content');
      expect(result.content).not.toContain('Some content under heading 1.');
    });

    it('should patch heading with append operation', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'heading',
        target: 'Heading 2',
        operation: 'append',
        content: 'Appended line',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('Content under heading 2.');
      expect(result.content).toContain('Appended line');
    });

    it('should return found=false when heading not found', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'heading',
        target: 'Nonexistent Heading',
        operation: 'replace',
        content: 'New content',
      });

      expect(result.found).toBe(false);
      expect(result.content).toBe(SAMPLE_CONTENT);
    });

    it('should support :: path separator for nested headings', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'heading',
        target: 'Heading 1::Subheading',
        operation: 'replace',
        content: 'Replaced sub content',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('## Subheading');
      expect(result.content).toContain('Replaced sub content');
      expect(result.content).not.toContain('Sub content here.');
    });
  });

  describe('block target type', () => {
    it('should patch block with replace operation', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'block',
        target: 'block1',
        operation: 'replace',
        content: 'New block content',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('New block content');
      expect(result.content).toContain('^block1');
    });

    it('should return found=false when block not found', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'block',
        target: 'nonexistent',
        operation: 'replace',
        content: 'New content',
      });

      expect(result.found).toBe(false);
      expect(result.content).toBe(SAMPLE_CONTENT);
    });

    it('should patch block with append operation', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'block',
        target: 'block1',
        operation: 'append',
        content: 'Line after block',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('Line after block');
    });
  });

  describe('line target type', () => {
    it('should patch line with replace operation (1-based)', () => {
      // Line 7 is "Some content under heading 1."
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'line',
        target: '7',
        operation: 'replace',
        content: 'Replaced line',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('Replaced line');
      expect(result.content).not.toContain('Some content under heading 1.');
    });

    it('should return found=false for out-of-range line', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'line',
        target: '9999',
        operation: 'replace',
        content: 'New content',
      });

      expect(result.found).toBe(false);
      expect(result.content).toBe(SAMPLE_CONTENT);
    });

    it('should patch line with prepend operation', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'line',
        target: '6',
        operation: 'prepend',
        content: 'Inserted before heading',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('Inserted before heading');
    });
  });

  describe('frontmatter target type', () => {
    it('should update existing frontmatter key', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'frontmatter',
        target: 'title',
        operation: 'replace', // operation is ignored for frontmatter
        content: 'New Title',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('title: New Title');
    });

    it('should add new frontmatter key', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'frontmatter',
        target: 'author',
        operation: 'replace',
        content: 'John',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('author: John');
    });

    it('should accept frontmatter-key as alias', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'frontmatter-key',
        target: 'title',
        operation: 'replace',
        content: 'Updated Title',
      });

      expect(result.found).toBe(true);
      expect(result.content).toContain('title: Updated Title');
    });

    it('should always return found=true (frontmatter creates key if missing)', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'frontmatter',
        target: 'newKey',
        operation: 'replace',
        content: 'newValue',
      });

      expect(result.found).toBe(true);
    });
  });

  describe('unknown/missing target type', () => {
    it('should return fallback result when targetType is unrecognized', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'unknown',
        target: 'something',
        operation: 'replace',
        content: 'Raw replacement',
      });

      expect(result.found).toBe(true);
      expect(result.content).toBe('Raw replacement');
      expect(result.fallback).toBe(true);
    });

    it('should return fallback when targetType is empty', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: '',
        target: '',
        operation: 'replace',
        content: 'Full replacement',
      });

      expect(result.found).toBe(true);
      expect(result.content).toBe('Full replacement');
      expect(result.fallback).toBe(true);
    });

    it('should return fallback when targetType is undefined-like', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: undefined as unknown as string,
        target: '',
        operation: 'replace',
        content: 'Full replacement',
      });

      expect(result.found).toBe(true);
      expect(result.content).toBe('Full replacement');
      expect(result.fallback).toBe(true);
    });
  });

  describe('target label for error messages', () => {
    it('should include heading label when heading not found', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'heading',
        target: 'Missing',
        operation: 'replace',
        content: '',
      });

      expect(result.found).toBe(false);
      expect(result.targetLabel).toBe("Heading 'Missing'");
    });

    it('should include block label when block not found', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'block',
        target: 'missing-id',
        operation: 'replace',
        content: '',
      });

      expect(result.found).toBe(false);
      expect(result.targetLabel).toBe("Block 'missing-id'");
    });

    it('should include line label when line not found', () => {
      const result = dispatchPatch(SAMPLE_CONTENT, {
        targetType: 'line',
        target: '9999',
        operation: 'replace',
        content: '',
      });

      expect(result.found).toBe(false);
      expect(result.targetLabel).toBe('Line 9999');
    });
  });
});
