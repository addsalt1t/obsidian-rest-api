import type { CachedMetadata, TAbstractFile, TFile, TFolder } from 'obsidian';

// ---------------------------------------------------------------------------
// TFile builder
// ---------------------------------------------------------------------------

export interface MockTFileOptions {
  /** Full vault-relative path (e.g. "notes/readme.md") */
  path: string;
  size?: number;
  ctime?: number;
  mtime?: number;
}

/**
 * Create a mock TFile with stat metadata.
 *
 * Automatically derives `name`, `basename`, and `extension` from `path`.
 *
 * @example
 * ```ts
 * const file = createMockTFile({ path: 'docs/guide.md', size: 1024 });
 * file.name;      // "guide.md"
 * file.basename;  // "guide"
 * file.extension; // "md"
 * file.stat.size; // 1024
 * ```
 */
export function createMockTFile(options: MockTFileOptions | string): TFile {
  const opts = typeof options === 'string' ? { path: options } : options;
  const { path, size = 100, ctime = 1000, mtime = 2000 } = opts;
  const name = path.split('/').pop() || '';
  const extension = name.includes('.') ? name.split('.').pop() || '' : '';
  const basename = name.replace(/\.[^/.]+$/, '');

  return {
    path,
    name,
    basename,
    extension,
    stat: { size, ctime, mtime },
    vault: {},
    parent: null,
  } as unknown as TFile;
}

// ---------------------------------------------------------------------------
// TFolder builder
// ---------------------------------------------------------------------------

/**
 * Create a mock TFolder that contains the given children.
 *
 * Automatically sets each child's `parent` reference to this folder.
 *
 * @example
 * ```ts
 * const file = createMockTFile({ path: 'src/index.ts' });
 * const folder = createMockTFolder('src', [file]);
 * folder.children; // [file]
 * ```
 */
export function createMockTFolder(
  path: string,
  children: TAbstractFile[] = [],
): TFolder {
  const folder = {
    path,
    name: path.split('/').pop() || path || 'vault',
    children,
    vault: {},
    parent: null,
    isRoot() {
      return path === '' || path === '/';
    },
  } as unknown as TFolder;

  // Set parent reference for children
  children.forEach((child) => {
    (child as TAbstractFile & { parent: unknown }).parent = folder;
  });

  return folder;
}

// ---------------------------------------------------------------------------
// CachedMetadata builder
// ---------------------------------------------------------------------------

export interface MockCachedMetadataOptions {
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  links?: Array<{ link: string; displayText?: string }>;
  headings?: Array<{ heading: string; level: number }>;
}

/**
 * Create a mock CachedMetadata object.
 *
 * Accepts simplified inputs and converts them to Obsidian's format.
 * - `tags`: string array -> `{ tag: '#tagname' }[]`
 * - `frontmatter`: auto-adds `position` stub (required by Obsidian)
 *
 * @example
 * ```ts
 * const cache = createMockCachedMetadata({
 *   frontmatter: { title: 'Test', status: 'draft' },
 *   tags: ['important', 'todo'],
 *   links: [{ link: 'other.md' }],
 * });
 * ```
 */
export function createMockCachedMetadata(
  options: MockCachedMetadataOptions = {},
): CachedMetadata {
  const { frontmatter, tags, links, headings } = options;

  const cache: CachedMetadata = {};

  if (frontmatter) {
    cache.frontmatter = {
      ...frontmatter,
      position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
    } as CachedMetadata['frontmatter'];
  }

  if (tags) {
    cache.tags = tags.map((t) => ({
      tag: t.startsWith('#') ? t : `#${t}`,
      position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
    }));
  }

  if (links) {
    cache.links = links.map((l) => ({
      link: l.link,
      displayText: l.displayText ?? l.link,
      original: `[[${l.link}]]`,
      position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
    })) as CachedMetadata['links'];
  }

  if (headings) {
    cache.headings = headings.map((h) => ({
      heading: h.heading,
      level: h.level,
      position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
    }));
  }

  return cache;
}

// ---------------------------------------------------------------------------
// Common fixtures (ready-to-use data for common test scenarios)
// ---------------------------------------------------------------------------

/** A simple markdown file at the vault root */
export const FIXTURE_ROOT_FILE = createMockTFile({
  path: 'note.md',
  size: 256,
  ctime: 1700000000000,
  mtime: 1700000001000,
});

/** A markdown file inside a nested folder */
export const FIXTURE_NESTED_FILE = createMockTFile({
  path: 'projects/obsidian/readme.md',
  size: 1024,
  ctime: 1700000000000,
  mtime: 1700000002000,
});

/** A non-markdown file (image) */
export const FIXTURE_IMAGE_FILE = createMockTFile({
  path: 'attachments/photo.png',
  size: 50000,
  ctime: 1700000000000,
  mtime: 1700000000000,
});

/** CachedMetadata with frontmatter and inline tags */
export const FIXTURE_RICH_CACHE = createMockCachedMetadata({
  frontmatter: { title: 'Test Note', status: 'draft', tags: ['project'] },
  tags: ['important', 'todo'],
  links: [{ link: 'other.md', displayText: 'Other Note' }],
  headings: [
    { heading: 'Introduction', level: 1 },
    { heading: 'Details', level: 2 },
  ],
});
