import { afterEach, describe, it, expect, vi } from 'vitest';
import { generateApiKey } from '../../src/utils/crypto';

describe('generateApiKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a string of 32 characters', () => {
    const key = generateApiKey();
    expect(key).toHaveLength(32);
  });

  it('should contain only alphanumeric characters', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('should generate different values on each call', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    const key3 = generateApiKey();

    expect(key1).not.toBe(key2);
    expect(key2).not.toBe(key3);
    expect(key1).not.toBe(key3);
  });

  it('should discard values greater than 247 during rejection sampling', () => {
    const getRandomValuesSpy = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((typedArray: Uint8Array) => {
        // 255 values should be rejected (>247), 61 maps to "9" and should be accepted.
        typedArray.fill(255, 0, 16);
        typedArray.fill(61, 16, 48);
        typedArray.fill(0, 48);
        return typedArray;
      });

    const key = generateApiKey();

    expect(key).toBe('9'.repeat(32));
    expect(getRandomValuesSpy).toHaveBeenCalledTimes(1);
  });
});
