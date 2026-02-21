import { describe, it, expect } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { buildFolderTree } from '../../../src/routes/vault/tree';

function createMockFile(path: string): TFile {
  return new TFile(path) as unknown as TFile;
}

function createMockFolder(path: string, children: (TFile | TFolder)[] = []): TFolder {
  return new TFolder(path, children) as unknown as TFolder;
}

describe('Vault Tree helper regression', () => {
  it('should keep recursive tree response shape stable at max depth', () => {
    const nestedFile = createMockFile('docs/guide.md');
    const nestedFolder = createMockFolder('docs', [nestedFile]);
    const rootFolder = createMockFolder('', [nestedFolder]);

    const tree = buildFolderTree(rootFolder, 1, 1);

    expect(tree).toEqual({
      path: '',
      name: rootFolder.name,
      files: [],
      folders: [
        {
          path: 'docs',
          name: 'docs',
          files: [],
          folders: [],
        },
      ],
    });
  });
});
