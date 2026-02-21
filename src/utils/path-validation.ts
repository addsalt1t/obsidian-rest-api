/**
 * Path traversal validation utilities
 * Path validation to prevent access outside the vault
 */

/**
 * Check if a path attempts path traversal attacks
 * @param path - The path to validate
 * @returns true if the path is safe
 */
export function isSafePath(path: string): boolean {
  // Empty path is safe (root)
  if (!path || path === '/') {
    return true;
  }

  // Block Unix absolute paths (starting with slash)
  if (path.startsWith('/')) {
    return false;
  }

  // Block Windows absolute paths (drive letter)
  if (/^[A-Za-z]:/.test(path)) {
    return false;
  }

  // Block null bytes (filesystem vulnerability)
  if (path.includes('\0')) {
    return false;
  }

  // Analyze path segments
  const segments = path.split(/[/\\]/);

  for (const segment of segments) {
    // Empty segments (consecutive slashes or leading/trailing slashes) - allowed
    if (!segment) continue;

    // Block parent directory references
    if (segment === '..' || segment === '...' || segment.includes('..')) {
      return false;
    }

    // Block Windows reserved device names
    const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    const baseSegment = segment.split('.')[0];
    if (windowsReserved.test(baseSegment)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a path and throw an error if it is unsafe
 * @param path - The path to validate
 * @throws {PathValidationError} If the path is unsafe
 */
export function validatePath(path: string): void {
  if (!isSafePath(path)) {
    throw new PathValidationError(path);
  }
}

/**
 * Path validation error
 */
export class PathValidationError extends Error {
  public readonly path: string;
  public readonly statusCode = 400;

  constructor(path: string) {
    super('Invalid path: contains path traversal sequences or invalid characters');
    this.name = 'PathValidationError';
    this.path = path; // Keep for internal logging only
  }
}
