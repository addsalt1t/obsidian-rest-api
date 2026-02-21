import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

type PluginManifest = {
  id: string;
  version: string;
  minAppVersion: string;
  description: string;
  isDesktopOnly: boolean;
};

type PackageJson = {
  version: string;
};

const PLUGIN_ROOT = path.resolve(__dirname, '../../..');
const PACKAGE_JSON_PATH = path.join(PLUGIN_ROOT, 'package.json');
const README_PATH = path.join(PLUGIN_ROOT, 'README.md');
const MANIFEST_PATH = path.join(PLUGIN_ROOT, 'manifest.json');
const VERSIONS_PATH = path.join(PLUGIN_ROOT, 'versions.json');
const LICENSE_PATH = path.join(PLUGIN_ROOT, 'LICENSE');

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function loadManifest(): PluginManifest {
  expect(
    fs.existsSync(MANIFEST_PATH),
    'manifest.json is required in the plugin root'
  ).toBe(true);
  return readJsonFile<PluginManifest>(MANIFEST_PATH);
}

function loadPackageJson(): PackageJson {
  expect(
    fs.existsSync(PACKAGE_JSON_PATH),
    'package.json is required in the plugin root'
  ).toBe(true);
  return readJsonFile<PackageJson>(PACKAGE_JSON_PATH);
}

describe('Community Submission Requirements', () => {
  it('includes required files in the plugin root', () => {
    const requiredFiles = ['README.md', 'manifest.json', 'versions.json', 'LICENSE'];
    const missingFiles = requiredFiles.filter(
      (fileName) => !fs.existsSync(path.join(PLUGIN_ROOT, fileName))
    );

    expect(
      missingFiles,
      `Missing required plugin root files: ${missingFiles.join(', ')}`
    ).toHaveLength(0);
  });

  describe('manifest.json constraints', () => {
    it('uses a kebab-case id that does not contain "obsidian"', () => {
      const manifest = loadManifest();
      const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

      expect(
        manifest.id,
        'manifest.id must be kebab-case (lowercase letters, numbers, hyphens)'
      ).toMatch(kebabCasePattern);
      expect(
        manifest.id,
        'manifest.id must not include the word "obsidian"'
      ).not.toMatch(/obsidian/i);
    });

    it('has description <= 250 chars and ending punctuation', () => {
      const manifest = loadManifest();
      const description = manifest.description.trim();

      expect(
        description.length,
        `manifest.description must be 250 characters or less (got ${description.length})`
      ).toBeLessThanOrEqual(250);
      expect(
        description,
        'manifest.description must end with punctuation'
      ).toMatch(/[.!?;:]$/);
    });

    it('sets isDesktopOnly to true', () => {
      const manifest = loadManifest();

      expect(manifest.isDesktopOnly, 'manifest.isDesktopOnly must be true').toBe(true);
    });
  });

  it('maps manifest.version to manifest.minAppVersion in versions.json', () => {
    const manifest = loadManifest();

    expect(
      fs.existsSync(VERSIONS_PATH),
      'versions.json is required in the plugin root'
    ).toBe(true);

    const versions = readJsonFile<Record<string, string>>(VERSIONS_PATH);
    expect(
      versions[manifest.version],
      `versions.json must map ${manifest.version} -> ${manifest.minAppVersion}`
    ).toBe(manifest.minAppVersion);
  });

  it('keeps package.json and manifest.json versions synchronized', () => {
    const pkg = loadPackageJson();
    const manifest = loadManifest();

    expect(
      manifest.version,
      'manifest.version must match package.json version'
    ).toBe(pkg.version);
  });

  it('documents localhost-only network usage in README', () => {
    expect(fs.existsSync(README_PATH), 'README.md is required in the plugin root').toBe(true);
    const readme = fs.readFileSync(README_PATH, 'utf-8');

    expect(
      readme,
      'README must disclose network usage by mentioning 127.0.0.1 or localhost'
    ).toMatch(/127\.0\.0\.1|localhost/i);
  });

  it('includes a LICENSE file in the plugin root', () => {
    expect(fs.existsSync(LICENSE_PATH), 'LICENSE is required in the plugin root').toBe(true);
  });
});
