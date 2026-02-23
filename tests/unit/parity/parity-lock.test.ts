import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARITY_CATALOG } from '@obsidian-workspace/shared-types';

interface ParityCatalogLock {
  schemaVersion: number;
  packageName: string;
  packageVersion: string;
  entryCount: number;
  catalogHash: string;
  entries: unknown[];
}

const ROOT_DIR = path.resolve(__dirname, '../../..');
const LOCK_PATH = path.join(ROOT_DIR, 'contracts/parity-catalog.lock.json');
const SHARED_TYPES_PKG_PATH = path.join(ROOT_DIR, 'packages/shared-types/package.json');

function normalizeParityCatalog() {
  return PARITY_CATALOG.map((entry) => ({
    id: entry.id,
    tier: entry.tier,
    rest: {
      method: entry.rest.method,
      path: entry.rest.path,
      openApiPath: entry.rest.openApiPath,
    },
    ...(entry.mcp ? { mcp: { namespace: entry.mcp.namespace, method: entry.mcp.method } } : {}),
  }));
}

function hashEntries(entries: unknown[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(entries)).digest('hex')}`;
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing parity lock file: ${filePath}. Run "npm run contract:export".`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

describe('Parity catalog lock contract', () => {
  it('keeps contracts/parity-catalog.lock.json in sync with PARITY_CATALOG', () => {
    const lock = readJson<ParityCatalogLock>(LOCK_PATH);
    const sharedTypesPkg = readJson<{ version: string }>(SHARED_TYPES_PKG_PATH);
    const normalizedCatalog = normalizeParityCatalog();

    expect(lock.schemaVersion).toBe(1);
    expect(lock.packageName).toBe('@obsidian-workspace/shared-types');
    expect(lock.packageVersion).toBe(sharedTypesPkg.version);
    expect(lock.entryCount).toBe(normalizedCatalog.length);
    expect(lock.entries).toEqual(normalizedCatalog);
    expect(lock.catalogHash).toBe(hashEntries(normalizedCatalog));
  });
});
