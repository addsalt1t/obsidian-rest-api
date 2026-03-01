/**
 * 데드코드 탐지 테스트
 * - 미사용 exports 탐지
 * - 미사용 파일 탐지
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { scanDeadCode, type ExportOnlyRule } from '@obsidian-workspace/test-utils';

const SRC_DIR = path.resolve(__dirname, '../../src');
const TESTS_DIR = path.resolve(__dirname, '../../tests');

// Entry points - 이 파일들에서 시작해서 도달 가능한 파일만 유효
const ENTRY_POINTS = ['main.ts'];
const TYPE_DECLARATION_FILE_PATTERN = /\.d\.ts$/;

// 의도적으로 export만 하는 파일 (타입 정의, 서비스 모듈 등)
const EXPORT_ONLY_FILES: ExportOnlyRule[] = [
  { file: 'services/fileListCache.ts', reason: '파일 목록 캐시 서비스' },
  { file: 'services/filePatching.ts', reason: 'Re-exports heading-patching + shared types/utilities' },
  { file: 'services/heading-patching.ts', reason: 'Heading-based patching logic extracted from filePatching.ts' },
  { file: 'services/patch-constants.ts', reason: 'Shared patch types and utilities for filePatching and heading-patching' },
  { file: 'services/yaml-formatter.ts', reason: 'YAML formatting utilities extracted from filePatching.ts' },
  { file: 'services/tagCache.ts', reason: '이벤트 기반 태그 캐시 서비스' },
  { file: 'services/backlinkCache.ts', reason: '이벤트 기반 백링크 캐시 서비스' },
  { file: 'security/response-policy.ts', reason: 'ResponsePolicySettings and PolicySettingsProvider consumed via inline type imports' },
  { file: 'utils/request-parsers.ts', reason: 'PaginationParams 타입은 routes에서 type import' },
  { file: 'utils/response-builders.ts', reason: '내부 헬퍼(cleanFrontmatter 등)도 export' },
  { file: 'utils/metadata-ready.ts', reason: 'metadataCache 대기 유틸리티' },
  { file: 'services/autolink/types.ts', reason: 'autolink 서비스 내부 타입 정의' },
  { file: 'services/autolink/index.ts', reason: 'barrel 파일 — autolink 서비스 re-export' },
  { file: 'services/vector/types.ts', reason: 'vector 서비스 내부 타입 정의' },
  { file: 'services/vector/index.ts', reason: 'barrel 파일 — vector 서비스 re-export' },
  { file: 'utils/batch-helpers.ts', reason: 'PartitionedResults 타입은 외부 사용용으로 export' },
  { file: 'utils/patch-dispatcher.ts', reason: 'PatchParams/PatchDispatchResult 타입은 외부 사용용으로 export' },
  { file: 'services/dataviewQuery.ts', reason: 'DataviewQueryResult 타입은 외부 사용용으로 export' },
];

function runScan() {
  const result = scanDeadCode({
    srcDir: SRC_DIR,
    testsDir: TESTS_DIR,
    entryPoints: ENTRY_POINTS,
    exportOnlyFiles: EXPORT_ONLY_FILES,
  });

  // 정책: .d.ts 파일은 런타임 코드 경로가 아닌 타입 선언이므로 dead-code 대상에서 제외
  return {
    ...result,
    unusedFiles: result.unusedFiles.filter((file) => !TYPE_DECLARATION_FILE_PATTERN.test(file)),
    unusedExports: result.unusedExports.filter(
      ({ file }) => !TYPE_DECLARATION_FILE_PATTERN.test(file)
    ),
  };
}

describe('Dead Code Detection', () => {
  describe('allowlist 검증', () => {
    it('allowlist 항목은 file/reason 형식이어야 함', () => {
      const invalidEntries = EXPORT_ONLY_FILES.filter((entry) => {
        return entry.file.trim().length === 0 || entry.reason.trim().length === 0;
      });

      expect(invalidEntries, 'allowlist에 reason 누락/빈 문자열 항목이 있습니다').toHaveLength(0);
    });

    it('allowlist 항목은 실제 파일을 참조해야 함', () => {
      const result = runScan();
      expect(result.staleAllowlistEntries, '존재하지 않는 allowlist 항목이 있습니다').toHaveLength(0);
    });
  });

  describe('미사용 파일 탐지', () => {
    it('모든 파일은 entry point에서 도달 가능해야 함', () => {
      const result = runScan();

      if (result.unusedFiles.length > 0) {
        console.log('\n🔴 Entry point에서 도달 불가능한 파일:');
        result.unusedFiles.forEach((f) => console.log(`  - ${f}`));
      }

      expect(result.unusedFiles, `미사용 파일 발견: ${result.unusedFiles.join(', ')}`).toHaveLength(0);
    });
  });

  describe('미사용 exports 탐지', () => {
    it('export된 심볼은 다른 파일에서 import되어야 함', () => {
      const result = runScan();

      if (result.unusedExports.length > 0) {
        console.log('\n🔴 미사용 exports:');
        result.unusedExports.forEach(({ file, symbol }) => console.log(`  - ${file}: ${symbol}`));
      }

      expect(result.unusedExports, '미사용 exports 발견').toHaveLength(0);
    });
  });

  describe('순환 의존성 탐지', () => {
    it('순환 import가 없어야 함', () => {
      const result = runScan();

      if (result.circularDependencies.length > 0) {
        console.log('\n🔴 순환 의존성:');
        result.circularDependencies.forEach((cycle) => {
          console.log(`  - ${cycle.join(' -> ')} -> ${cycle[0]}`);
        });
      }

      expect(result.circularDependencies, '순환 의존성 발견').toHaveLength(0);
    });
  });
});
