import { describe, it, expect } from 'vitest';
import { parsePatchRequestParts } from '../../../src/utils/patch-request';

describe('patch-request', () => {
  it('should parse patch request parts from query and headers', () => {
    const result = parsePatchRequestParts({
      query: { target: '%23%23%20Heading' },
      headers: { operation: 'append', 'target-type': 'heading' },
    });

    expect(result).toEqual({
      operation: 'append',
      targetType: 'heading',
      target: '## Heading',
    });
  });

  it('should prefer query target over header target', () => {
    const result = parsePatchRequestParts({
      query: { target: 'query-target' },
      headers: { target: 'header-target' },
    });

    expect(result.target).toBe('query-target');
  });

  it('should default operation to replace', () => {
    const result = parsePatchRequestParts({
      query: {},
      headers: {},
    });

    expect(result.operation).toBe('replace');
  });
});
