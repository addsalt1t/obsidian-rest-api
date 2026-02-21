/**
 * metadataCache 준비 대기 유틸리티
 * move/rename 후 Obsidian이 metadataCache를 재인덱싱할 때까지 대기
 */

import { App, TAbstractFile, TFile } from 'obsidian';

/** 기본 대기 타임아웃 (밀리초) */
const DEFAULT_TIMEOUT_MS = 2000;

/** waitForMetadataReady 옵션 */
export interface WaitForMetadataOptions {
  /** 대기 타임아웃 (밀리초, 기본 2000) */
  timeoutMs?: number;
  /**
   * true면 캐시가 이미 존재해도 다음 changed 이벤트까지 대기.
   * modify 후 stale 캐시를 갱신 대기할 때 사용.
   */
  forceWait?: boolean;
}

/** TAbstractFile이 TFile인지 확인 (duck typing — mock 환경 호환) */
function isTFile(file: TAbstractFile): file is TFile {
  return 'extension' in file;
}

/**
 * 지정된 경로의 metadataCache가 준비될 때까지 대기
 * - forceWait=false (기본): 캐시가 이미 존재하면 즉시 true 반환
 * - forceWait=true: 캐시 존재 여부와 무관하게 다음 changed 이벤트 대기
 * - 타임아웃 시 false 반환 (진행은 가능)
 */
export function waitForMetadataReady(
  app: App,
  path: string,
  options: WaitForMetadataOptions = {}
): Promise<boolean> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, forceWait = false } = options;

  // TFile 확인
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !isTFile(file)) {
    return Promise.resolve(false);
  }

  // forceWait가 아니고 캐시가 이미 존재하면 즉시 반환
  if (!forceWait) {
    const existing = app.metadataCache.getFileCache(file);
    if (existing) {
      return Promise.resolve(true);
    }
  }

  // 이벤트 대기
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
