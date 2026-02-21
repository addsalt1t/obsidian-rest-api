/**
 * File-related helper functions
 * Consolidates common logic for path normalization, file lookup, folder creation, etc.
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { FILE_EXT } from '../constants';
import { validatePath } from './path-validation';

/**
 * Normalize path and append .md extension
 * @param path - The original path
 * @returns Normalized markdown file path
 */
export function ensureMarkdownPath(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized.endsWith(FILE_EXT.MARKDOWN)) {
    return `${normalized}${FILE_EXT.MARKDOWN}`;
  }
  return normalized;
}

/**
 * Get a file or return null
 * @param app - Obsidian App instance
 * @param path - File path
 * @returns TFile or null
 */
export function getFileOrNull(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path);
  if (file && file instanceof TFile) {
    return file;
  }
  return null;
}

/**
 * Get a file with automatic extension fallback (tries with .md if not found)
 * @param app - Obsidian App instance
 * @param path - File path
 * @returns TFile or null
 */
export function getFileWithFallback(app: App, path: string): { file: TFile | null; path: string } {
  const normalized = normalizePath(path);

  // 1. Try exact path
  let file = getFileOrNull(app, normalized);
  if (file) {
    return { file, path: normalized };
  }

  // 2. Try with .md extension appended
  if (!normalized.endsWith(FILE_EXT.MARKDOWN)) {
    const mdPath = `${normalized}${FILE_EXT.MARKDOWN}`;
    file = getFileOrNull(app, mdPath);
    if (file) {
      return { file, path: mdPath };
    }
  }

  return { file: null, path: normalized };
}

/**
 * Create parent folder if it does not exist
 * @param app - Obsidian App instance
 * @param path - File path
 */
export async function ensureParentFolder(app: App, path: string): Promise<void> {
  const folder = path.substring(0, path.lastIndexOf('/'));
  if (folder && !app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }
}

/**
 * Get a folder or return null
 * @param app - Obsidian App instance
 * @param path - Folder path
 * @returns TFolder or null
 */
export function getFolderOrNull(app: App, path: string): TFolder | null {
  const folder = app.vault.getAbstractFileByPath(path);
  if (folder && folder instanceof TFolder) {
    return folder;
  }
  return null;
}

/**
 * Resolve a safe file path and also return the normalized path
 * Use when the path needs to be referenced in subsequent logic
 * @param app - Obsidian App instance
 * @param requestPath - The original path sent by the client
 * @returns { file, normalizedPath }
 * @throws PathValidationError if the path is unsafe
 */
export function resolveSafeFilePathWithNormalized(
  app: App,
  requestPath: string,
): { file: TFile | null; normalizedPath: string } {
  validatePath(requestPath);
  const normalizedPath = ensureMarkdownPath(requestPath);
  return { file: getFileOrNull(app, normalizedPath), normalizedPath };
}
