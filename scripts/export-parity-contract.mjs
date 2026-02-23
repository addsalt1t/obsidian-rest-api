import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SHARED_TYPES_DIST_PATH = path.join(REPO_ROOT, 'packages/shared-types/dist/index.js');
const SHARED_TYPES_PACKAGE_PATH = path.join(REPO_ROOT, 'packages/shared-types/package.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'contracts/parity-catalog.lock.json');

function normalizeParityCatalog(catalog) {
  return catalog.map((entry) => ({
    id: entry.id,
    tier: entry.tier,
    rest: {
      method: entry.rest.method,
      path: entry.rest.path,
      openApiPath: entry.rest.openApiPath,
    },
    ...(entry.mcp
      ? {
          mcp: {
            namespace: entry.mcp.namespace,
            method: entry.mcp.method,
          },
        }
      : {}),
  }));
}

function hashEntries(entries) {
  return `sha256:${createHash('sha256').update(JSON.stringify(entries)).digest('hex')}`;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await pathExists(SHARED_TYPES_DIST_PATH))) {
    throw new Error(
      `Shared types build output not found at ${SHARED_TYPES_DIST_PATH}. ` +
        'Run "npm run build:types" first.'
    );
  }

  const moduleUrl = pathToFileURL(SHARED_TYPES_DIST_PATH).href;
  const sharedTypesModule = await import(moduleUrl);

  if (!Array.isArray(sharedTypesModule.PARITY_CATALOG)) {
    throw new Error(
      'PARITY_CATALOG export is missing or invalid in shared-types build output.'
    );
  }

  const packageJson = JSON.parse(
    await fs.readFile(SHARED_TYPES_PACKAGE_PATH, 'utf-8')
  );

  const entries = normalizeParityCatalog(sharedTypesModule.PARITY_CATALOG);
  const lock = {
    schemaVersion: 1,
    packageName: '@obsidian-workspace/shared-types',
    packageVersion: packageJson.version,
    entryCount: entries.length,
    catalogHash: hashEntries(entries),
    entries,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf-8');

  console.log(`Parity contract exported: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
