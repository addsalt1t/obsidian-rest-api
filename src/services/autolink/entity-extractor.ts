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
 * 소스 경로에서 엔티티 맵 추출 (이름/별칭 -> 엔티티 정보)
 *
 * 각 sourcePath 하위의 마크다운 파일 중 frontmatter에 `name` 필드가 있는 파일을
 * 엔티티로 인식합니다. `type` 필드는 필수가 아닙니다.
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

    if (!fm?.name || typeof fm.name !== 'string') {
      continue;
    }

    const aliases: string[] = Array.isArray(fm.aliases)
      ? fm.aliases.filter((alias: unknown): alias is string => typeof alias === 'string')
      : [];

    const entity: AutolinkEntityInternal = {
      path: file.path,
      name: fm.name,
      aliases,
    };

    entityMap.set(fm.name.toLowerCase(), entity);
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
