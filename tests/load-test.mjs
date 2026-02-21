/**
 * 플러그인 로드 테스트
 * - main.js가 정상적으로 파싱되는지 확인
 * - 필수 export가 있는지 확인
 * - 외부 모듈 의존성 확인
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJsPath = join(__dirname, '..', 'main.js');

console.log('=== 플러그인 로드 테스트 ===\n');

// 1. 파일 존재 확인
console.log('1. main.js 파일 확인...');
try {
  const stats = readFileSync(mainJsPath);
  console.log(`   ✓ main.js 존재 (${(stats.length / 1024).toFixed(1)} KB)\n`);
} catch (e) {
  console.error(`   ✗ main.js 없음: ${e.message}\n`);
  process.exit(1);
}

// 2. 문법 검사 (파싱 테스트)
console.log('2. JavaScript 문법 검사...');
try {
  const code = readFileSync(mainJsPath, 'utf-8');
  new Function(code);
  console.log('   ✓ 문법 오류 없음\n');
} catch (e) {
  console.error(`   ✗ 문법 오류: ${e.message}\n`);
  process.exit(1);
}

// 3. Obsidian 모듈 모킹 후 require 테스트
console.log('3. 모듈 로드 테스트...');

// Obsidian 모듈 모킹
const mockObsidian = {
  Plugin: class Plugin {
    app = {};
    manifest = {};
    loadData() { return Promise.resolve({}); }
    saveData() { return Promise.resolve(); }
    addSettingTab() {}
    addCommand() {}
  },
  PluginSettingTab: class PluginSettingTab {
    constructor() {}
  },
  Setting: class Setting {
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
    addToggle() { return this; }
    addButton() { return this; }
  },
  Notice: class Notice {
    constructor(msg) { console.log(`   [Notice] ${msg}`); }
  },
  App: class App {},
};

// require 훅 설정
const require = createRequire(import.meta.url);
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'obsidian') {
    return mockObsidian;
  }
  return originalRequire.apply(this, arguments);
};

try {
  const plugin = require(mainJsPath);

  // default export 확인
  if (plugin.default) {
    console.log('   ✓ default export 존재');

    // Plugin 클래스인지 확인
    if (typeof plugin.default === 'function') {
      console.log('   ✓ Plugin 클래스 확인');

      // 인스턴스 생성 테스트
      try {
        const instance = new plugin.default(mockObsidian.App, {});
        console.log('   ✓ 인스턴스 생성 가능');

        // 필수 메서드 확인
        if (typeof instance.onload === 'function') {
          console.log('   ✓ onload 메서드 존재');
        }
        if (typeof instance.onunload === 'function') {
          console.log('   ✓ onunload 메서드 존재');
        }
      } catch (e) {
        console.log(`   △ 인스턴스 생성 실패 (정상일 수 있음): ${e.message}`);
      }
    }
  } else {
    console.error('   ✗ default export 없음');
  }

  console.log('\n');
} catch (e) {
  console.error(`   ✗ 모듈 로드 실패: ${e.message}`);
  console.error(`   Stack: ${e.stack}\n`);
  process.exit(1);
}

// 4. 외부 의존성 검사
console.log('4. 번들 의존성 검사...');
const code = readFileSync(mainJsPath, 'utf-8');

const externalPatterns = [
  { name: 'express', pattern: /require\(['"](express)['"]\)/ },
  { name: 'cors', pattern: /require\(['"](cors)['"]\)/ },
  { name: 'node-forge', pattern: /require\(['"](node-forge)['"]\)/ },
  { name: 'http', pattern: /require\(['"](http)['"]\)/ },
  { name: 'https', pattern: /require\(['"](https)['"]\)/ },
  { name: 'zod', pattern: /require\(['"](zod)['"]\)/ },
];

let hasExternalDeps = false;
for (const { name, pattern } of externalPatterns) {
  if (pattern.test(code)) {
    console.log(`   ⚠ ${name}가 external로 설정됨 (번들에 미포함)`);
    hasExternalDeps = true;
  } else {
    console.log(`   ✓ ${name} 번들에 포함됨`);
  }
}

if (hasExternalDeps) {
  console.log('\n   경고: external 의존성은 Obsidian에서 로드 실패 원인이 될 수 있습니다.');
}

console.log('\n=== 테스트 완료 ===');
