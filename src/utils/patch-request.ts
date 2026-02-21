import { parseStringParam } from './request-parsers';

interface ParsedPatchRequestParts {
  operation: string;
  targetType?: string;
  target?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function parsePatchRequestParts(reqLike: {
  query?: unknown;
  headers?: unknown;
}): ParsedPatchRequestParts {
  const query = asRecord(reqLike.query);
  const headers = asRecord(reqLike.headers);

  const operation = parseStringParam(headers.operation) || 'replace';
  const targetType = parseStringParam(headers['target-type']);
  const targetRaw = parseStringParam(query.target) || parseStringParam(headers.target);
  const target = targetRaw ? decodeURIComponent(targetRaw) : undefined;

  return {
    operation,
    targetType,
    target,
  };
}
