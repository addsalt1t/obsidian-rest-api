import { App } from 'obsidian';
import { KO_PARTICLES, MAX_ALIASES } from './constants';
import { deduplicateEntities, extractEntitiesFromPaths } from './entity-extractor';
import type { AutolinkEntityInternal, NameEntry } from './types';
import { buildSourceKey } from './utils';

interface PreparedEntityMatcher {
  sortedNames: NameEntry[];
  patternMap: Map<string, RegExp>;
}

interface CachedMatcher {
  entitySignature: string;
  prepared: PreparedEntityMatcher;
}

const matcherCacheByApp = new WeakMap<App, Map<string, CachedMatcher>>();

const CASE_INSENSITIVE_MIN_LENGTH = 3;

function getComparableLength(name: string): number {
  return name.replace(/[^0-9A-Za-z가-힣]/g, '').length;
}

function shouldUseCaseInsensitiveMatch(name: string): boolean {
  if (!/[A-Za-z]/.test(name)) {
    return false;
  }
  return getComparableLength(name) >= CASE_INSENSITIVE_MIN_LENGTH;
}

/**
 * Build regex pattern from entity name (with Korean particle support)
 */
export function buildEntityPattern(name: string, aliases: string[] = []): RegExp {
  const safeAliases = aliases.slice(0, MAX_ALIASES);
  const allNames = [name, ...safeAliases].map(entry => entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namesPattern = allNames.join('|');
  const flags = shouldUseCaseInsensitiveMatch(name) ? 'gi' : 'g';

  return new RegExp(
    `(?<!\\[\\[)(?<!\\|)(?<![0-9A-Za-z가-힣_])(${namesPattern})(${KO_PARTICLES})?(?![0-9A-Za-z가-힣_])(?!\\]\\])`,
    flags
  );
}

function buildSortedNames(entities: AutolinkEntityInternal[]): NameEntry[] {
  const sortedNames: NameEntry[] = [];
  for (const entity of entities) {
    sortedNames.push({ name: entity.name, entity });
    for (const alias of entity.aliases) {
      sortedNames.push({ name: alias, entity });
    }
  }
  sortedNames.sort((a, b) => b.name.length - a.name.length);
  return sortedNames;
}

function buildEntitySignature(entities: AutolinkEntityInternal[]): string {
  return entities
    .map(entity => `${entity.path}:${entity.name}:${entity.aliases.join(',')}`)
    .sort()
    .join('|');
}

function getOrCreateMatcherCache(app: App): Map<string, CachedMatcher> {
  let cache = matcherCacheByApp.get(app);
  if (!cache) {
    cache = new Map<string, CachedMatcher>();
    matcherCacheByApp.set(app, cache);
  }
  return cache;
}

/**
 * Perform entity extraction, sorting, and pattern pre-compilation in one step
 */
export function prepareEntityMatching(
  app: App,
  entitySourcePaths: string[]
): PreparedEntityMatcher | null {
  const entityMap = extractEntitiesFromPaths(app, entitySourcePaths);
  if (entityMap.size === 0) {
    return null;
  }

  const entities = deduplicateEntities(entityMap);
  const entitySignature = buildEntitySignature(entities);
  const sourceKey = buildSourceKey(entitySourcePaths);

  const cache = getOrCreateMatcherCache(app);
  const cached = cache.get(sourceKey);
  if (cached && cached.entitySignature === entitySignature) {
    return cached.prepared;
  }

  const sortedNames = buildSortedNames(entities);
  const patternMap = new Map<string, RegExp>();
  for (const { name } of sortedNames) {
    if (!patternMap.has(name)) {
      patternMap.set(name, buildEntityPattern(name));
    }
  }

  const prepared = { sortedNames, patternMap };
  cache.set(sourceKey, { entitySignature, prepared });
  return prepared;
}
