/**
 * Shared patch types and utilities for filePatching and heading-patching
 */

import type { PatchOperation } from '@obsidian-workspace/shared-types';

export interface PatchResult {
  content: string;
  found: boolean;
}

export const OPERATION_BY_NAME: Record<string, PatchOperation> = {
  append: 'append',
  prepend: 'prepend',
  replace: 'replace',
  delete: 'delete',
};

export function normalizeOperation(operation: PatchOperation | string): PatchOperation {
  return OPERATION_BY_NAME[operation] ?? 'replace';
}
