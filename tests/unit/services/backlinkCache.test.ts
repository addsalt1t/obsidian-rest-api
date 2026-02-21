import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BacklinkCacheService, getBacklinkCacheService, disposeBacklinkCache } from '../../../src/services/backlinkCache';
import { createMockAppWithEventListeners, triggerEvent } from '../../helpers';

describe('BacklinkCacheService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disposeBacklinkCache();
  });

  afterEach(() => {
    disposeBacklinkCache();
    vi.useRealTimers();
  });

  it('should build reverse index from resolvedLinks', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: {
        resolvedLinks: {
          'a.md': { 'b.md': 1, 'c.md': 1 },
          'd.md': { 'b.md': 1 },
        },
      },
    });
    const service = new BacklinkCacheService(app);

    const index = service.getIndex();

    expect(index.get('b.md')).toEqual(['a.md', 'd.md']);
    expect(index.get('c.md')).toEqual(['a.md']);
    expect(index.get('a.md')).toBeUndefined();

    service.dispose();
  });

  it('should cache index within TTL', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const service = new BacklinkCacheService(app);

    const idx1 = service.getIndex();
    const idx2 = service.getIndex();

    // 동일 참조 (캐시 히트)
    expect(idx1).toBe(idx2);

    service.dispose();
  });

  it('should rebuild index after TTL expiry', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const service = new BacklinkCacheService(app);

    const idx1 = service.getIndex();
    vi.advanceTimersByTime(31000);
    const idx2 = service.getIndex();

    // 새 Map 인스턴스 (재빌드)
    expect(idx1).not.toBe(idx2);

    service.dispose();
  });

  it('should invalidate on vault create event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const service = new BacklinkCacheService(app);

    const idx1 = service.getIndex();
    triggerEvent(app, 'vault', 'create');
    const idx2 = service.getIndex();

    expect(idx1).not.toBe(idx2);

    service.dispose();
  });

  it('should invalidate on vault delete event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const service = new BacklinkCacheService(app);

    const idx1 = service.getIndex();
    triggerEvent(app, 'vault', 'delete');
    const idx2 = service.getIndex();

    expect(idx1).not.toBe(idx2);

    service.dispose();
  });

  it('should invalidate on vault rename event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const service = new BacklinkCacheService(app);

    const idx1 = service.getIndex();
    triggerEvent(app, 'vault', 'rename');
    const idx2 = service.getIndex();

    expect(idx1).not.toBe(idx2);

    service.dispose();
  });

  it('should invalidate on metadataCache changed event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const service = new BacklinkCacheService(app);

    const idx1 = service.getIndex();
    triggerEvent(app, 'metadata', 'changed');
    const idx2 = service.getIndex();

    expect(idx1).not.toBe(idx2);

    service.dispose();
  });

  it('should invalidate on metadataCache resolved event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const service = new BacklinkCacheService(app);

    const idx1 = service.getIndex();
    triggerEvent(app, 'metadata', 'resolved');
    const idx2 = service.getIndex();

    expect(idx1).not.toBe(idx2);

    service.dispose();
  });

  it('should unregister event listeners on dispose', () => {
    const app = createMockAppWithEventListeners();
    const service = new BacklinkCacheService(app);

    service.dispose();

    // vault: create, delete, rename (3회)
    expect(app.vault.offref).toHaveBeenCalledTimes(3);
    // metadataCache: changed, resolved (2회)
    expect(app.metadataCache.offref).toHaveBeenCalledTimes(2);
  });

  it('should return empty map when no links exist', () => {
    const app = createMockAppWithEventListeners();
    const service = new BacklinkCacheService(app);

    const index = service.getIndex();
    expect(index.size).toBe(0);

    service.dispose();
  });
});

describe('BacklinkCache 싱글톤', () => {
  beforeEach(() => {
    disposeBacklinkCache();
  });

  afterEach(() => {
    disposeBacklinkCache();
  });

  it('getBacklinkCacheService는 동일 인스턴스 반환', () => {
    const app = createMockAppWithEventListeners();
    const s1 = getBacklinkCacheService(app);
    const s2 = getBacklinkCacheService(app);
    expect(s1).toBe(s2);
  });

  it('disposeBacklinkCache는 싱글톤 정리', () => {
    const app = createMockAppWithEventListeners();
    const s1 = getBacklinkCacheService(app);

    disposeBacklinkCache();

    const s2 = getBacklinkCacheService(app);
    expect(s2).not.toBe(s1);
  });

  it('invalidate는 캐시만 무효화 (인스턴스 유지)', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { resolvedLinks: { 'a.md': { 'b.md': 1 } } },
    });
    const s1 = getBacklinkCacheService(app);

    const idx1 = s1.getIndex();
    s1.invalidate();
    const idx2 = s1.getIndex();

    expect(idx1).not.toBe(idx2);
    expect(getBacklinkCacheService(app)).toBe(s1);
  });
});
