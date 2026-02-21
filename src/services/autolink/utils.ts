import { normalizeScopePath } from '../../utils/path-scope';

export function buildSourceKey(sourcePaths: string[]): string {
  const normalized = Array.from(new Set(sourcePaths.map(normalizeScopePath))).sort();
  return normalized.join('|');
}
