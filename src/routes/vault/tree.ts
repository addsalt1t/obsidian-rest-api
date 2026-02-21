import { TFile, TFolder } from 'obsidian';
import type { FileInfo, FolderInfo, FolderTree } from '@obsidian-workspace/shared-types';

function getFileInfo(file: TFile): FileInfo {
  return {
    path: file.path,
    name: file.basename,
    extension: file.extension,
    size: file.stat.size,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
  };
}

function getFolderInfo(folder: TFolder): FolderInfo {
  return {
    path: folder.path,
    name: folder.name,
    children: folder.children.map(child => child.path),
  };
}

export function listFolderChildren(folder: TFolder): { files: FileInfo[]; folders: FolderInfo[] } {
  const files: FileInfo[] = [];
  const folders: FolderInfo[] = [];

  for (const child of folder.children) {
    if (child instanceof TFile) {
      files.push(getFileInfo(child));
    } else if (child instanceof TFolder) {
      folders.push(getFolderInfo(child));
    }
  }

  return { files, folders };
}

/**
 * Recursively convert a folder into a tree structure
 * @param folder - The folder to convert
 * @param currentDepth - Current depth level
 * @param maxDepth - Maximum depth limit
 */
export function buildFolderTree(folder: TFolder, currentDepth: number, maxDepth: number): FolderTree {
  const files: FileInfo[] = [];
  const folders: FolderTree[] = [];

  for (const child of folder.children) {
    if (child instanceof TFile) {
      files.push(getFileInfo(child));
    } else if (child instanceof TFolder) {
      if (currentDepth < maxDepth) {
        folders.push(buildFolderTree(child, currentDepth + 1, maxDepth));
      } else {
        folders.push({
          path: child.path,
          name: child.name,
          files: [],
          folders: [],
        });
      }
    }
  }

  return {
    path: folder.path,
    name: folder.name,
    files,
    folders,
  };
}
