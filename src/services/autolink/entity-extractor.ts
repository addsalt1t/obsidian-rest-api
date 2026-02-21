import { App } from 'obsidian';
import { getFileListCache } from '../fileListCache';
import { filterFilesByScopes } from '../../utils/path-scope';
import type { AutolinkEntityInternal } from './types';
import { buildSourceKey } from './utils';

interface CachedEntitySet {
  sourceSignature: string;
  entityMap: Map<string, AutolinkEntityInternal>;
}

const entityCacheByApp = new WeakMap<App, Map<string, CachedEntitySet>>();

function buildSourceSignature(sourceFiles: Array<{ path: string; stat: { mtime: number } }>): string {
  return sourceFiles
    .map(file => `${file.path}:${file.stat.mtime}`)
    .sort()
    .join('|');
}

function getOrCreateEntityCache(app: App): Map<string, CachedEntitySet> {
  let cache = entityCacheByApp.get(app);
  if (!cache) {
    cache = new Map<string, CachedEntitySet>();
    entityCacheByApp.set(app, cache);
  }
  return cache;
}

/**
 * Extract entity map from source paths (name/alias -> entity info)
 *
 * Recognizes markdown files under each sourcePath as entities.
 * Entity name resolution order:
 *   1. Frontmatter `name` field (string) — highest priority
 *   2. Filename without `.md` extension — fallback when `name` is absent
 *
 * Frontmatter `aliases` (string[]) are recognized with both strategies.
 */
export function extractEntitiesFromPaths(
  app: App,
  sourcePaths: string[]
): Map<string, AutolinkEntityInternal> {
  const fileCache = getFileListCache(app);
  const files = fileCache.getMarkdownFiles();
  const sourceFiles = filterFilesByScopes(files, sourcePaths);
  const sourceKey = buildSourceKey(sourcePaths);
  const sourceSignature = buildSourceSignature(sourceFiles);

  const cache = getOrCreateEntityCache(app);
  const cached = cache.get(sourceKey);
  if (cached && cached.sourceSignature === sourceSignature) {
    return new Map(cached.entityMap);
  }

  const entityMap = new Map<string, AutolinkEntityInternal>();
  for (const file of sourceFiles) {
    const cacheEntry = app.metadataCache.getFileCache(file);
    const fm = cacheEntry?.frontmatter;

    const fmName = (fm?.name && typeof fm.name === 'string') ? fm.name : null;
    const basename = file.path.split('/').pop()?.replace(/\.md$/, '') ?? '';

    if (!fmName && !basename) {
      continue;
    }

    const name = fmName ?? basename;
    const aliases: string[] = Array.isArray(fm?.aliases)
      ? fm!.aliases.filter((alias: unknown): alias is string => typeof alias === 'string')
      : [];

    const entity: AutolinkEntityInternal = {
      path: file.path,
      name,
      aliases,
    };

    entityMap.set(name.toLowerCase(), entity);
    for (const alias of aliases) {
      entityMap.set(alias.toLowerCase(), entity);
    }
  }

  cache.set(sourceKey, {
    sourceSignature,
    entityMap: new Map(entityMap),
  });

  return entityMap;
}

export function deduplicateEntities(entityMap: Map<string, AutolinkEntityInternal>): AutolinkEntityInternal[] {
  return Array.from(
    new Map(
      Array.from(entityMap.values()).map(entity => [entity.path, entity])
    ).values()
  );
}
