/**
 * YAML value formatting utilities for frontmatter patching.
 *
 * Converts JavaScript values to YAML-compatible string representations.
 * Used by filePatching.ts when creating/updating frontmatter fields.
 */

export type YamlValueKind = 'nullish' | 'boolean' | 'number' | 'string' | 'array' | 'object' | 'other';
type JavaScriptType =
  | 'undefined'
  | 'object'
  | 'boolean'
  | 'number'
  | 'bigint'
  | 'string'
  | 'symbol'
  | 'function';

const YAML_SPECIAL_CHAR_PATTERN = /[:#[\]{}|>&*!?,]/;

const YAML_KIND_BY_TYPE: Partial<Record<JavaScriptType, YamlValueKind>> = {
  boolean: 'boolean',
  number: 'number',
  string: 'string',
  object: 'object',
};

export function detectYamlValueKind(value: unknown): YamlValueKind {
  return (value == null && 'nullish')
    || (Array.isArray(value) && 'array')
    || YAML_KIND_BY_TYPE[typeof value as JavaScriptType]
    || 'other';
}

/** Produce `depth` levels of 2-space indentation. */
function indent(depth: number): string {
  return '  '.repeat(depth);
}

function formatYamlMultilineString(value: string, depth: number): string {
  return `|\n${value.split('\n').map((line) => `${indent(depth)}${line}`).join('\n')}`;
}

function formatYamlString(value: string, depth: number): string {
  return (value.includes('\n') && formatYamlMultilineString(value, depth))
    || (YAML_SPECIAL_CHAR_PATTERN.test(value) && `"${value.replace(/"/g, '\\"')}"`)
    || value;
}

function formatYamlArray(value: unknown[], depth: number): string {
  if (!value.length) return '[]';
  return `\n${value.map((item) => {
    const formatted = formatYamlValueAtDepth(item, depth + 1);
    return `${indent(depth)}- ${formatted}`;
  }).join('\n')}`;
}

function formatYamlObject(value: Record<string, unknown>, depth: number): string {
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  return `\n${entries.map(([k, v]) => {
    const formatted = formatYamlValueAtDepth(v, depth + 1);
    return `${indent(depth)}${k}: ${formatted}`;
  }).join('\n')}`;
}

/**
 * Internal depth-aware dispatcher. Formats a value at the given nesting depth.
 */
function formatYamlValueAtDepth(value: unknown, depth: number): string {
  const kind = detectYamlValueKind(value);
  switch (kind) {
    case 'nullish': return 'null';
    case 'boolean': return String(value);
    case 'number': return String(value);
    case 'string': return formatYamlString(value as string, depth);
    case 'array': return formatYamlArray(value as unknown[], depth);
    case 'object': return formatYamlObject(value as Record<string, unknown>, depth);
    default: return String(value);
  }
}

/**
 * Convert a JavaScript value to a YAML-formatted string.
 *
 * Handles: null/undefined, boolean, number, string (with multiline/special chars),
 * arrays, and objects. Used by frontmatter patching to produce valid YAML output.
 *
 * Depth starts at 1 because YAML frontmatter values sit one indentation level
 * from the key (e.g. `key:\n  - item`).
 */
export function formatYamlValue(value: unknown): string {
  return formatYamlValueAtDepth(value, 1);
}
