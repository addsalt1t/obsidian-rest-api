import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForMetadataReady } from '../../../src/utils/metadata-ready';
import type { App, TFile, Events } from 'obsidian';

function createMockFile(path: string): TFile {
  return {
    path,
    name: path.split('/').pop() || '',
    basename: (path.split('/').pop() || '').replace(/\.[^/.]+$/, ''),
    extension: 'md',
  } as TFile;
}

// Obsidian module mock
vi.mock('obsidian', () => ({
  TFile: class TFile {
    path: string;
    extension: string;
    constructor(path: string) {
      this.path = path;
      this.extension = 'md';
    }
  },
  TAbstractFile: class TAbstractFile {
    path: string;
    constructor(path: string) { this.path = path; }
  },
}));

function createMockApp(options: {
  files?: Map<string, object>;
  fileCaches?: Map<string, object | null>;
} = {}): {
  app: App;
  triggerChanged: (file: TFile) => void;
} {
  const { files = new Map(), fileCaches = new Map() } = options;
  const metadataListeners: Array<{ event: string; callback: (...args: unknown[]) => void }> = [];

  const app = {
    vault: {
      getAbstractFileByPath: vi.fn((path: string) => files.get(path) || null),
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile) => fileCaches.get(file.path) ?? null),
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        const ref = { event, callback };
        metadataListeners.push(ref);
        return ref as ReturnType<Events['on']>;
      }),
      offref: vi.fn((ref: unknown) => {
        const idx = metadataListeners.indexOf(ref as typeof metadataListeners[number]);
        if (idx >= 0) metadataListeners.splice(idx, 1);
      }),
    },
  } as unknown as App;

  const triggerChanged = (file: TFile) => {
    for (const l of [...metadataListeners]) {
      if (l.event === 'changed') l.callback(file);
    }
  };

  return { app, triggerChanged };
}

describe('waitForMetadataReady', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true immediately when cache exists', async () => {
    const file = createMockFile('test.md');
    const { app } = createMockApp({
      files: new Map([['test.md', file]]),
      fileCaches: new Map([['test.md', { frontmatter: {} }]]),
    });

    const result = await waitForMetadataReady(app, 'test.md');

    expect(result).toBe(true);
    // 이벤트 리스너 등록 안 됨
    expect(app.metadataCache.on).not.toHaveBeenCalled();
  });

  it('should return false when file does not exist', async () => {
    const { app } = createMockApp();

    const result = await waitForMetadataReady(app, 'nonexistent.md');

    expect(result).toBe(false);
  });

  it('should wait for changed event and return true', async () => {
    const file = createMockFile('test.md');
    const { app, triggerChanged } = createMockApp({
      files: new Map([['test.md', file]]),
      fileCaches: new Map([['test.md', null]]),
    });

    const promise = waitForMetadataReady(app, 'test.md');

    // 아직 resolve 안 됨
    await vi.advanceTimersByTimeAsync(100);

    // changed 이벤트 트리거
    triggerChanged(file);

    const result = await promise;
    expect(result).toBe(true);

    // 리스너 정리됨
    expect(app.metadataCache.offref).toHaveBeenCalled();
  });

  it('should ignore changed events for other files', async () => {
    const file = createMockFile('test.md');
    const otherFile = createMockFile('other.md');
    const { app, triggerChanged } = createMockApp({
      files: new Map([['test.md', file]]),
      fileCaches: new Map([['test.md', null]]),
    });

    const promise = waitForMetadataReady(app, 'test.md', { timeoutMs: 500 });

    // 다른 파일 이벤트
    triggerChanged(otherFile);

    // 타임아웃 발생
    await vi.advanceTimersByTimeAsync(600);

    const result = await promise;
    expect(result).toBe(false);
  });

  it('should return false on timeout', async () => {
    const file = createMockFile('test.md');
    const { app } = createMockApp({
      files: new Map([['test.md', file]]),
      fileCaches: new Map([['test.md', null]]),
    });

    const promise = waitForMetadataReady(app, 'test.md', { timeoutMs: 500 });

    await vi.advanceTimersByTimeAsync(600);

    const result = await promise;
    expect(result).toBe(false);

    // 리스너 정리됨
    expect(app.metadataCache.offref).toHaveBeenCalled();
  });

  it('should use default timeout of 2000ms', async () => {
    const file = createMockFile('test.md');
    const { app } = createMockApp({
      files: new Map([['test.md', file]]),
      fileCaches: new Map([['test.md', null]]),
    });

    const promise = waitForMetadataReady(app, 'test.md');

    // 1900ms에서는 아직 타임아웃 아님
    await vi.advanceTimersByTimeAsync(1900);

    // 2100ms에서 타임아웃
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe(false);
  });

  it('should not resolve twice on late event after timeout', async () => {
    const file = createMockFile('test.md');
    const { app, triggerChanged } = createMockApp({
      files: new Map([['test.md', file]]),
      fileCaches: new Map([['test.md', null]]),
    });

    const promise = waitForMetadataReady(app, 'test.md', { timeoutMs: 500 });

    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;
    expect(result).toBe(false);

    // 타임아웃 후 이벤트 발생해도 문제 없음
    triggerChanged(file);
  });

  describe('forceWait option', () => {
    it('should wait for changed event even when cache exists', async () => {
      const file = createMockFile('test.md');
      const { app, triggerChanged } = createMockApp({
        files: new Map([['test.md', file]]),
        fileCaches: new Map([['test.md', { frontmatter: { tags: ['old'] } }]]),
      });

      const promise = waitForMetadataReady(app, 'test.md', { forceWait: true });

      // forceWait=true이므로 캐시가 있어도 즉시 반환하지 않음
      expect(app.metadataCache.on).toHaveBeenCalledWith('changed', expect.any(Function));

      // changed 이벤트 트리거
      triggerChanged(file);

      const result = await promise;
      expect(result).toBe(true);
    });

    it('should return immediately when cache exists and forceWait is false', async () => {
      const file = createMockFile('test.md');
      const { app } = createMockApp({
        files: new Map([['test.md', file]]),
        fileCaches: new Map([['test.md', { frontmatter: {} }]]),
      });

      const result = await waitForMetadataReady(app, 'test.md', { forceWait: false });

      expect(result).toBe(true);
      expect(app.metadataCache.on).not.toHaveBeenCalled();
    });

    it('should timeout with forceWait when no event fires', async () => {
      const file = createMockFile('test.md');
      const { app } = createMockApp({
        files: new Map([['test.md', file]]),
        fileCaches: new Map([['test.md', { frontmatter: {} }]]),
      });

      const promise = waitForMetadataReady(app, 'test.md', {
        forceWait: true,
        timeoutMs: 500,
      });

      await vi.advanceTimersByTimeAsync(600);

      const result = await promise;
      expect(result).toBe(false);
      expect(app.metadataCache.offref).toHaveBeenCalled();
    });
  });
});
