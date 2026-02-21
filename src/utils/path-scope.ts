/**
 * Path scope normalization helpers.
 *
 * Scope values are treated as relative vault paths and support:
 * - equivalent trailing slash variants (e.g. "notes" == "notes/")
 * - duplicate separator normalization (e.g. "notes//" == "notes/")
 */
export function normalizeScopePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === '/' || trimmed === './') {
    return '';
  }

  return trimmed
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/g, '');
}

function normalizeScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes.map(normalizeScopePath)));
}

export function filterFilesByScopes<T extends { path: string }>(files: T[], scopes?: string[]): T[] {
  if (!scopes || scopes.length === 0) {
    return files;
  }

  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.length === 0 || normalizedScopes.includes('')) {
    return files;
  }

  return files.filter(file => {
    const normalizedPath = normalizeScopePath(file.path);
    return normalizedScopes.some(scope =>
      normalizedPath === scope || normalizedPath.startsWith(`${scope}/`)
    );
  });
}
