import { describe, it, expect } from 'vitest';
import {
  patchFrontmatterKey,
  resolveHeadingPath,
  patchByHeading,
  patchByLine,
  patchByBlock,
} from '../../src/services/filePatching';

describe('patchFrontmatterKey', () => {
  const baseContent = `---
title: Test
---

Content`;

  describe('Express 파싱된 값 처리 (JSON 파싱 실패 케이스)', () => {
    it('문자열 값을 올바르게 처리', () => {
      // Express가 JSON.parse('"completed"') → "completed"로 변환 후 전달
      const result = patchFrontmatterKey(baseContent, 'status', 'completed');
      expect(result).toContain('status: completed');
    });

    it('숫자 문자열을 올바르게 처리', () => {
      // Express가 JSON.parse('42') → 42로 변환 후 문자열 '42'로 전달
      const result = patchFrontmatterKey(baseContent, 'count', '42');
      expect(result).toContain('count: 42');
    });

    it('불리언 문자열을 올바르게 처리', () => {
      // Express가 JSON.parse('true') → true로 변환 후 문자열 'true'로 전달
      const result = patchFrontmatterKey(baseContent, 'done', 'true');
      expect(result).toContain('done: true');
    });

    it('false 불리언 문자열 처리', () => {
      const result = patchFrontmatterKey(baseContent, 'active', 'false');
      expect(result).toContain('active: false');
    });
  });

  describe('JSON 문자열 값 처리', () => {
    it('JSON 배열 문자열을 YAML 리스트로 변환', () => {
      const result = patchFrontmatterKey(baseContent, 'tags', '["work","important"]');
      expect(result).toContain('tags:');
      expect(result).toContain('  - work');
      expect(result).toContain('  - important');
    });

    it('JSON 객체 문자열을 YAML 객체로 변환', () => {
      const result = patchFrontmatterKey(baseContent, 'meta', '{"key":"value"}');
      expect(result).toContain('meta:');
      expect(result).toContain('  key: value');
    });

    it('중첩된 JSON 객체 처리', () => {
      const result = patchFrontmatterKey(baseContent, 'config', '{"nested":{"inner":"value"}}');
      expect(result).toContain('config:');
      expect(result).toContain('  nested:');
    });

    it('빈 배열 처리', () => {
      const result = patchFrontmatterKey(baseContent, 'items', '[]');
      expect(result).toContain('items: []');
    });

    it('빈 객체 처리', () => {
      const result = patchFrontmatterKey(baseContent, 'data', '{}');
      expect(result).toContain('data: {}');
    });

    it('숫자 JSON 처리', () => {
      const result = patchFrontmatterKey(baseContent, 'count', '123');
      expect(result).toContain('count: 123');
    });

    it('불리언 JSON 처리', () => {
      const result = patchFrontmatterKey(baseContent, 'flag', 'true');
      expect(result).toContain('flag: true');
    });

    it('null JSON 처리', () => {
      const result = patchFrontmatterKey(baseContent, 'empty', 'null');
      expect(result).toContain('empty: null');
    });
  });

  describe('특수 문자 처리', () => {
    it('콜론 포함 문자열을 따옴표로 감싸기', () => {
      const result = patchFrontmatterKey(baseContent, 'url', 'https://example.com');
      expect(result).toContain('url: "https://example.com"');
    });

    it('해시 포함 문자열을 따옴표로 감싸기', () => {
      const result = patchFrontmatterKey(baseContent, 'color', '#ff0000');
      expect(result).toContain('color: "#ff0000"');
    });

    it('대괄호 포함 문자열을 따옴표로 감싸기', () => {
      const result = patchFrontmatterKey(baseContent, 'pattern', '[test]');
      expect(result).toContain('pattern: "[test]"');
    });
  });

  describe('프론트매터 없는 파일 처리', () => {
    it('프론트매터가 없으면 생성', () => {
      const noFrontmatter = 'Just content without frontmatter';
      const result = patchFrontmatterKey(noFrontmatter, 'title', 'New Title');
      expect(result).toMatch(/^---\ntitle: New Title\n---/);
      expect(result).toContain('Just content without frontmatter');
    });
  });

  describe('기존 키 업데이트', () => {
    it('기존 키 값 업데이트', () => {
      const result = patchFrontmatterKey(baseContent, 'title', 'Updated Title');
      expect(result).toContain('title: Updated Title');
      expect(result).not.toContain('title: Test');
    });

    it('새로운 키 추가', () => {
      const result = patchFrontmatterKey(baseContent, 'author', 'John');
      expect(result).toContain('title: Test');
      expect(result).toContain('author: John');
    });

    it('멀티라인 키 업데이트 시 기존 블록 잔여 라인을 제거', () => {
      const multilineContent = `---
title: Test
description: |
  old line 1
  old line 2
status: draft
---

Content`;
      const result = patchFrontmatterKey(multilineContent, 'description', JSON.stringify('new value'));

      expect(result).toContain('description: new value');
      expect(result).not.toContain('old line 1');
      expect(result).not.toContain('old line 2');
      expect(result).toContain('status: draft');
    });

    it('중첩 키와 동일한 이름의 최상위 키가 있으면 최상위 키만 업데이트', () => {
      const nestedKeyContent = `---
meta:
  status: nested
status: top
---

Body`;
      const result = patchFrontmatterKey(nestedKeyContent, 'status', JSON.stringify('done'));

      expect(result).toContain('meta:');
      expect(result).toContain('  status: nested');
      expect(result).toContain('status: done');
      expect(result).not.toContain('status: top');
    });
  });

  describe('CRLF 호환', () => {
    it('CRLF 파일에서 기존 프론트매터를 중복 생성하지 않고 업데이트', () => {
      const crlfContent = '---\r\ntitle: Test\r\ndescription: old\r\n---\r\n\r\nBody';
      const result = patchFrontmatterKey(crlfContent, 'description', JSON.stringify('updated'));

      expect(result).toContain('\r\ndescription: updated\r\n');
      expect((result.match(/^---\r?$/gm) ?? [])).toHaveLength(2);
      expect(result.startsWith('---\r\n')).toBe(true);
    });
  });
});

describe('resolveHeadingPath', () => {
  const sampleContent = `# Main Title

## Section A

Content A

### Subsection A1

Content A1

### Subsection A2

Content A2

## Section B

Content B

### Subsection B1

Content B1

## Section A

Duplicate section name
`;

  it('단일 헤딩 찾기', () => {
    const result = resolveHeadingPath(sampleContent, 'Section B');
    expect(result.ambiguous).toBe(false);
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].fullPath).toBe('Main Title::Section B');
    expect(result.headings[0].level).toBe(2);
  });

  it('중복 헤딩 감지', () => {
    const result = resolveHeadingPath(sampleContent, 'Section A');
    expect(result.ambiguous).toBe(true);
    expect(result.headings).toHaveLength(2);
    expect(result.headings[0].fullPath).toBe('Main Title::Section A');
    expect(result.headings[1].fullPath).toBe('Main Title::Section A');
  });

  it('중첩된 헤딩 경로 추적', () => {
    const result = resolveHeadingPath(sampleContent, 'Subsection A1');
    expect(result.ambiguous).toBe(false);
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].fullPath).toBe('Main Title::Section A::Subsection A1');
    expect(result.headings[0].level).toBe(3);
  });

  it('존재하지 않는 헤딩', () => {
    const result = resolveHeadingPath(sampleContent, 'Nonexistent');
    expect(result.headings).toHaveLength(0);
    expect(result.error).toContain('not found');
  });

  it('최상위 헤딩 찾기', () => {
    const result = resolveHeadingPath(sampleContent, 'Main Title');
    expect(result.ambiguous).toBe(false);
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].fullPath).toBe('Main Title');
    expect(result.headings[0].level).toBe(1);
  });

  it('빈 내용 처리', () => {
    const result = resolveHeadingPath('', 'Heading');
    expect(result.headings).toHaveLength(0);
    expect(result.error).toContain('not found');
  });
});

describe('patchByHeading', () => {
  const sampleContent = `# Main Title

## Section A

Content A

### Subsection A1

Content A1

## Section B

Content B`;

  describe('경로 기반 매칭', () => {
    it('replace 작업으로 섹션 내용 교체', () => {
      const result = patchByHeading(sampleContent, 'Section A', 'replace', 'New Content');
      expect(result.found).toBe(true);
      // replace는 헤딩 라인 다음에 newContent를 넣음
      expect(result.content).toContain('## Section A\nNew Content\n## Section B');
    });

    it('append 작업으로 섹션 끝에 내용 추가', () => {
      const result = patchByHeading(sampleContent, 'Section B', 'append', 'Appended');
      expect(result.found).toBe(true);
      // Section B는 마지막 섹션이므로 Content B 다음에 Appended 추가
      expect(result.content).toContain('Content B\nAppended');
    });

    it('prepend 작업으로 섹션 시작에 내용 추가', () => {
      const result = patchByHeading(sampleContent, 'Section B', 'prepend', 'Prepended');
      expect(result.found).toBe(true);
      // prepend는 헤딩 바로 다음에 추가
      expect(result.content).toContain('## Section B\nPrepended');
    });

    it('delete 작업으로 섹션 삭제', () => {
      const result = patchByHeading(sampleContent, 'Subsection A1', 'delete', '');
      expect(result.found).toBe(true);
      expect(result.content).not.toContain('### Subsection A1');
      expect(result.content).not.toContain('Content A1');
    });
  });

  describe('단순 이름 매칭 폴백 (경로 미일치)', () => {
    // 이 테스트들은 lines 155-157 커버 - 경로 매칭 실패 시 단순 이름으로 폴백
    it('경로 없이 단순 헤딩 이름으로 매칭', () => {
      const result = patchByHeading(sampleContent, 'Section B', 'replace', 'Replaced');
      expect(result.found).toBe(true);
      expect(result.content).toContain('## Section B\nReplaced');
    });

    it('존재하지 않는 경로로 폴백 매칭', () => {
      // Invalid::Section B 경로는 없지만 Section B는 있음
      const result = patchByHeading(sampleContent, 'Invalid::Section B', 'replace', 'Fallback');
      expect(result.found).toBe(true);
      expect(result.content).toContain('## Section B\nFallback');
    });

    it('폴백 매칭에서 다음 헤딩까지 범위 제한 (lines 151-152)', () => {
      // 이 테스트는 폴백 로직에서 다음 동일/상위 레벨 헤딩을 찾아 범위를 제한하는 경우 커버
      const contentWithMultipleSections = `# Title

## First Section

First content

## Second Section

Second content

## Third Section

Third content`;
      // Invalid::Second Section 경로는 없지만 Second Section은 있음
      // 폴백 로직에서 Third Section을 만나 범위가 제한됨
      const result = patchByHeading(contentWithMultipleSections, 'Wrong::Second Section', 'replace', 'Replaced');
      expect(result.found).toBe(true);
      expect(result.content).toContain('## Second Section\nReplaced\n## Third Section');
      expect(result.content).toContain('Third content');
    });

    it('헤딩이 아예 없는 경우 found: false 반환', () => {
      const result = patchByHeading(sampleContent, 'Nonexistent', 'replace', 'Test');
      expect(result.found).toBe(false);
      expect(result.content).toBe(sampleContent);
    });
  });

  describe('하위 헤딩 범위 처리', () => {
    it('하위 헤딩까지 포함하여 섹션 종료', () => {
      const content = `# Title

## Section

Content

### Subsection

Sub content

## Next Section

Next content`;
      const result = patchByHeading(content, 'Section', 'replace', 'Replaced');
      expect(result.found).toBe(true);
      // 다음 동일/상위 레벨 헤딩 전까지 교체
      expect(result.content).toContain('## Section\nReplaced\n## Next Section');
    });
  });

  describe('default 케이스 처리', () => {
    it('unknown 작업은 replace로 처리', () => {
      const result = patchByHeading(sampleContent, 'Section B', 'unknown' as any, 'Default replaced');
      expect(result.found).toBe(true);
      expect(result.content).toContain('## Section B\nDefault replaced');
    });
  });
});

describe('patchByLine', () => {
  const sampleContent = `Line 1
Line 2
Line 3
Line 4
Line 5`;

  describe('기본 작업', () => {
    it('replace 작업으로 라인 교체', () => {
      const result = patchByLine(sampleContent, 3, 'replace', 'New Line 3');
      expect(result.found).toBe(true);
      expect(result.content).toBe(`Line 1
Line 2
New Line 3
Line 4
Line 5`);
    });

    it('append 작업으로 라인 뒤에 추가', () => {
      const result = patchByLine(sampleContent, 2, 'append', 'Inserted');
      expect(result.found).toBe(true);
      expect(result.content).toBe(`Line 1
Line 2
Inserted
Line 3
Line 4
Line 5`);
    });

    it('prepend 작업으로 라인 앞에 추가', () => {
      const result = patchByLine(sampleContent, 3, 'prepend', 'Before Line 3');
      expect(result.found).toBe(true);
      expect(result.content).toBe(`Line 1
Line 2
Before Line 3
Line 3
Line 4
Line 5`);
    });

    it('delete 작업으로 라인 삭제', () => {
      const result = patchByLine(sampleContent, 3, 'delete', '');
      expect(result.found).toBe(true);
      expect(result.content).toBe(`Line 1
Line 2
Line 4
Line 5`);
    });
  });

  describe('default 케이스', () => {
    it('unknown 작업은 replace로 처리', () => {
      const result = patchByLine(sampleContent, 2, 'unknown' as any, 'Replaced');
      expect(result.found).toBe(true);
      expect(result.content).toBe(`Line 1
Replaced
Line 3
Line 4
Line 5`);
    });
  });

  describe('경계 케이스', () => {
    it('유효하지 않은 라인 번호 (0)', () => {
      const result = patchByLine(sampleContent, 0, 'replace', 'Test');
      expect(result.found).toBe(false);
    });

    it('유효하지 않은 라인 번호 (범위 초과)', () => {
      const result = patchByLine(sampleContent, 100, 'replace', 'Test');
      expect(result.found).toBe(false);
    });

    it('첫 번째 라인 처리', () => {
      const result = patchByLine(sampleContent, 1, 'replace', 'First');
      expect(result.found).toBe(true);
      expect(result.content).toContain('First\nLine 2');
    });

    it('마지막 라인 처리', () => {
      const result = patchByLine(sampleContent, 5, 'replace', 'Last');
      expect(result.found).toBe(true);
      expect(result.content).toContain('Line 4\nLast');
    });
  });
});

describe('patchByBlock', () => {
  const sampleContent = `Some text

This is a block with id ^block1

More content ^block2

Final paragraph`;

  describe('블록 찾기', () => {
    it('블록 ID로 블록 찾기', () => {
      const result = patchByBlock(sampleContent, 'block1', 'replace', 'New block content');
      expect(result.found).toBe(true);
      expect(result.content).toContain('New block content ^block1');
    });

    it('존재하지 않는 블록 ID', () => {
      const result = patchByBlock(sampleContent, 'nonexistent', 'replace', 'Test');
      expect(result.found).toBe(false);
      expect(result.content).toBe(sampleContent);
    });
  });

  describe('모든 작업 타입', () => {
    it('append 작업으로 블록 뒤에 추가', () => {
      const result = patchByBlock(sampleContent, 'block1', 'append', 'Appended line');
      expect(result.found).toBe(true);
      expect(result.content).toContain('This is a block with id ^block1\nAppended line');
    });

    it('prepend 작업으로 블록 앞에 추가', () => {
      const result = patchByBlock(sampleContent, 'block1', 'prepend', 'Prepended line');
      expect(result.found).toBe(true);
      expect(result.content).toContain('Prepended line\nThis is a block with id ^block1');
    });

    it('delete 작업으로 블록 삭제', () => {
      const result = patchByBlock(sampleContent, 'block1', 'delete', '');
      expect(result.found).toBe(true);
      expect(result.content).not.toContain('^block1');
      expect(result.content).not.toContain('This is a block with id');
    });

    it('replace 작업으로 블록 내용 교체 (ID 유지)', () => {
      const result = patchByBlock(sampleContent, 'block2', 'replace', 'Replaced content');
      expect(result.found).toBe(true);
      expect(result.content).toContain('Replaced content ^block2');
      expect(result.content).not.toContain('More content');
    });
  });

  describe('default 케이스', () => {
    it('unknown 작업은 replace로 처리', () => {
      const result = patchByBlock(sampleContent, 'block1', 'unknown' as any, 'Default');
      expect(result.found).toBe(true);
      expect(result.content).toContain('Default ^block1');
    });
  });

  describe('특수 문자 처리', () => {
    it('정규식 특수문자가 포함된 블록 ID', () => {
      const contentWithSpecial = 'Content ^block.with.dots';
      const result = patchByBlock(contentWithSpecial, 'block.with.dots', 'replace', 'Test');
      expect(result.found).toBe(true);
    });
  });
});

describe('patchFrontmatterKey - 추가 케이스', () => {
  const baseContent = `---
title: Test
---

Content`;

  describe('개행이 포함된 문자열 (formatYamlValue 라인 334)', () => {
    it('멀티라인 문자열을 YAML literal block 스타일로 변환', () => {
      const multilineValue = JSON.stringify('First line\nSecond line\nThird line');
      const result = patchFrontmatterKey(baseContent, 'description', multilineValue);
      expect(result).toContain('description: |');
      expect(result).toContain('  First line');
      expect(result).toContain('  Second line');
      expect(result).toContain('  Third line');
    });

    it('단일 개행 문자열', () => {
      const value = JSON.stringify('Line 1\nLine 2');
      const result = patchFrontmatterKey(baseContent, 'note', value);
      expect(result).toContain('note: |');
      expect(result).toContain('  Line 1');
      expect(result).toContain('  Line 2');
    });
  });

  describe('undefined 값 처리 (formatYamlValue 라인 351)', () => {
    it('undefined 값을 null로 변환', () => {
      // JSON.parse로 undefined가 될 수 없으므로
      // JSON 문자열 "null"을 사용
      const result = patchFrontmatterKey(baseContent, 'empty', 'null');
      expect(result).toContain('empty: null');
    });
  });

  describe('중첩 배열 처리', () => {
    it('배열 내 객체 처리', () => {
      const value = JSON.stringify([{ name: 'test' }, { name: 'test2' }]);
      const result = patchFrontmatterKey(baseContent, 'items', value);
      expect(result).toContain('items:');
    });
  });
});
