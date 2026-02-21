/**
 * 파일 관련 헬퍼 함수
 * 경로 정규화, 파일 조회, 폴더 생성 등 공통 로직 통합
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { FILE_EXT } from '../constants';
import { validatePath } from './path-validation';

/**
 * 경로 정규화 + .md 확장자 추가
 * @param path - 원본 경로
 * @returns 정규화된 마크다운 파일 경로
 */
export function ensureMarkdownPath(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized.endsWith(FILE_EXT.MARKDOWN)) {
    return `${normalized}${FILE_EXT.MARKDOWN}`;
  }
  return normalized;
}

/**
 * 파일 가져오기 또는 null 반환
 * @param app - Obsidian App 인스턴스
 * @param path - 파일 경로
 * @returns TFile 또는 null
 */
export function getFileOrNull(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path);
  if (file && file instanceof TFile) {
    return file;
  }
  return null;
}

/**
 * 파일 가져오기 (확장자 자동 추가 + .md 없이도 시도)
 * @param app - Obsidian App 인스턴스
 * @param path - 파일 경로
 * @returns TFile 또는 null
 */
export function getFileWithFallback(app: App, path: string): { file: TFile | null; path: string } {
  const normalized = normalizePath(path);

  // 1. 정확한 경로 시도
  let file = getFileOrNull(app, normalized);
  if (file) {
    return { file, path: normalized };
  }

  // 2. .md 확장자 추가 시도
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
 * 부모 폴더 생성 (없으면)
 * @param app - Obsidian App 인스턴스
 * @param path - 파일 경로
 */
export async function ensureParentFolder(app: App, path: string): Promise<void> {
  const folder = path.substring(0, path.lastIndexOf('/'));
  if (folder && !app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }
}

/**
 * 폴더 가져오기 또는 null 반환
 * @param app - Obsidian App 인스턴스
 * @param path - 폴더 경로
 * @returns TFolder 또는 null
 */
export function getFolderOrNull(app: App, path: string): TFolder | null {
  const folder = app.vault.getAbstractFileByPath(path);
  if (folder && folder instanceof TFolder) {
    return folder;
  }
  return null;
}

/**
 * resolveSafeFilePath + 정규화된 경로도 함께 반환
 * 경로를 후속 로직에서 참조해야 할 때 사용
 * @param app - Obsidian App 인스턴스
 * @param requestPath - 클라이언트가 보낸 원본 경로
 * @returns { file, normalizedPath }
 * @throws PathValidationError 안전하지 않은 경로인 경우
 */
export function resolveSafeFilePathWithNormalized(
  app: App,
  requestPath: string,
): { file: TFile | null; normalizedPath: string } {
  validatePath(requestPath);
  const normalizedPath = ensureMarkdownPath(requestPath);
  return { file: getFileOrNull(app, normalizedPath), normalizedPath };
}
