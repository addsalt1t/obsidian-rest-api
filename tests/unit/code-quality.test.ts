/**
 * 코드 품질 테스트
 * - 라우트 핸들러 등록 확인
 * - 서비스 함수 사용 확인
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

/**
 * 파일에서 export된 함수 이름 추출
 */
function extractExportedFunctions(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const functions: string[] = [];

  // export function name 또는 export async function name
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match;

  while ((match = funcRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  return functions;
}

/**
 * 디렉토리의 모든 TypeScript 파일 수집
 */
function getAllTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

describe('Code Quality', () => {
  describe('라우트 핸들러 등록', () => {
    it('모든 라우터 팩토리 함수가 server.ts에 등록되어야 함', () => {
      const routesDir = path.join(SRC_DIR, 'routes');

      if (!fs.existsSync(routesDir)) {
        console.log('  routes 디렉토리 없음 - 테스트 건너뜀');
        return;
      }

      const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'));
      const serverPath = path.join(SRC_DIR, 'server.ts');
      const serverContent = fs.readFileSync(serverPath, 'utf-8');

      const unregisteredRouters: string[] = [];

      for (const file of routeFiles) {
        const filePath = path.join(routesDir, file);
        const exportedFunctions = extractExportedFunctions(filePath);

        // create*Router 패턴의 함수들 확인
        const routerFactories = exportedFunctions.filter((f) => f.match(/^create\w+Router$/));

        for (const factory of routerFactories) {
          // server.ts에서 import되고 사용되는지 확인
          const isImported = serverContent.includes(`import { ${factory}`) ||
                            serverContent.includes(`, ${factory}`) ||
                            serverContent.includes(`${factory} }`);
          const isUsed = serverContent.includes(`${factory}(`);

          if (!isImported || !isUsed) {
            unregisteredRouters.push(`${file}: ${factory}`);
          }
        }
      }

      if (unregisteredRouters.length > 0) {
        console.log('\n  server.ts에 등록되지 않은 라우터:');
        unregisteredRouters.forEach((r) => console.log(`    - ${r}`));
      }

      expect(
        unregisteredRouters,
        `라우터가 server.ts에 등록되지 않음: ${unregisteredRouters.join(', ')}`
      ).toHaveLength(0);
    });

    it('server.ts에서 import된 라우터는 실제로 사용되어야 함', () => {
      const serverPath = path.join(SRC_DIR, 'server.ts');
      const serverContent = fs.readFileSync(serverPath, 'utf-8');

      // import 문에서 라우터 팩토리 추출
      const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]\.\/routes\/[^'"]+['"]/g;
      const importedRouters: string[] = [];
      let match;

      while ((match = importRegex.exec(serverContent)) !== null) {
        const imports = match[1].split(',').map((s) => s.trim());
        importedRouters.push(...imports.filter((i) => i.match(/^create\w+Router$/)));
      }

      const unusedImports: string[] = [];

      for (const router of importedRouters) {
        // app.use() 호출에서 사용되는지 확인
        const usagePattern = new RegExp(`app\\.use\\([^)]*${router}\\(`);
        if (!usagePattern.test(serverContent)) {
          unusedImports.push(router);
        }
      }

      if (unusedImports.length > 0) {
        console.log('\n  import됐지만 사용되지 않은 라우터:');
        unusedImports.forEach((r) => console.log(`    - ${r}`));
      }

      expect(
        unusedImports,
        `import됐지만 사용되지 않은 라우터: ${unusedImports.join(', ')}`
      ).toHaveLength(0);
    });
  });

  describe('서비스 함수 사용', () => {
    it('services/ 디렉토리의 export된 함수가 실제로 사용되어야 함', () => {
      const servicesDir = path.join(SRC_DIR, 'services');

      if (!fs.existsSync(servicesDir)) {
        console.log('  services 디렉토리 없음 - 테스트 건너뜀');
        return;
      }

      const serviceFiles = getAllTsFiles(servicesDir);
      const allSrcFiles = getAllTsFiles(SRC_DIR);

      // 서비스 파일 제외한 소스 파일들의 내용
      const nonServiceFiles = allSrcFiles.filter(
        (f) => !f.includes('/services/')
      );
      const allNonServiceContent = nonServiceFiles
        .map((f) => fs.readFileSync(f, 'utf-8'))
        .join('\n');

      // 서비스 파일 전체 내용 (inter-service 사용 추적용)
      const allServiceContent = serviceFiles
        .map((f) => fs.readFileSync(f, 'utf-8'))
        .join('\n');

      const unusedFunctions: string[] = [];

      for (const serviceFile of serviceFiles) {
        // barrel(index.ts) 파일은 re-export만 하므로 제외
        if (serviceFile.endsWith('/index.ts')) continue;

        const exportedFunctions = extractExportedFunctions(serviceFile);
        const relativePath = path.relative(SRC_DIR, serviceFile);
        const ownContent = fs.readFileSync(serviceFile, 'utf-8');

        for (const func of exportedFunctions) {
          // 비서비스 파일에서 사용되는지 확인
          const isUsedOutside = allNonServiceContent.includes(func);
          // 다른 서비스 파일에서 사용되는지 확인 (자신 제외)
          const isUsedInOtherService = allServiceContent.includes(func)
            && (allServiceContent.indexOf(func) !== ownContent.indexOf(func)
              || allServiceContent.split(func).length > ownContent.split(func).length);

          if (!isUsedOutside && !isUsedInOtherService) {
            unusedFunctions.push(`${relativePath}: ${func}`);
          }
        }
      }

      if (unusedFunctions.length > 0) {
        console.log('\n  사용되지 않는 서비스 함수:');
        unusedFunctions.forEach((f) => console.log(`    - ${f}`));
      }

      expect(
        unusedFunctions,
        `사용되지 않는 서비스 함수: ${unusedFunctions.join(', ')}`
      ).toHaveLength(0);
    });

    it('filePatching.ts의 함수들이 실제로 사용되어야 함', () => {
      const filePatchingPath = path.join(SRC_DIR, 'services/filePatching.ts');

      if (!fs.existsSync(filePatchingPath)) {
        console.log('  services/filePatching.ts 없음 - 테스트 건너뜀');
        return;
      }

      const exportedFunctions = extractExportedFunctions(filePatchingPath);

      // 모든 소스 파일에서 사용 여부 확인
      const allSrcFiles = getAllTsFiles(SRC_DIR);
      const nonServiceFiles = allSrcFiles.filter((f) => !f.includes('/services/'));

      const allContent = nonServiceFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n');

      const unusedFunctions: string[] = [];

      for (const func of exportedFunctions) {
        // import 또는 직접 호출로 사용되는지 확인
        const isImported = allContent.includes(`import { ${func}`) ||
                          allContent.includes(`, ${func}`) ||
                          allContent.includes(`${func} }`);
        const isUsed = allContent.includes(`${func}(`);

        if (!isImported && !isUsed) {
          unusedFunctions.push(func);
        }
      }

      if (unusedFunctions.length > 0) {
        console.log('\n  filePatching.ts에서 사용되지 않는 함수:');
        unusedFunctions.forEach((f) => console.log(`    - ${f}`));
      }

      expect(
        unusedFunctions,
        `filePatching.ts의 사용되지 않는 함수: ${unusedFunctions.join(', ')}`
      ).toHaveLength(0);
    });
  });

  describe('라우트-서비스 연결', () => {
    it('라우트에서 사용하는 서비스 함수가 존재해야 함', () => {
      const routesDir = path.join(SRC_DIR, 'routes');
      const servicesDir = path.join(SRC_DIR, 'services');

      if (!fs.existsSync(routesDir) || !fs.existsSync(servicesDir)) {
        console.log('  routes 또는 services 디렉토리 없음 - 테스트 건너뜀');
        return;
      }

      const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'));
      const serviceFiles = getAllTsFiles(servicesDir);

      // 모든 서비스 함수 수집
      const allServiceFunctions = new Set<string>();
      for (const serviceFile of serviceFiles) {
        const functions = extractExportedFunctions(serviceFile);
        functions.forEach((f) => allServiceFunctions.add(f));
      }

      const missingServiceFunctions: string[] = [];

      for (const routeFile of routeFiles) {
        const routePath = path.join(routesDir, routeFile);
        const content = fs.readFileSync(routePath, 'utf-8');

        // import { func1, func2 } from '../services/...' 패턴 찾기
        const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/services\/[^'"]+['"]/g;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
          // 주석 제거 후 파싱 (multi-line import에 주석이 포함될 수 있음)
          const cleaned = match[1].replace(/\/\/[^\n]*/g, '');
          const imports = cleaned.split(',').map((s) => s.trim()).filter(Boolean);

          for (const imp of imports) {
            // as 구문 처리
            const funcName = imp.split(/\s+as\s+/)[0].trim();

            if (funcName && !allServiceFunctions.has(funcName)) {
              missingServiceFunctions.push(`${routeFile}: ${funcName}`);
            }
          }
        }
      }

      if (missingServiceFunctions.length > 0) {
        console.log('\n  존재하지 않는 서비스 함수 import:');
        missingServiceFunctions.forEach((f) => console.log(`    - ${f}`));
      }

      expect(
        missingServiceFunctions,
        `존재하지 않는 서비스 함수 import: ${missingServiceFunctions.join(', ')}`
      ).toHaveLength(0);
    });
  });
});
