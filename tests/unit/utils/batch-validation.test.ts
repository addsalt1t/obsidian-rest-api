import { describe, it, expect } from 'vitest';
import { validateBatchArray } from '../../../src/utils/batch-validation';

describe('validateBatchArray', () => {
  it('should reject null input', () => {
    const result = validateBatchArray(null as unknown as unknown[], 50);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('array is required');
  });

  it('should reject undefined input', () => {
    const result = validateBatchArray(undefined as unknown as unknown[], 50);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('array is required');
  });

  it('should reject non-array input (string)', () => {
    const result = validateBatchArray('not-array' as unknown as unknown[], 50);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('array is required');
  });

  it('should reject empty array', () => {
    const result = validateBatchArray([], 50);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('array is required');
  });

  it('should use custom emptyError message when provided', () => {
    const result = validateBatchArray([], 50, 'operations array is required');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('operations array is required');
  });

  it('should reject array exceeding max size', () => {
    const result = validateBatchArray(new Array(51).fill('x'), 50);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum');
    expect(result.error).toContain('50');
    expect(result.meta).toEqual({ requested: 51, limit: 50 });
  });

  it('should accept valid array within limit', () => {
    const result = validateBatchArray(['a', 'b'], 50);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.meta).toBeUndefined();
  });

  it('should accept array at exact max size', () => {
    const result = validateBatchArray(new Array(50).fill('x'), 50);
    expect(result.valid).toBe(true);
  });

  it('should use default MAX_BATCH_SIZE when maxSize not provided', () => {
    // MAX_BATCH_SIZE is 50, so 51 items should fail
    const result = validateBatchArray(new Array(51).fill('x'));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum');
  });

  describe('element type validation', () => {
    it('should reject arrays with null elements', () => {
      const result = validateBatchArray([null, 'valid.md']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('string');
    });

    it('should reject arrays with object elements', () => {
      const result = validateBatchArray([{ path: 'test.md' }, 'valid.md']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('index 0');
    });

    it('should reject arrays with number elements', () => {
      const result = validateBatchArray([123, 'valid.md']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('string');
    });

    it('should report correct index for non-string element', () => {
      const result = validateBatchArray(['valid.md', 42, 'also-valid.md']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('index 1');
    });

    it('should accept arrays of strings', () => {
      const result = validateBatchArray(['file1.md', 'file2.md']);
      expect(result.valid).toBe(true);
    });
  });
});
