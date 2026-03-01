import { describe, it, expect } from 'vitest';
import { formatYamlValue, detectYamlValueKind } from '../../../src/services/yaml-formatter';

describe('yaml-formatter', () => {
  // ---------------------------------------------------------------
  // Regression: flat / non-nested values must produce identical output
  // ---------------------------------------------------------------
  describe('flat values (regression)', () => {
    it('formats null', () => {
      expect(formatYamlValue(null)).toBe('null');
    });

    it('formats undefined', () => {
      expect(formatYamlValue(undefined)).toBe('null');
    });

    it('formats booleans', () => {
      expect(formatYamlValue(true)).toBe('true');
      expect(formatYamlValue(false)).toBe('false');
    });

    it('formats numbers', () => {
      expect(formatYamlValue(42)).toBe('42');
      expect(formatYamlValue(3.14)).toBe('3.14');
      expect(formatYamlValue(0)).toBe('0');
    });

    it('formats plain string', () => {
      expect(formatYamlValue('hello')).toBe('hello');
    });

    it('formats string with special characters', () => {
      expect(formatYamlValue('key: value')).toBe('"key: value"');
      expect(formatYamlValue('item #1')).toBe('"item #1"');
    });

    it('formats multiline string at depth 1', () => {
      expect(formatYamlValue('line1\nline2')).toBe('|\n  line1\n  line2');
    });

    it('formats empty array', () => {
      expect(formatYamlValue([])).toBe('[]');
    });

    it('formats empty object', () => {
      expect(formatYamlValue({})).toBe('{}');
    });

    it('formats flat array of primitives', () => {
      expect(formatYamlValue(['a', 'b', 'c'])).toBe('\n  - a\n  - b\n  - c');
    });

    it('formats flat object with primitive values', () => {
      expect(formatYamlValue({ x: 1, y: 2 })).toBe('\n  x: 1\n  y: 2');
    });

    it('formats array with single element', () => {
      expect(formatYamlValue(['only'])).toBe('\n  - only');
    });

    it('formats object with single key', () => {
      expect(formatYamlValue({ key: 'val' })).toBe('\n  key: val');
    });
  });

  // ---------------------------------------------------------------
  // Nested structures: depth-aware indentation
  // ---------------------------------------------------------------
  describe('nested structures', () => {
    it('formats 3-level nested object with correct indentation', () => {
      const result = formatYamlValue({ a: { b: { c: 1 } } });
      // depth 1: a
      // depth 2: b
      // depth 3: c
      expect(result).toBe('\n  a: \n    b: \n      c: 1');
    });

    it('formats 2-level nested object', () => {
      const result = formatYamlValue({ outer: { inner: 'value' } });
      expect(result).toBe('\n  outer: \n    inner: value');
    });

    it('formats array of objects with correct nesting', () => {
      const result = formatYamlValue([{ name: 'x' }, { name: 'y' }]);
      // Each array item (depth 1) contains an object whose keys are at depth 2
      expect(result).toBe('\n  - \n    name: x\n  - \n    name: y');
    });

    it('formats nested arrays within objects', () => {
      const result = formatYamlValue({ tags: ['a', 'b'] });
      // tags key at depth 1, array items at depth 2
      expect(result).toBe('\n  tags: \n    - a\n    - b');
    });

    it('formats nested arrays within nested objects', () => {
      const result = formatYamlValue({ config: { items: ['x', 'y'] } });
      // config at depth 1, items key at depth 2, array items at depth 3
      expect(result).toBe('\n  config: \n    items: \n      - x\n      - y');
    });

    it('formats objects within arrays within objects', () => {
      const result = formatYamlValue({
        people: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
      });
      expect(result).toBe(
        '\n  people: '
        + '\n    - \n      name: Alice\n      age: 30'
        + '\n    - \n      name: Bob\n      age: 25',
      );
    });

    it('formats deeply nested mixed structures', () => {
      const result = formatYamlValue({
        level1: {
          level2: {
            items: [1, 2],
            flag: true,
          },
        },
      });
      expect(result).toBe(
        '\n  level1: '
        + '\n    level2: '
        + '\n      items: \n        - 1\n        - 2'
        + '\n      flag: true',
      );
    });

    it('formats nested object with special-char string values', () => {
      const result = formatYamlValue({ meta: { title: 'key: value' } });
      expect(result).toBe('\n  meta: \n    title: "key: value"');
    });

    it('formats nested multiline strings with correct depth', () => {
      const result = formatYamlValue({ desc: { text: 'line1\nline2' } });
      // multiline string at depth 3 should indent continuation lines at 6 spaces
      expect(result).toBe('\n  desc: \n    text: |\n      line1\n      line2');
    });
  });

  // ---------------------------------------------------------------
  // detectYamlValueKind
  // ---------------------------------------------------------------
  describe('detectYamlValueKind', () => {
    it('detects nullish', () => {
      expect(detectYamlValueKind(null)).toBe('nullish');
      expect(detectYamlValueKind(undefined)).toBe('nullish');
    });

    it('detects array before object', () => {
      expect(detectYamlValueKind([1, 2])).toBe('array');
      expect(detectYamlValueKind([])).toBe('array');
    });

    it('detects object', () => {
      expect(detectYamlValueKind({ a: 1 })).toBe('object');
      expect(detectYamlValueKind({})).toBe('object');
    });

    it('detects primitive types', () => {
      expect(detectYamlValueKind(true)).toBe('boolean');
      expect(detectYamlValueKind(42)).toBe('number');
      expect(detectYamlValueKind('hi')).toBe('string');
    });

    it('detects other for unknown types', () => {
      expect(detectYamlValueKind(Symbol('s'))).toBe('other');
      expect(detectYamlValueKind(() => {})).toBe('other');
    });
  });
});
