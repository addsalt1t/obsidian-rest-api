/**
 * 마크다운 파싱 서비스
 * 프론트매터 및 태그 추출 유틸리티
 */

interface MarkdownMetadata {
  frontmatter: Record<string, unknown>;
  tags: string[];
}

/**
 * 마크다운 파일에서 프론트매터와 태그를 직접 파싱
 * 캐시가 없거나 불완전할 때 폴백으로 사용
 * @param content - 마크다운 파일 내용
 * @returns 프론트매터와 태그
 */
export function parseMarkdownMetadata(content: string): MarkdownMetadata {
  const result: MarkdownMetadata = {
    frontmatter: {},
    tags: [],
  };

  // 프론트매터 파싱
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1];
    const lines = yamlContent.split('\n');

    let currentKey: string | null = null;
    let currentArray: string[] | null = null;

    for (const line of lines) {
      // 리스트 아이템 (들여쓰기 + - 값)
      const listItemMatch = line.match(/^\s+-\s+(.*)$/);
      if (listItemMatch && currentKey && currentArray) {
        currentArray.push(listItemMatch[1].trim());
        continue;
      }

      // 이전 리스트 완료
      if (currentKey && currentArray) {
        result.frontmatter[currentKey] = currentArray;
        currentKey = null;
        currentArray = null;
      }

      // 키-값 쌍 파싱 (하이픈, 한글 키 지원)
      const match = line.match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;

        // 값이 비어있으면 다음 줄에 리스트가 올 수 있음
        if (value === '' || value === undefined) {
          currentKey = key;
          currentArray = [];
          continue;
        }

        // 간단한 YAML 파싱 (문자열, 숫자, 불리언)
        if (value === 'true') {
          result.frontmatter[key] = true;
        } else if (value === 'false') {
          result.frontmatter[key] = false;
        } else if (value === 'null') {
          result.frontmatter[key] = null;
        } else if (!isNaN(Number(value)) && value !== '') {
          result.frontmatter[key] = Number(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
          result.frontmatter[key] = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          result.frontmatter[key] = value.slice(1, -1);
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // 인라인 배열
          try {
            result.frontmatter[key] = JSON.parse(value);
          } catch {
            // YAML 인라인 배열 [a, b, c] 형태 파싱
            const items = value
              .slice(1, -1)
              .split(',')
              .map((s) => s.trim());
            result.frontmatter[key] = items;
          }
        } else {
          result.frontmatter[key] = value;
        }
      }
    }

    // 마지막 리스트 완료
    if (currentKey && currentArray) {
      result.frontmatter[currentKey] = currentArray;
    }

    // 프론트매터의 tags 필드 추출
    if (Array.isArray(result.frontmatter.tags)) {
      result.tags.push(...result.frontmatter.tags.map((t) => `#${t}`));
    } else if (typeof result.frontmatter.tags === 'string') {
      result.tags.push(`#${result.frontmatter.tags}`);
    }
  }

  // 본문의 인라인 태그 파싱 (#tag 형태)
  const tagMatches = content.match(
    /(?:^|\s)#([a-zA-Z\u00C0-\u024F\u1100-\u11FF\uAC00-\uD7AF][\w\u00C0-\u024F\u1100-\u11FF\uAC00-\uD7AF/-]*)/g
  );
  if (tagMatches) {
    for (const match of tagMatches) {
      const tag = match.trim();
      if (!result.tags.includes(tag)) {
        result.tags.push(tag);
      }
    }
  }

  return result;
}

