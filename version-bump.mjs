import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = SCRIPT_DIR;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function fail(message) {
  throw new Error(`[version-bump] ${message}`);
}

function getFilePath(fileName) {
  return path.join(PLUGIN_ROOT, fileName);
}

function readJsonObject(fileName) {
  const filePath = getFilePath(fileName);
  let raw;

  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      fail(
        `Missing ${fileName} at ${filePath}. Run this script from the plugin root or create ${fileName}.`
      );
    }
    fail(`Failed to read ${fileName} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(
      `Invalid JSON in ${fileName}. Fix syntax errors and try again: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`Invalid ${fileName}: expected a JSON object at the root.`);
  }

  return parsed;
}

function getRequiredString(source, key, fileName) {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    fail(
      `Missing or invalid "${key}" in ${fileName}. Add a non-empty string value for "${key}" and rerun node version-bump.mjs.`
    );
  }
  return value;
}

function assertSemver(value, key, fileName) {
  if (!SEMVER_PATTERN.test(value)) {
    fail(
      `Invalid "${key}" in ${fileName}: "${value}". Use semver format (for example: 1.0.0) and rerun node version-bump.mjs.`
    );
  }
}

function writeJsonFile(fileName, value) {
  const filePath = getFilePath(fileName);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  try {
    fs.writeFileSync(tempPath, serialized, 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors; the original write error is more useful.
    }
    fail(
      `Failed to write ${fileName} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function writeRawFile(fileName, rawContent) {
  const filePath = getFilePath(fileName);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.rollback.tmp`;

  fs.writeFileSync(tempPath, rawContent, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function run() {
  const packageJson = readJsonObject('package.json');
  const manifestJson = readJsonObject('manifest.json');
  const versionsJson = readJsonObject('versions.json');

  const packageVersion = getRequiredString(packageJson, 'version', 'package.json');
  const minAppVersion = getRequiredString(manifestJson, 'minAppVersion', 'manifest.json');
  assertSemver(packageVersion, 'version', 'package.json');
  assertSemver(minAppVersion, 'minAppVersion', 'manifest.json');

  manifestJson.version = packageVersion;
  versionsJson[packageVersion] = minAppVersion;

  const previousManifestRaw = fs.readFileSync(getFilePath('manifest.json'), 'utf8');
  const previousVersionsRaw = fs.readFileSync(getFilePath('versions.json'), 'utf8');

  try {
    writeJsonFile('manifest.json', manifestJson);
    writeJsonFile('versions.json', versionsJson);
  } catch (error) {
    try {
      writeRawFile('manifest.json', previousManifestRaw);
      writeRawFile('versions.json', previousVersionsRaw);
    } catch {
      fail(
        'Failed to update version files and rollback also failed. Check manifest.json and versions.json manually.'
      );
    }
    throw error;
  }

  console.log(`[version-bump] manifest.json version set to ${packageVersion}`);
  console.log(
    `[version-bump] versions.json entry set: "${packageVersion}" -> "${minAppVersion}"`
  );
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
