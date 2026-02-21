/**
 * metadataCache readiness waiting utility
 * Waits until Obsidian re-indexes metadataCache after move/rename operations
 */

import { App, TAbstractFile, TFile } from 'obsidian';

/** Default wait timeout (milliseconds) */
const DEFAULT_TIMEOUT_MS = 2000;

/** Options for waitForMetadataReady */
export interface WaitForMetadataOptions {
  /** Wait timeout in milliseconds (default: 2000) */
  timeoutMs?: number;
  /**
   * If true, wait for the next changed event even if cache already exists.
   * Use when waiting for stale cache to refresh after a modify operation.
   */
  forceWait?: boolean;
}

/** Check if a TAbstractFile is a TFile (duck typing -- compatible with mock environments) */
function isTFile(file: TAbstractFile): file is TFile {
  return 'extension' in file;
}

/**
 * Wait until metadataCache is ready for the specified path
 * - forceWait=false (default): returns true immediately if cache already exists
 * - forceWait=true: waits for the next changed event regardless of cache existence
 * - Returns false on timeout (processing can still proceed)
 */
export function waitForMetadataReady(
  app: App,
  path: string,
  options: WaitForMetadataOptions = {}
): Promise<boolean> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, forceWait = false } = options;

  // Verify TFile
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !isTFile(file)) {
    return Promise.resolve(false);
  }

  // If not forceWait and cache already exists, return immediately
  if (!forceWait) {
    const existing = app.metadataCache.getFileCache(file);
    if (existing) {
      return Promise.resolve(true);
    }
  }

  // Wait for event
  return new Promise<boolean>((resolve) => {
    let settled = false;

    const eventRef = app.metadataCache.on('changed', (changedFile: TFile) => {
      if (settled) return;
      if (changedFile.path === path) {
        settled = true;
        app.metadataCache.offref(eventRef);
        clearTimeout(timer);
        resolve(true);
      }
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      app.metadataCache.offref(eventRef);
      resolve(false);
    }, timeoutMs);
  });
}
