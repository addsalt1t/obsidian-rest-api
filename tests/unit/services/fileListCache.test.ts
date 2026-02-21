import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileListCache, getFileListCache, disposeFileListCache } from '../../../src/services/fileListCache';
import { createMockAppWithEventListeners, triggerEvent } from '../../helpers';
import { TFile } from 'obsidian';

describe('FileListCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disposeFileListCache();
  });

  afterEach(() => {
    disposeFileListCache();
    vi.useRealTimers();
  });

  it('should return files from vault.getMarkdownFiles()', () => {
    const files = [new TFile('a.md'), new TFile('b.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    const result = cache.getMarkdownFiles();

    expect(result).toEqual(files);
    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);

    cache.dispose();
  });

  it('should cache results within TTL', () => {
    const files = [new TFile('a.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    cache.getMarkdownFiles();
    cache.getMarkdownFiles();

    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);

    cache.dispose();
  });

  it('should rebuild cache after TTL expiry', () => {
    const files = [new TFile('a.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    cache.getMarkdownFiles();
    vi.advanceTimersByTime(31000); // TTL (30s) exceeded
    cache.getMarkdownFiles();

    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);

    cache.dispose();
  });

  it('should invalidate on vault create event', () => {
    const files = [new TFile('a.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    cache.getMarkdownFiles();
    triggerEvent(app, 'vault', 'create');
    cache.getMarkdownFiles();

    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);

    cache.dispose();
  });

  it('should invalidate on vault delete event', () => {
    const files = [new TFile('a.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    cache.getMarkdownFiles();
    triggerEvent(app, 'vault', 'delete');
    cache.getMarkdownFiles();

    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);

    cache.dispose();
  });

  it('should invalidate on vault rename event', () => {
    const files = [new TFile('a.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    cache.getMarkdownFiles();
    triggerEvent(app, 'vault', 'rename');
    cache.getMarkdownFiles();

    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);

    cache.dispose();
  });

  it('should return correct stats before caching', () => {
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue([]) },
    });
    const cache = new FileListCache(app);

    const stats = cache.getStats();

    expect(stats.cached).toBe(false);
    expect(stats.fileCount).toBe(0);
    expect(stats.age).toBe(0);

    cache.dispose();
  });

  it('should return correct stats after caching', () => {
    const files = [new TFile('a.md'), new TFile('b.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    cache.getMarkdownFiles();
    const stats = cache.getStats();

    expect(stats.cached).toBe(true);
    expect(stats.fileCount).toBe(2);
    expect(stats.age).toBeGreaterThanOrEqual(0);

    cache.dispose();
  });

  it('should unregister event listeners on dispose', () => {
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue([]) },
    });
    const cache = new FileListCache(app);

    cache.dispose();

    // vault: create, delete, rename (3 listeners)
    expect(app.vault.offref).toHaveBeenCalledTimes(3);
  });

  it('should clear cache on dispose', () => {
    const files = [new TFile('a.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const cache = new FileListCache(app);

    cache.getMarkdownFiles();
    cache.dispose();

    // After dispose, new instance needs to rebuild
    const cache2 = new FileListCache(app);
    cache2.getMarkdownFiles();
    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);

    cache2.dispose();
  });
});

describe('FileListCache singleton', () => {
  beforeEach(() => {
    disposeFileListCache();
  });

  afterEach(() => {
    disposeFileListCache();
  });

  it('getFileListCache returns same instance', () => {
    const app = createMockAppWithEventListeners();
    const s1 = getFileListCache(app);
    const s2 = getFileListCache(app);
    expect(s1).toBe(s2);
  });

  it('disposeFileListCache creates new instance after dispose', () => {
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue([]) },
    });
    const s1 = getFileListCache(app);
    s1.getMarkdownFiles();

    disposeFileListCache();

    const s2 = getFileListCache(app);
    expect(s2).not.toBe(s1);
  });

  it('invalidate clears cache but keeps instance', () => {
    const files = [new TFile('a.md')];
    const app = createMockAppWithEventListeners({
      vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) },
    });
    const s1 = getFileListCache(app);
    s1.getMarkdownFiles();

    s1.invalidate();
    s1.getMarkdownFiles();

    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);
    expect(getFileListCache(app)).toBe(s1);
  });
});
