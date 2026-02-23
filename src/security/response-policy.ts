import type { Request } from 'express';
import { Errors } from '../middleware/error';
import { parseStringParam } from '../utils/request-parsers';

export type NoteJsonField = 'content' | 'frontmatter' | 'tags' | 'links' | 'stat';
export type MetadataField = 'frontmatter' | 'tags' | 'links' | 'backlinks' | 'stat';
type SearchSimpleField = 'context' | 'offset';

interface ResponsePolicySettings {
  allowSensitiveFields: boolean;
  sensitiveFieldAllowlist: string;
  legacyFullResponseCompat: boolean;
}

const NOTE_JSON_FIELDS: readonly NoteJsonField[] = ['content', 'frontmatter', 'tags', 'links', 'stat'];
const METADATA_FIELDS: readonly MetadataField[] = ['frontmatter', 'tags', 'links', 'backlinks', 'stat'];
const SEARCH_SIMPLE_FIELDS: readonly SearchSimpleField[] = ['context', 'offset'];

const COMPAT_ALLOWLIST = Array.from(
  new Set<string>([
    ...NOTE_JSON_FIELDS,
    ...METADATA_FIELDS,
    ...SEARCH_SIMPLE_FIELDS,
  ]),
).join(',');

// 라우터 단위 테스트가 createServer를 거치지 않고 직접 라우터를 생성하는 경우를 위한 기본값.
// 실제 런타임 서버는 settings.ts의 기본값(보안 우선)을 사용한다.
export const DEFAULT_RESPONSE_POLICY_SETTINGS: ResponsePolicySettings = {
  allowSensitiveFields: true,
  sensitiveFieldAllowlist: COMPAT_ALLOWLIST,
  legacyFullResponseCompat: true,
};

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.split(',').map((v) => v.trim()).filter(Boolean)));
}

function parseAllowlist(raw: string): Set<string> {
  return new Set(parseCsv(raw));
}

function parseRequestedFields(req: Request): string[] {
  return parseCsv(parseStringParam(req.query.fields));
}

function resolveDomainFields<T extends string>(params: {
  req: Request;
  settings: ResponsePolicySettings;
  allowedFields: readonly T[];
  defaultFields: readonly T[];
  domainName: string;
}): Set<T> {
  const { req, settings, allowedFields, defaultFields, domainName } = params;

  if (settings.legacyFullResponseCompat) {
    return new Set(allowedFields);
  }

  const requested = parseRequestedFields(req);
  const allowedSet = new Set<string>(allowedFields);
  const unknownFields = requested.filter((field) => !allowedSet.has(field));
  if (unknownFields.length > 0) {
    throw Errors.badRequest(
      `Invalid fields for ${domainName}: ${unknownFields.join(', ')}`,
      { allowedFields },
    );
  }

  if (requested.length === 0) {
    return new Set(defaultFields);
  }

  if (!settings.allowSensitiveFields) {
    throw Errors.forbidden('Sensitive response fields are disabled by server policy', {
      requestedFields: requested,
    });
  }

  const allowlist = parseAllowlist(settings.sensitiveFieldAllowlist);
  const blockedFields = requested.filter((field) => !allowlist.has(field));
  if (blockedFields.length > 0) {
    throw Errors.forbidden('Requested sensitive fields are not allowed by server policy', {
      requestedFields: requested,
      blockedFields,
      allowlist: Array.from(allowlist),
    });
  }

  const selected = new Set<T>(defaultFields);
  for (const field of requested) {
    selected.add(field as T);
  }
  return selected;
}

export function resolveNoteJsonFields(
  req: Request,
  settings: ResponsePolicySettings,
): Set<NoteJsonField> {
  return resolveDomainFields<NoteJsonField>({
    req,
    settings,
    allowedFields: NOTE_JSON_FIELDS,
    defaultFields: [],
    domainName: 'note+json',
  });
}

export function resolveMetadataFields(
  req: Request,
  settings: ResponsePolicySettings,
): Set<MetadataField> {
  return resolveDomainFields<MetadataField>({
    req,
    settings,
    allowedFields: METADATA_FIELDS,
    defaultFields: [],
    domainName: 'metadata',
  });
}

export function resolveSearchSimpleFields(
  req: Request,
  settings: ResponsePolicySettings,
): Set<SearchSimpleField> {
  return resolveDomainFields<SearchSimpleField>({
    req,
    settings,
    allowedFields: SEARCH_SIMPLE_FIELDS,
    defaultFields: [],
    domainName: 'search.simple',
  });
}
