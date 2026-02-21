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

function formatYamlMultilineString(value: string): string {
  return `|\n${value.split('\n').map((line) => `  ${line}`).join('\n')}`;
}

function formatYamlString(value: string): string {
  return (value.includes('\n') && formatYamlMultilineString(value))
    || (YAML_SPECIAL_CHAR_PATTERN.test(value) && `"${value.replace(/"/g, '\\"')}"`)
    || value;
}

function formatYamlArray(value: unknown[]): string {
  return (!value.length && '[]') || `\n${value.map((item) => `  - ${formatYamlValue(item)}`).join('\n')}`;
}

function formatYamlObject(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  return (!entries.length && '{}') || `\n${entries.map(([k, v]) => `  ${k}: ${formatYamlValue(v)}`).join('\n')}`;
}

const YAML_VALUE_FORMATTERS: Record<YamlValueKind, (value: unknown) => string> = {
  nullish: () => 'null',
  boolean: (value) => String(value),
  number: (value) => String(value),
  string: (value) => formatYamlString(value as string),
  array: (value) => formatYamlArray(value as unknown[]),
  object: (value) => formatYamlObject(value as Record<string, unknown>),
  other: (value) => String(value),
};

/**
 * Convert a JavaScript value to a YAML-formatted string.
 *
 * Handles: null/undefined, boolean, number, string (with multiline/special chars),
 * arrays, and objects. Used by frontmatter patching to produce valid YAML output.
 */
export function formatYamlValue(value: unknown): string {
  const kind = detectYamlValueKind(value);
  return YAML_VALUE_FORMATTERS[kind](value);
}
