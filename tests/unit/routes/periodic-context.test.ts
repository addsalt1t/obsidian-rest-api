import { describe, it, expect } from 'vitest';
import { parsePeriodicRequest } from '../../../src/routes/periodic-context';

describe('periodic-context', () => {
  it('should parse periodic request params', () => {
    const result = parsePeriodicRequest({
      period: 'daily',
      year: '2026',
      month: '2',
      day: '17',
    });

    expect(result).toEqual({
      period: 'daily',
      year: 2026,
      month: 2,
      day: 17,
    });
  });

  it('should return undefined period for invalid value', () => {
    const result = parsePeriodicRequest({
      period: 'unknown',
      year: '2026',
    });

    expect(result).toEqual({
      period: undefined,
      year: 2026,
      month: undefined,
      day: undefined,
    });
  });
});
