import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fileListCache before imports
vi.mock('../../../src/services/fileListCache', () => ({
  getFileListCache: vi.fn(),
}));

// Mock waitForMetadataReady
vi.mock('../../../src/utils/metadata-ready', () => ({
  waitForMetadataReady: vi.fn().mockResolvedValue(true),
}));

// Mock path-validation (let validatePath be a no-op by default)
vi.mock('../../../src/utils/path-validation', () => ({
  validatePath: vi.fn(),
  isSafePath: vi.fn().mockReturnValue(true),
  PathValidationError: class PathValidationError extends Error {
    public readonly path: string;
    public readonly statusCode = 400;
    constructor(path: string) {
      super(`Invalid path: "${path}"`);
      this.name = 'PathValidationError';
      this.path = path;
    }
  },
}));

import {
  buildEntityPattern,
  extractEntitiesFromPaths,
  scan,
  linkify,
} from '../../../src/services/autolink/autolink-service';
import { getFileListCache } from '../../../src/services/fileListCache';
import { createMockTFile, createMockCachedMetadata } from '../../helpers/fixtures';
import type { App } from 'obsidian';

describe('Autolink Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // buildEntityPattern
  // ---------------------------------------------------------------------------

  describe('buildEntityPattern', () => {
    it('should match exact entity name in text', () => {
      const pattern = buildEntityPattern('Hero');
      const match = pattern.exec('The Hero walked in.');
      expect(match).not.toBeNull();
      expect(match![1]).toBe('Hero');
    });

    it('should match name with Korean particles', () => {
      const pattern = buildEntityPattern('카이런');
      const text = '카이런은 용감한 전사였다.';
      const match = pattern.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('카이런');
      expect(match![2]).toBe('은');
    });

    it('should match aliases', () => {
      const pattern = buildEntityPattern('카이런', ['카이']);
      const text = '카이가 말했다.';
      const match = pattern.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('카이');
    });

    it('should escape regex special characters in name', () => {
      const pattern = buildEntityPattern('Dr. Strange');
      const text = 'Dr. Strange appeared.';
      const match = pattern.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('Dr. Strange');
    });

    it('should not match text already inside wikilinks', () => {
      const pattern = buildEntityPattern('Hero');
      const text = '[[Hero]] is brave.';
      const match = pattern.exec(text);
      expect(match).toBeNull();
    });

    it('should match multiple occurrences', () => {
      const pattern = buildEntityPattern('Hero');
      const text = 'Hero met Hero again.';
      const matches: string[] = [];
      let m;
      while ((m = pattern.exec(text)) !== null) {
        matches.push(m[1]);
      }
      expect(matches).toEqual(['Hero', 'Hero']);
    });

    it('should limit aliases to MAX_ALIASES', () => {
      // MAX_ALIASES is 20; providing 30 should only keep the first 20
      // Use unique names with no substring overlap to avoid partial matches
      const aliases = Array.from({ length: 30 }, (_, i) => {
        const letter = String.fromCharCode(65 + i); // A, B, C, ...
        return `UniqueAlias${letter}${letter}${letter}`; // UniqueAliasAAA, UniqueAliasBBB, ...
      });
      const pattern = buildEntityPattern('MainEntity', aliases);
      expect(pattern).toBeInstanceOf(RegExp);

      // MainEntity and first 20 aliases should match
      pattern.lastIndex = 0;
      expect(pattern.test('MainEntity')).toBe(true);
      pattern.lastIndex = 0;
      expect(pattern.test('UniqueAliasAAA')).toBe(true); // alias index 0

      // alias index 20 (letter 'U') should NOT be included (MAX_ALIASES=20)
      // aliases[20] = 'UniqueAliasUUU'
      pattern.lastIndex = 0;
      expect(pattern.test('UniqueAliasUUU')).toBe(false);
      // aliases[25] = 'UniqueAliasZZZ'
      pattern.lastIndex = 0;
      expect(pattern.test('UniqueAliasZZZ')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // extractEntitiesFromPaths
  // ---------------------------------------------------------------------------

  describe('extractEntitiesFromPaths', () => {
    it('should extract entities with name frontmatter', () => {
      const entityFile = createMockTFile({ path: 'entities/hero.md', mtime: 1000 });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([entityFile]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn(() =>
            createMockCachedMetadata({
              frontmatter: { name: 'Hero', aliases: ['Champion'] },
            })
          ),
        },
      } as unknown as App;

      const entityMap = extractEntitiesFromPaths(mockApp, ['entities']);

      expect(entityMap.size).toBe(2); // 'hero' + 'champion'
      expect(entityMap.has('hero')).toBe(true);
      expect(entityMap.has('champion')).toBe(true);
      expect(entityMap.get('hero')!.name).toBe('Hero');
      expect(entityMap.get('hero')!.path).toBe('entities/hero.md');
      expect(entityMap.get('hero')!.aliases).toEqual(['Champion']);
    });

    it('should skip files without name in frontmatter', () => {
      const file1 = createMockTFile({ path: 'entities/hero.md' });
      const file2 = createMockTFile({ path: 'entities/noname.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn((file: any) => {
            if (file.path === 'entities/hero.md') {
              return createMockCachedMetadata({
                frontmatter: { name: 'Hero' },
              });
            }
            return createMockCachedMetadata({
              frontmatter: { title: 'No Name' },
            });
          }),
        },
      } as unknown as App;

      const entityMap = extractEntitiesFromPaths(mockApp, ['entities']);

      expect(entityMap.size).toBe(1);
      expect(entityMap.has('hero')).toBe(true);
    });

    it('should skip files without any frontmatter', () => {
      const file = createMockTFile({ path: 'entities/bare.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue(null),
        },
      } as unknown as App;

      const entityMap = extractEntitiesFromPaths(mockApp, ['entities']);

      expect(entityMap.size).toBe(0);
    });

    it('should handle multiple source paths', () => {
      const file1 = createMockTFile({ path: 'chars/hero.md' });
      const file2 = createMockTFile({ path: 'places/castle.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file1, file2]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn((file: any) => {
            if (file.path === 'chars/hero.md') {
              return createMockCachedMetadata({ frontmatter: { name: 'Hero' } });
            }
            if (file.path === 'places/castle.md') {
              return createMockCachedMetadata({ frontmatter: { name: 'Castle' } });
            }
            return null;
          }),
        },
      } as unknown as App;

      const entityMap = extractEntitiesFromPaths(mockApp, ['chars', 'places']);

      expect(entityMap.size).toBe(2);
      expect(entityMap.has('hero')).toBe(true);
      expect(entityMap.has('castle')).toBe(true);
    });

    it('should only include files under the specified source paths', () => {
      const insidePath = createMockTFile({ path: 'entities/hero.md' });
      const outsidePath = createMockTFile({ path: 'stories/chapter1.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([insidePath, outsidePath]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn(() =>
            createMockCachedMetadata({ frontmatter: { name: 'SomeName' } })
          ),
        },
      } as unknown as App;

      const entityMap = extractEntitiesFromPaths(mockApp, ['entities']);

      // Only the file under 'entities/' should be included
      expect(entityMap.size).toBe(1);
      expect(entityMap.get('somename')!.path).toBe('entities/hero.md');
    });

    it('should normalize source path variants as the same scope', () => {
      const insidePath = createMockTFile({ path: 'entities/hero.md' });
      const outsidePath = createMockTFile({ path: 'stories/chapter1.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([insidePath, outsidePath]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn(() =>
            createMockCachedMetadata({ frontmatter: { name: 'Hero' } })
          ),
        },
      } as unknown as App;

      const base = extractEntitiesFromPaths(mockApp, ['entities']);
      const trailing = extractEntitiesFromPaths(mockApp, ['entities/']);
      const duplicated = extractEntitiesFromPaths(mockApp, ['entities//']);

      expect(base.size).toBe(1);
      expect(trailing.size).toBe(base.size);
      expect(duplicated.size).toBe(base.size);
    });

    it('should skip non-string name values', () => {
      const file = createMockTFile({ path: 'entities/bad.md' });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([file]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        metadataCache: {
          getFileCache: vi.fn(() =>
            createMockCachedMetadata({ frontmatter: { name: 12345 } })
          ),
        },
      } as unknown as App;

      const entityMap = extractEntitiesFromPaths(mockApp, ['entities']);

      expect(entityMap.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // scan
  // ---------------------------------------------------------------------------

  describe('scan', () => {
    const entityFile = createMockTFile({ path: 'entities/hero.md', mtime: 1000 });
    const storyFile = createMockTFile({ path: 'stories/chapter1.md', mtime: 2000 });

    function setupMocks(content: string, entityName = '카이런', aliases: string[] = ['카이']) {
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([entityFile, storyFile]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      return {
        vault: {
          cachedRead: vi.fn().mockResolvedValue(content),
          modify: vi.fn().mockResolvedValue(undefined),
        },
        metadataCache: {
          getFileCache: vi.fn((file: any) => {
            if (file.path === 'entities/hero.md') {
              return createMockCachedMetadata({
                frontmatter: { name: entityName, aliases },
              });
            }
            return null;
          }),
        },
      } as unknown as App;
    }

    it('should find unlinked entity mentions', async () => {
      const mockApp = setupMocks('카이런은 용감한 전사였다.');

      const result = await scan(mockApp, {
        entitySourcePaths: ['entities'],
      });

      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.matches.length).toBeGreaterThan(0);
      // All matches should reference the entity
      expect(result.matches.every(m => m.entityName === '카이런')).toBe(true);
      // At least one match should be in a scanned file
      const filePaths = result.matches.map(m => m.filePath);
      expect(filePaths).toContain('stories/chapter1.md');
    });

    it('should return empty when no entities found', async () => {
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([storyFile]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        vault: {
          cachedRead: vi.fn().mockResolvedValue('No entities here.'),
        },
        metadataCache: {
          getFileCache: vi.fn().mockReturnValue(null),
        },
      } as unknown as App;

      const result = await scan(mockApp, {
        entitySourcePaths: ['entities'],
      });

      expect(result.matches).toEqual([]);
      expect(result.totalFiles).toBe(0);
      expect(result.totalMatches).toBe(0);
      expect(result.byEntity).toEqual({});
    });

    it('should calculate confidence levels', async () => {
      // Short name (<=2 chars) gets 'low' confidence
      const mockApp = setupMocks('AB went home. 카이런 is here.', 'AB', ['카이런']);

      const result = await scan(mockApp, {
        entitySourcePaths: ['entities'],
      });

      const abMatch = result.matches.find(m => m.matchedText === 'AB');
      const kairunMatch = result.matches.find(m => m.matchedText === '카이런');

      if (abMatch) {
        expect(abMatch.confidence).toBe('low');
      }
      if (kairunMatch) {
        // alias match -> medium confidence
        expect(kairunMatch.confidence).toBe('medium');
      }
    });

    it('should respect targetPaths filter', async () => {
      const otherFile = createMockTFile({ path: 'other/doc.md', mtime: 3000 });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([entityFile, storyFile, otherFile]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const mockApp = {
        vault: {
          cachedRead: vi.fn().mockResolvedValue('카이런이 나타났다.'),
        },
        metadataCache: {
          getFileCache: vi.fn((file: any) => {
            if (file.path === 'entities/hero.md') {
              return createMockCachedMetadata({
                frontmatter: { name: '카이런' },
              });
            }
            return null;
          }),
        },
      } as unknown as App;

      const result = await scan(mockApp, {
        entitySourcePaths: ['entities'],
        targetPaths: ['stories'],
      });

      // Only stories/chapter1.md should be scanned
      expect(result.totalFiles).toBe(1);
      const paths = result.matches.map(m => m.filePath);
      expect(paths.every(p => p.startsWith('stories/'))).toBe(true);
    });

    it('should populate byEntity counts', async () => {
      const mockApp = setupMocks('카이런은 용감했고, 카이런은 다시 나타났다.');

      const result = await scan(mockApp, {
        entitySourcePaths: ['entities'],
      });

      expect(result.byEntity['카이런']).toBeGreaterThanOrEqual(1);
    });

    it('should provide context around matches', async () => {
      const mockApp = setupMocks('In the kingdom, 카이런은 appeared heroically.');

      const result = await scan(mockApp, {
        entitySourcePaths: ['entities'],
      });

      if (result.matches.length > 0) {
        expect(result.matches[0].context).toBeDefined();
        expect(result.matches[0].context.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // linkify
  // ---------------------------------------------------------------------------

  describe('linkify', () => {
    const entityFile = createMockTFile({ path: 'entities/hero.md', mtime: 1000 });
    const storyFile = createMockTFile({ path: 'stories/chapter1.md', mtime: 2000 });

    function setupMocks(content: string) {
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([entityFile, storyFile]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      return {
        vault: {
          cachedRead: vi.fn().mockResolvedValue(content),
          modify: vi.fn().mockResolvedValue(undefined),
        },
        metadataCache: {
          getFileCache: vi.fn((file: any) => {
            if (file.path === 'entities/hero.md') {
              return createMockCachedMetadata({
                frontmatter: { name: '카이런', aliases: ['카이'] },
              });
            }
            return null;
          }),
        },
      } as unknown as App;
    }

    it('should convert mentions to wikilinks', async () => {
      const mockApp = setupMocks('카이런은 용감한 전사였다.');

      const result = await linkify(mockApp, {
        entitySourcePaths: ['entities'],
      });

      expect(result.totalChanges).toBeGreaterThan(0);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.changes[0].after).toContain('[[카이런]]');
      expect(result.changes[0].applied).toBe(true);
    });

    it('should not modify files in dry run mode', async () => {
      const mockApp = setupMocks('카이런은 용감한 전사였다.');

      const result = await linkify(mockApp, {
        entitySourcePaths: ['entities'],
        dryRun: true,
      });

      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.changes[0].applied).toBe(false);
      expect(result.filesModified).toBe(0);
      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });

    it('should skip low-confidence matches when autoConfirm is false', async () => {
      // '카이' is an alias -> medium confidence, should be skipped without autoConfirm
      const mockApp = setupMocks('카이가 나타났다.');

      const result = await linkify(mockApp, {
        entitySourcePaths: ['entities'],
        autoConfirm: false,
      });

      expect(result.skipped).toBeGreaterThan(0);
    });

    it('should apply all matches when autoConfirm is true', async () => {
      const mockApp = setupMocks('카이가 나타났다.');

      const result = await linkify(mockApp, {
        entitySourcePaths: ['entities'],
        autoConfirm: true,
      });

      // With autoConfirm, even medium-confidence matches should be applied
      const appliedChanges = result.changes.filter(c => c.applied);
      expect(appliedChanges.length).toBeGreaterThan(0);
    });

    it('should use display text for alias matches', async () => {
      const mockApp = setupMocks('카이가 나타났다.');

      const result = await linkify(mockApp, {
        entitySourcePaths: ['entities'],
        autoConfirm: true,
      });

      const aliasChange = result.changes.find(c => c.after.includes('|'));
      if (aliasChange) {
        // Alias should produce [[카이런|카이]] format
        expect(aliasChange.after).toContain('[[카이런|카이]]');
      }
    });

    it('should call vault.modify with updated content', async () => {
      const mockApp = setupMocks('카이런은 여기에 있었다.');

      await linkify(mockApp, {
        entitySourcePaths: ['entities'],
      });

      expect(mockApp.vault.modify).toHaveBeenCalled();
      const modifyCall = vi.mocked(mockApp.vault.modify).mock.calls[0];
      expect(modifyCall[1]).toContain('[[카이런]]');
    });

    it('should report correct filesModified count', async () => {
      const mockApp = setupMocks('카이런은 여기에 있었다.');

      const result = await linkify(mockApp, {
        entitySourcePaths: ['entities'],
      });

      expect(result.filesModified).toBeGreaterThanOrEqual(1);
    });

    it('should handle content with no matches', async () => {
      const mockApp = setupMocks('No entity names here at all.');

      const result = await linkify(mockApp, {
        entitySourcePaths: ['entities'],
      });

      expect(result.changes).toEqual([]);
      expect(result.filesModified).toBe(0);
      expect(result.totalChanges).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  describe('shared matcher preparation', () => {
    it('should reuse entity preparation between scan and linkify for identical source paths', async () => {
      const entityFile = createMockTFile({ path: 'entities/hero.md', mtime: 1000 });
      const storyFile = createMockTFile({ path: 'stories/chapter1.md', mtime: 2000 });
      const mockFileListCache = {
        getMarkdownFiles: vi.fn().mockReturnValue([entityFile, storyFile]),
      };
      vi.mocked(getFileListCache).mockReturnValue(mockFileListCache as any);

      const metadataSpy = vi.fn((file: { path: string }) => {
        if (file.path === 'entities/hero.md') {
          return createMockCachedMetadata({
            frontmatter: { name: '카이런', aliases: ['카이'] },
          });
        }
        return null;
      });

      const mockApp = {
        vault: {
          cachedRead: vi.fn().mockResolvedValue('카이런이 다시 등장했다.'),
          modify: vi.fn().mockResolvedValue(undefined),
        },
        metadataCache: {
          getFileCache: metadataSpy,
        },
      } as unknown as App;

      await scan(mockApp, {
        entitySourcePaths: ['entities'],
        targetPaths: ['stories'],
      });

      await linkify(mockApp, {
        entitySourcePaths: ['entities'],
        targetPaths: ['stories'],
        dryRun: true,
      });

      expect(metadataSpy).toHaveBeenCalledTimes(1);
    });
  });
});
