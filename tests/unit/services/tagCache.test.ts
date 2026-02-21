import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TagCacheService, getTagCacheService, disposeTagCache } from '../../../src/services/tagCache';
import { createMockAppWithEventListeners, triggerEvent } from '../../helpers';

describe('TagCacheService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disposeTagCache();
  });

  afterEach(() => {
    disposeTagCache();
    vi.useRealTimers();
  });

  it('should return sorted tags from metadataCache', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#important': 10, '#todo': 5, '#archive': 3 })) },
    });
    const service = new TagCacheService(app);

    const tags = service.getTags();

    expect(tags).toHaveLength(3);
    expect(tags[0]).toEqual({ tag: 'important', count: 10 });
    expect(tags[1]).toEqual({ tag: 'todo', count: 5 });
    expect(tags[2]).toEqual({ tag: 'archive', count: 3 });

    service.dispose();
  });

  it('should remove # prefix from tags', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#hashtag': 1 })) },
    });
    const service = new TagCacheService(app);

    const tags = service.getTags();
    expect(tags[0].tag).toBe('hashtag');

    service.dispose();
  });

  it('should cache results within TTL', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.getTags();
    service.getTags();

    // getTags 호출은 2번이지만 metadataCache.getTags는 1번만 호출
    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('should rebuild cache after TTL expiry', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.getTags();
    vi.advanceTimersByTime(31000); // TTL(30초) 초과
    service.getTags();

    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(2);

    service.dispose();
  });

  it('should invalidate on vault create event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.getTags();
    triggerEvent(app, 'vault', 'create');
    service.getTags();

    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(2);

    service.dispose();
  });

  it('should invalidate on vault delete event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.getTags();
    triggerEvent(app, 'vault', 'delete');
    service.getTags();

    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(2);

    service.dispose();
  });

  it('should invalidate on vault rename event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.getTags();
    triggerEvent(app, 'vault', 'rename');
    service.getTags();

    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(2);

    service.dispose();
  });

  it('should invalidate on metadataCache changed event', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.getTags();
    triggerEvent(app, 'metadata', 'changed');
    service.getTags();

    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(2);

    service.dispose();
  });

  it('should unregister event listeners on dispose', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.dispose();

    // vault: create, delete, rename (3회)
    expect(app.vault.offref).toHaveBeenCalledTimes(3);
    // metadataCache: changed (1회)
    expect(app.metadataCache.offref).toHaveBeenCalledTimes(1);
  });

  it('should clear cache on dispose', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag1': 5 })) },
    });
    const service = new TagCacheService(app);

    service.getTags();
    service.dispose();

    // dispose 후 새 서비스에서 다시 빌드 필요
    const service2 = new TagCacheService(app);
    service2.getTags();
    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(2);

    service2.dispose();
  });
});

describe('TagCache 싱글톤', () => {
  beforeEach(() => {
    disposeTagCache();
  });

  afterEach(() => {
    disposeTagCache();
  });

  it('getTagCacheService는 동일 인스턴스 반환', () => {
    const app = createMockAppWithEventListeners();
    const s1 = getTagCacheService(app);
    const s2 = getTagCacheService(app);
    expect(s1).toBe(s2);
  });

  it('disposeTagCache는 싱글톤 정리', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag': 1 })) },
    });
    const s1 = getTagCacheService(app);
    s1.getTags();

    disposeTagCache();

    const s2 = getTagCacheService(app);
    expect(s2).not.toBe(s1);
  });

  it('invalidate는 캐시만 무효화 (인스턴스 유지)', () => {
    const app = createMockAppWithEventListeners({
      metadataCache: { getTags: vi.fn(() => ({ '#tag': 1 })) },
    });
    const s1 = getTagCacheService(app);
    s1.getTags();

    s1.invalidate();
    s1.getTags();

    expect(app.metadataCache.getTags).toHaveBeenCalledTimes(2);
    // 인스턴스는 유지
    expect(getTagCacheService(app)).toBe(s1);
  });
});
