/**
 * 미링크 엔티티 감지 (scan) 및 자동 wikilink 변환 (linkify)
 *
 * entitySourcePaths에 지정된 폴더에서 frontmatter `name` 필드가 있는 마크다운 파일을
 * 엔티티로 인식하고, targetPaths 범위의 파일에서 미링크 멘션을 감지/변환합니다.
 */
import { App, TFile } from 'obsidian';
import type {
  AutolinkLinkifyChange,
  AutolinkLinkifyResponse,
  AutolinkScanMatch,
  AutolinkScanResponse,
} from '@obsidian-workspace/shared-types';
import { getFileListCache } from '../fileListCache';
import { validatePath } from '../../utils/path-validation';
import { waitForMetadataReady } from '../../utils/metadata-ready';
import { mapWithConcurrency } from '../../utils/concurrency';
import { filterFilesByScopes } from '../../utils/path-scope';
import { extractEntitiesFromPaths } from './entity-extractor';
import { buildEntityPattern, prepareEntityMatching } from './matcher';
import { runLinkifyEngine, runScanEngine } from './scan-engine';

/** Autolink 파일 병렬 처리 동시성 제한 */
const AUTOLINK_CONCURRENCY = 10;

export { buildEntityPattern, extractEntitiesFromPaths };

/** 경로 배열 유효성 검사 */
function validatePaths(entitySourcePaths: string[], targetPaths?: string[]): void {
  for (const path of entitySourcePaths) {
    validatePath(path);
  }

  if (targetPaths && Array.isArray(targetPaths)) {
    for (const path of targetPaths) {
      if (typeof path === 'string') {
        validatePath(path);
      }
    }
  }
}

/** targetPaths 필터링된 대상 파일 목록 반환 */
function resolveTargetFiles(app: App, targetPaths?: string[]): TFile[] {
  const fileCache = getFileListCache(app);
  const files = fileCache.getMarkdownFiles();
  return filterFilesByScopes(files, targetPaths);
}

/**
 * 미링크 엔티티 감지
 *
 * entitySourcePaths에서 엔티티를 추출하고, targetPaths 범위의 파일에서
 * 링크되지 않은 엔티티 멘션을 찾습니다.
 * targetPaths가 없으면 볼트 전체 마크다운 파일을 스캔합니다.
 */
export async function scan(
  app: App,
  options: { entitySourcePaths: string[]; targetPaths?: string[] }
): Promise<AutolinkScanResponse> {
  const { entitySourcePaths, targetPaths } = options;

  validatePaths(entitySourcePaths, targetPaths);

  const prepared = prepareEntityMatching(app, entitySourcePaths);
  if (!prepared) {
    return { matches: [], totalFiles: 0, totalMatches: 0, byEntity: {} };
  }

  const targetFiles = resolveTargetFiles(app, targetPaths);
  const matches: AutolinkScanMatch[] = [];
  const byEntity: Record<string, number> = {};

  const fileResults = await mapWithConcurrency(
    targetFiles,
    async (file) => {
      const content = await app.vault.cachedRead(file);
      const lines = content.split('\n');
      return runScanEngine({
        filePath: file.path,
        lines,
        sortedNames: prepared.sortedNames,
        patternMap: prepared.patternMap,
      });
    },
    AUTOLINK_CONCURRENCY
  );

  for (const { fileMatches, fileByEntity } of fileResults) {
    matches.push(...fileMatches);
    for (const [name, count] of Object.entries(fileByEntity)) {
      byEntity[name] = (byEntity[name] || 0) + count;
    }
  }

  return {
    matches,
    totalFiles: targetFiles.length,
    totalMatches: matches.length,
    byEntity,
  };
}

/**
 * 링크 변환 실행
 *
 * entitySourcePaths에서 엔티티를 추출하고, targetPaths 범위의 파일에서
 * 미링크 멘션을 [[wikilink]]로 변환합니다.
 * targetPaths가 없으면 볼트 전체 마크다운 파일을 대상으로 합니다.
 */
export async function linkify(
  app: App,
  options: {
    entitySourcePaths: string[];
    targetPaths?: string[];
    dryRun?: boolean;
    autoConfirm?: boolean;
  }
): Promise<AutolinkLinkifyResponse> {
  const {
    entitySourcePaths,
    targetPaths,
    dryRun = false,
    autoConfirm = false,
  } = options;

  validatePaths(entitySourcePaths, targetPaths);

  const prepared = prepareEntityMatching(app, entitySourcePaths);
  if (!prepared) {
    return { changes: [], filesModified: 0, totalChanges: 0, skipped: 0 };
  }

  const targetFiles = resolveTargetFiles(app, targetPaths);
  const changes: AutolinkLinkifyChange[] = [];
  const modifiedFiles = new Set<string>();
  let skipped = 0;

  const fileResults = await mapWithConcurrency(
    targetFiles,
    async (file) => {
      const content = await app.vault.cachedRead(file);
      const lines = content.split('\n');

      const engineResult = runLinkifyEngine({
        filePath: file.path,
        lines,
        sortedNames: prepared.sortedNames,
        patternMap: prepared.patternMap,
        dryRun,
        autoConfirm,
      });

      if (engineResult.fileModified && !dryRun) {
        const newContent = engineResult.updatedLines.join('\n');
        await app.vault.modify(file, newContent);
        await waitForMetadataReady(app, file.path, { forceWait: true });
      }

      return {
        filePath: file.path,
        fileChanges: engineResult.fileChanges,
        fileModified: engineResult.fileModified,
        fileSkipped: engineResult.fileSkipped,
      };
    },
    AUTOLINK_CONCURRENCY
  );

  for (const { fileChanges, fileModified, fileSkipped, filePath } of fileResults) {
    changes.push(...fileChanges);
    skipped += fileSkipped;
    if (fileModified && !dryRun) {
      modifiedFiles.add(filePath);
    }
  }

  return {
    changes,
    filesModified: modifiedFiles.size,
    totalChanges: changes.filter(change => change.applied).length,
    skipped,
  };
}
