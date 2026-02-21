import { describe, it, expect } from 'vitest';
import { generateApiKey } from '../../src/utils/crypto';

describe('generateApiKey', () => {
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

  it('should have roughly uniform character distribution (no modulo bias)', () => {
    // 많은 샘플을 생성하여 문자 분포 확인
    const charCounts: Record<string, number> = {};
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (const c of chars) {
      charCounts[c] = 0;
    }

    // 100개의 키 생성 (3200 문자)
    for (let i = 0; i < 100; i++) {
      const key = generateApiKey();
      for (const c of key) {
        charCounts[c]++;
      }
    }

    const totalChars = 100 * 32; // 3200
    const expectedPerChar = totalChars / chars.length; // 약 51.6
    const tolerance = 0.5; // 50% 허용 오차

    // 각 문자가 기대값의 50%~150% 범위 내에 있는지 확인
    for (const c of chars) {
      const count = charCounts[c];
      expect(count).toBeGreaterThan(expectedPerChar * (1 - tolerance));
      expect(count).toBeLessThan(expectedPerChar * (1 + tolerance));
    }
  });
});
