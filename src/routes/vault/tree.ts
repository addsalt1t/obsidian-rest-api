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
 * 폴더를 재귀적으로 트리 구조로 변환
 * @param folder - 변환할 폴더
 * @param currentDepth - 현재 깊이
 * @param maxDepth - 최대 깊이 제한
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
