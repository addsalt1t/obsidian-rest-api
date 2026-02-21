/**
 * Markdown parsing service
 * Frontmatter and tag extraction utilities
 */

interface MarkdownMetadata {
  frontmatter: Record<string, unknown>;
  tags: string[];
}

/**
 * Directly parse frontmatter and tags from a markdown file.
 * Used as a fallback when cache is missing or incomplete.
 * @param content - Markdown file content
 * @returns Frontmatter and tags
 */
export function parseMarkdownMetadata(content: string): MarkdownMetadata {
  const result: MarkdownMetadata = {
    frontmatter: {},
    tags: [],
  };

  // Parse frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1];
    const lines = yamlContent.split('\n');

    let currentKey: string | null = null;
    let currentArray: string[] | null = null;

    for (const line of lines) {
      // List item (indented + - value)
      const listItemMatch = line.match(/^\s+-\s+(.*)$/);
      if (listItemMatch && currentKey && currentArray) {
        currentArray.push(listItemMatch[1].trim());
        continue;
      }

      // Complete previous list
      if (currentKey && currentArray) {
        result.frontmatter[currentKey] = currentArray;
        currentKey = null;
        currentArray = null;
      }

      // Parse key-value pair (supports hyphenated keys)
      const match = line.match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;

        // Empty value may be followed by a list on next lines
        if (value === '' || value === undefined) {
          currentKey = key;
          currentArray = [];
          continue;
        }

        // Simple YAML parsing (string, number, boolean)
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
          // Inline array
          try {
            result.frontmatter[key] = JSON.parse(value);
          } catch {
            // Parse YAML inline array [a, b, c] format
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

    // Complete last list
    if (currentKey && currentArray) {
      result.frontmatter[currentKey] = currentArray;
    }

    // Extract tags field from frontmatter
    if (Array.isArray(result.frontmatter.tags)) {
      result.tags.push(...result.frontmatter.tags.map((t) => `#${t}`));
    } else if (typeof result.frontmatter.tags === 'string') {
      result.tags.push(`#${result.frontmatter.tags}`);
    }
  }

  // Parse inline tags (#tag format) from body
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
