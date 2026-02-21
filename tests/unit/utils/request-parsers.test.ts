import { describe, it, expect } from 'vitest';
import {
  parseStringParam,
  parseIntParam,
  parseEnumParam,
  parsePagination,
} from '../../../src/utils/request-parsers';

describe('request-parsers', () => {
  describe('parseStringParam', () => {
    it('should return string value', () => {
      expect(parseStringParam('hello')).toBe('hello');
    });

    it('should return undefined for empty string', () => {
      expect(parseStringParam('')).toBeUndefined();
    });

    it('should return undefined for non-string', () => {
      expect(parseStringParam(123)).toBeUndefined();
      expect(parseStringParam(undefined)).toBeUndefined();
      expect(parseStringParam(null)).toBeUndefined();
    });
  });

  describe('parseIntParam', () => {
    it('should parse string number', () => {
      expect(parseIntParam('42')).toBe(42);
    });

    it('should return number as-is', () => {
      expect(parseIntParam(7)).toBe(7);
    });

    it('should return defaultValue for undefined', () => {
      expect(parseIntParam(undefined, 10)).toBe(10);
    });

    it('should return defaultValue for NaN', () => {
      expect(parseIntParam('abc', 5)).toBe(5);
    });

    it('should return undefined when no default and undefined input', () => {
      expect(parseIntParam(undefined)).toBeUndefined();
    });
  });

  describe('parseEnumParam', () => {
    const validValues = ['asc', 'desc'] as const;

    it('should return valid enum value', () => {
      expect(parseEnumParam('asc', validValues)).toBe('asc');
    });

    it('should return defaultValue for invalid value', () => {
      expect(parseEnumParam('invalid', validValues, 'asc')).toBe('asc');
    });

    it('should return undefined for non-string', () => {
      expect(parseEnumParam(123, validValues)).toBeUndefined();
    });
  });

  describe('parsePagination', () => {
    it('should return default values when no params given', () => {
      const result = parsePagination({});
      expect(result).toEqual({ limit: 100, offset: 0 });
    });

    it('should parse limit and offset from query', () => {
      const result = parsePagination({ limit: '50', offset: '10' });
      expect(result).toEqual({ limit: 50, offset: 10 });
    });

    it('should clamp limit to maxLimit (default 1000)', () => {
      const result = parsePagination({ limit: '5000' });
      expect(result.limit).toBe(1000);
    });

    it('should clamp limit to custom maxLimit', () => {
      const result = parsePagination({ limit: '600' }, 500);
      expect(result.limit).toBe(500);
    });

    it('should clamp limit minimum to 1', () => {
      const result = parsePagination({ limit: '0' });
      expect(result.limit).toBe(1);
    });

    it('should clamp negative limit to 1', () => {
      const result = parsePagination({ limit: '-10' });
      expect(result.limit).toBe(1);
    });

    it('should clamp negative offset to 0', () => {
      const result = parsePagination({ offset: '-5' });
      expect(result.offset).toBe(0);
    });

    it('should use custom defaultLimit when limit not provided', () => {
      const result = parsePagination({}, 500, 50);
      expect(result.limit).toBe(50);
    });

    it('should handle non-numeric limit gracefully', () => {
      const result = parsePagination({ limit: 'abc' });
      expect(result.limit).toBe(100); // falls back to defaultLimit
    });

    it('should handle non-numeric offset gracefully', () => {
      const result = parsePagination({ offset: 'abc' });
      expect(result.offset).toBe(0); // falls back to 0
    });

    it('should handle numeric values (not just strings)', () => {
      const result = parsePagination({ limit: 25, offset: 5 });
      expect(result).toEqual({ limit: 25, offset: 5 });
    });
  });
});
