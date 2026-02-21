import { vi } from 'vitest';
import type { App, CachedMetadata, Events, TAbstractFile, TFile, TFolder } from 'obsidian';

/**
 * Partial overrides for the mock App object.
 * Each property corresponds to a top-level App property
 * and accepts a partial set of vi.fn() overrides.
 */
export interface AppMocks {
  vault: Partial<App['vault']>;
  metadataCache: Partial<App['metadataCache']>;
  workspace: Partial<App['workspace']>;
  fileManager: Record<string, unknown>;
  commands: Record<string, unknown>;
}

/**
 * Create a mock Obsidian App with sensible defaults.
 *
 * All methods are vi.fn() stubs that return safe default values.
 * Use the `overrides` parameter to replace specific mocks.
 *
 * @example
 * ```ts
 * // Basic usage
 * const app = createMockApp();
 *
 * // With overrides
 * const app = createMockApp({
 *   vault: {
 *     read: vi.fn().mockResolvedValue('# Hello'),
 *     getMarkdownFiles: vi.fn().mockReturnValue([mockFile]),
 *   },
 * });
 * ```
 */
export function createMockApp(overrides?: Partial<AppMocks>): App {
  return {
    vault: {
      getRoot: vi.fn(() => ({ path: '', name: 'vault', children: [], isRoot: () => true })),
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      read: vi.fn().mockResolvedValue(''),
      modify: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue(undefined),
      adapter: {
        exists: vi.fn().mockResolvedValue(false),
        read: vi.fn().mockResolvedValue(''),
        write: vi.fn().mockResolvedValue(undefined),
      },
      getFiles: vi.fn().mockReturnValue([]),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
      ...overrides?.vault,
    },
    metadataCache: {
      getFileCache: vi.fn().mockReturnValue(null),
      getCache: vi.fn().mockReturnValue(null),
      getTags: vi.fn().mockReturnValue({}),
      resolvedLinks: {},
      ...overrides?.metadataCache,
    },
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null),
      getLeaf: vi.fn(() => ({
        openFile: vi.fn().mockResolvedValue(undefined),
      })),
      ...overrides?.workspace,
    },
    fileManager: {
      renameFile: vi.fn().mockResolvedValue(undefined),
      ...overrides?.fileManager,
    },
    commands: {
      commands: {},
      executeCommandById: vi.fn(),
      ...overrides?.commands,
    },
  } as unknown as App;
}

/**
 * Extended mock app builder for file-tree-based tests.
 *
 * Automatically indexes all files/folders so that
 * `getAbstractFileByPath` resolves correctly within the tree.
 *
 * @example
 * ```ts
 * const file = createMockTFile('docs/readme.md');
 * const folder = createMockTFolder('docs', [file]);
 * const root = createMockTFolder('', [folder]);
 * const app = createMockAppWithTree(root);
 *
 * app.vault.getAbstractFileByPath('docs/readme.md'); // returns file
 * ```
 */
export function createMockAppWithTree(
  rootFolder: TFolder,
  options?: {
    fileContents?: Map<string, string>;
    fileCache?: Map<string, CachedMetadata | null>;
    overrides?: Partial<AppMocks>;
  },
): App {
  const { fileContents = new Map(), fileCache = new Map(), overrides } = options ?? {};
  const { vault, metadataCache, ...restOverrides } = overrides ?? {};
  const allItems: TAbstractFile[] = [];

  function collectItems(folder: TFolder) {
    allItems.push(folder);
    for (const child of (folder as TFolder & { children: TAbstractFile[] }).children) {
      if ('children' in child) {
        collectItems(child as TFolder);
      } else {
        allItems.push(child);
      }
    }
  }
  collectItems(rootFolder);

  return createMockApp({
    vault: {
      getRoot: vi.fn(() => rootFolder),
      getAbstractFileByPath: vi.fn((path: string) => {
        if (path === '' || path === '/') return rootFolder;
        return allItems.find((f) => f.path === path) || null;
      }),
      read: vi.fn(async (file: TFile) => fileContents.get(file.path) || ''),
      cachedRead: vi.fn(async (file: TFile) => fileContents.get(file.path) || ''),
      modify: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue(undefined),
      getFiles: vi.fn(() => allItems.filter((f) => !('children' in f)) as TFile[]),
      getMarkdownFiles: vi.fn(() =>
        allItems.filter(
          (f) => !('children' in f) && (f as TFile).extension === 'md',
        ) as TFile[],
      ),
      ...vault,
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile) => fileCache.get(file.path) ?? null),
      getTags: vi.fn().mockReturnValue({}),
      resolvedLinks: {},
      ...metadataCache,
    },
    ...restOverrides,
  });
}

// ---------------------------------------------------------------------------
// File-list based mock (no tree traversal needed)
// ---------------------------------------------------------------------------

/**
 * Entry describing a single file for createMockAppWithFiles.
 */
export interface FileMockEntry {
  file: TFile;
  content?: string;
  metadata?: CachedMetadata;
}

/**
 * Create a mock App pre-loaded with a flat list of files.
 *
 * Ideal for route tests that need `getAbstractFileByPath`, `read`,
 * `cachedRead`, and `getFileCache` wired up to a known file set.
 *
 * @example
 * ```ts
 * const file = createMockTFile('note.md');
 * const app = createMockAppWithFiles([
 *   { file, content: '# Hello', metadata: someCache },
 * ]);
 * ```
 */
export function createMockAppWithFiles(
  entries: FileMockEntry[],
  overrides?: Partial<AppMocks>,
): App {
  const fileMap = new Map(entries.map((e) => [e.file.path, e]));

  const { vault, metadataCache, ...restOverrides } = overrides ?? {};

  return createMockApp({
    vault: {
      getAbstractFileByPath: vi.fn((path: string) => fileMap.get(path)?.file ?? null),
      getMarkdownFiles: vi.fn(() =>
        entries.map((e) => e.file).filter((f) => f.extension === 'md'),
      ),
      read: vi.fn(async (file: TFile) => fileMap.get(file.path)?.content ?? ''),
      cachedRead: vi.fn(async (file: TFile) => fileMap.get(file.path)?.content ?? ''),
      ...vault,
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile) => fileMap.get(file.path)?.metadata ?? null),
      ...metadataCache,
    },
    ...restOverrides,
  });
}

// ---------------------------------------------------------------------------
// Event-tracking mock (for cache service tests)
// ---------------------------------------------------------------------------

/**
 * App with exposed event listener tracking arrays.
 */
export interface EventTrackingApp extends App {
  _vaultListeners: Array<{ event: string; callback: (...args: unknown[]) => void }>;
  _metadataListeners: Array<{ event: string; callback: (...args: unknown[]) => void }>;
}

/**
 * Create a mock App that tracks vault and metadataCache event listeners.
 *
 * Useful for testing cache services that subscribe to Obsidian events.
 * Use `triggerEvent()` to simulate events on the returned app.
 *
 * @example
 * ```ts
 * const app = createMockAppWithEventListeners();
 * initSomeCache(app);
 * triggerEvent(app, 'vault', 'modify', someFile);
 * ```
 */
export function createMockAppWithEventListeners(
  overrides?: Partial<AppMocks>,
): EventTrackingApp {
  const vaultListeners: EventTrackingApp['_vaultListeners'] = [];
  const metadataListeners: EventTrackingApp['_metadataListeners'] = [];
  const { vault, metadataCache, ...restOverrides } = overrides ?? {};

  const app = createMockApp({
    vault: {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        const ref = { event, callback };
        vaultListeners.push(ref);
        return ref as ReturnType<Events['on']>;
      }),
      offref: vi.fn((ref: unknown) => {
        const idx = vaultListeners.indexOf(ref as (typeof vaultListeners)[0]);
        if (idx >= 0) vaultListeners.splice(idx, 1);
      }),
      ...vault,
    },
    metadataCache: {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        const ref = { event, callback };
        metadataListeners.push(ref);
        return ref as ReturnType<Events['on']>;
      }),
      offref: vi.fn((ref: unknown) => {
        const idx = metadataListeners.indexOf(ref as (typeof metadataListeners)[0]);
        if (idx >= 0) metadataListeners.splice(idx, 1);
      }),
      ...metadataCache,
    },
    ...restOverrides,
  }) as EventTrackingApp;

  app._vaultListeners = vaultListeners;
  app._metadataListeners = metadataListeners;
  return app;
}

/**
 * Fire a simulated event on an EventTrackingApp.
 *
 * Calls all registered listeners that match the given event name.
 *
 * @example
 * ```ts
 * triggerEvent(app, 'vault', 'modify', someFile);
 * triggerEvent(app, 'metadata', 'changed', someFile, undefined, someCache);
 * ```
 */
export function triggerEvent(
  app: EventTrackingApp,
  source: 'vault' | 'metadata',
  event: string,
  ...args: unknown[]
): void {
  const listeners = source === 'vault' ? app._vaultListeners : app._metadataListeners;
  listeners.filter((l) => l.event === event).forEach((l) => l.callback(...args));
}
