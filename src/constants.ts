/**
 * Extended REST API 상수 정의
 * 하드코딩된 값들을 중앙집중식으로 관리
 */

// ============ 서버 설정 ============

/** 기본 포트 번호 */
export const DEFAULT_PORT = 27125;

/** 서버 바인딩 호스트 */
export const SERVER_HOST = '127.0.0.1';

/** localhost 호스트명 (인증서용) */
export const LOCALHOST = 'localhost';

/** 기본 CORS 허용 origins */
export const DEFAULT_CORS_ORIGINS: readonly string[] = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

// ============ Rate Limiting ============

/** Rate limit 시간 윈도우 (밀리초) */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1분

/** 윈도우 당 최대 요청 수 */
export const RATE_LIMIT_MAX_REQUESTS = 100;

// ============ Request Body Limits ============

/** JSON body 최대 크기 */
export const JSON_BODY_LIMIT = '1mb';

/** Text body 최대 크기 (마크다운 파일 전체 내용 가능) */
export const TEXT_BODY_LIMIT = '10mb';

// ============ 인증서 설정 ============

/** RSA 키 크기 (bits) - 장기 보안을 위해 4096 사용 */
export const RSA_KEY_SIZE = 4096;

/** 인증서 유효 기간 (년) */
export const CERT_VALIDITY_YEARS = 10;

/** 인증서 조직명 */
export const CERT_ORG_NAME = 'Obsidian Extended REST API';

// ============ 캐시 설정 ============

/** 태그 캐시 TTL (밀리초) */
export const TAG_CACHE_TTL_MS = 30000; // 30초

/** 파일 목록 캐시 TTL (밀리초) */
export const FILE_LIST_CACHE_TTL_MS = 30000; // 30초

/** 백링크 캐시 TTL (밀리초) */
export const BACKLINK_CACHE_TTL_MS = 30000; // 30초

/** Glob 정규식 캐시 최대 크기 */
export const GLOB_CACHE_MAX_SIZE = 100;

// ============ 트리 탐색 설정 ============

/** 트리 최소 깊이 */
export const TREE_DEPTH_MIN = 1;

/** 트리 최대 깊이 */
export const TREE_DEPTH_MAX = 100;

/** 트리 기본 깊이 */
export const TREE_DEFAULT_DEPTH = 10;

// ============ Dataview 설정 ============

/** Dataview 쿼리 타임아웃 (밀리초) */
export const QUERY_TIMEOUT_MS = 30000; // 30초

/** Dataview 쿼리 최대 결과 수 */
export const DATAVIEW_MAX_RESULTS = 1000;

// ============ 페이지네이션 설정 ============

/** 기본 페이지 크기 */
export const DEFAULT_PAGE_LIMIT = 100;

/** 최대 페이지 크기 */
export const MAX_PAGE_LIMIT = 1000;

// ============ 검색 설정 ============

/** JsonLogic 쿼리 최대 재귀 깊이 */
export const MAX_JSONLOGIC_DEPTH = 10;

/** 검색 동시 처리 수 */
export const SEARCH_CONCURRENCY = 10;

/** 검색 컨텍스트 윈도우 크기 (앞뒤 문자 수) */
export const SEARCH_CONTEXT_CHARS = 50;

/** 파일당 최대 매치 수 */
export const MAX_MATCHES_PER_FILE = 10;

/** 검색 점수 계산 배수 */
export const SEARCH_SCORE_MULTIPLIER = 100;

// ============ Batch 설정 ============

/** 배치 작업 최대 파일 수 */
export const MAX_BATCH_SIZE = 50;

/** 배치 작업 동시 처리 수 */
export const BATCH_CONCURRENCY = 10;

// ============ API 버전 ============

/** API 버전 (health check 응답용) */
export const API_VERSION = '1.0.0';

// ============ HTTP Status Codes ============

export const HTTP_STATUS = {
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============ Error Codes ============

export const ERROR_CODE = {
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  BAD_REQUEST: 'BAD_REQUEST',
} as const;

// ============ Error Messages ============

export const ERROR_MSG = {
  // Active file errors
  NO_ACTIVE_FILE: 'No active file',

  // File/Folder errors
  FILE_NOT_FOUND: 'File not found',
  FOLDER_NOT_FOUND: 'Folder not found',
  PATH_REQUIRED: 'Path is required',
  PATHS_ARRAY_REQUIRED: 'paths array is required',

  // Auth errors
  AUTH_HEADER_REQUIRED: 'Authorization header required',
  INVALID_AUTH_FORMAT: 'Invalid authorization format. Use: Bearer <api_key>',
  INVALID_API_KEY: 'Invalid API key',

  // Search errors
  PATTERN_REQUIRED: 'Pattern query parameter is required',
  QUERY_REQUIRED: 'Query parameter is required',
  DQL_QUERY_REQUIRED: 'DQL query is required',

  // Command errors
  COMMAND_ID_REQUIRED: 'Command ID is required',

  // General errors
  ENDPOINT_NOT_FOUND: 'Endpoint not found',
  TOO_MANY_REQUESTS: 'Too many requests, please try again later',

  // Folder/Move errors
  FOLDER_NOT_EMPTY: 'Folder is not empty. Use force=true to delete',
  TARGET_EXISTS: 'Target path already exists',
  NEW_PATH_REQUIRED: 'newPath is required in request body',
} as const;

// ============ MIME Types ============

export const MIME_TYPE = {
  // Standard types
  JSON: 'application/json',
  TEXT_PLAIN: 'text/plain',
  TEXT_MARKDOWN: 'text/markdown',

  // Custom Obsidian types
  NOTE_JSON: 'application/vnd.olrapi.note+json',
  JSONLOGIC: 'application/vnd.olrapi.jsonlogic+json',
  DATAVIEW_DQL: 'application/vnd.olrapi.dataview.dql+txt',
} as const;

// ============ HTTP Headers ============

export const HTTP_HEADER = {
  CONTENT_TYPE: 'Content-Type',
  AUTHORIZATION: 'Authorization',
  ACCEPT: 'Accept',
  OPERATION: 'Operation',
  TARGET_TYPE: 'Target-Type',
  TARGET: 'Target',
} as const;

// ============ HTTP Methods ============

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

// ============ Auth ============

export const AUTH_SCHEME = 'Bearer';

/** Minimum required API key length (characters) */
export const MIN_API_KEY_LENGTH = 16;

// ============ File Extensions ============

export const FILE_EXT = {
  MARKDOWN: '.md',
} as const;

// ============ Command Security ============

/**
 * 실행이 차단되는 위험한 명령어 목록
 * 이 명령어들은 vault 삭제, 데이터 손실, 보안 위험 등 위험한 작업을 수행할 수 있음
 */
export const BLOCKED_COMMANDS = [
  // ============ Vault 삭제/파괴 관련 ============
  'app:delete-vault',
  'file-recovery:open',

  // ============ 설정/시스템 관련 ============
  'app:open-settings',
  'app:open-installer',
  'app:open-sandbox-vault',
  'app:reload',
  'app:show-debug-info',

  // ============ 플러그인 관리 (보안 위험) ============
  'app:open-plugins',
  'community-plugins:browse',
  'community-plugins:toggle',

  // ============ 파일 대량 조작 ============
  'file-explorer:reveal-active-file',
  'file-explorer:move-file',
  'file-explorer:duplicate-file',

  // ============ 외부 연동/동기화 ============
  'obsidian-sync:setup',
  'obsidian-sync:view-version-history',
  'publish:open',
  'publish:view-changes',

  // ============ 인증/계정 관련 ============
  'app:manage-account',
  'app:login',
  'app:logout',

  // ============ UI 조작 (불필요한 API 사용 방지) ============
  'app:open-help',
  'app:toggle-default-new-pane-mode',
  'app:toggle-left-sidebar',
  'app:toggle-right-sidebar',
  'app:go-back',
  'app:go-forward',

  // ============ 템플릿/자동화 (의도치 않은 실행 방지) ============
  'templater-obsidian:insert-templater',
  'templater-obsidian:replace-in-file-templater',
  'templater-obsidian:jump-to-next-cursor-location',
] as const;

/**
 * 패턴 기반 명령어 차단 목록
 * 새로 추가되는 위험 명령어에 대한 방어 강화
 */
export const BLOCKED_COMMAND_PATTERNS: RegExp[] = [
  /^app:delete/i,           // app:delete로 시작하는 모든 명령어
  /^file-recovery:/i,       // 모든 file-recovery: 명령어
  /delete-vault/i,          // vault 삭제 관련
  /^obsidian-sync:/i,       // 모든 동기화 명령어
  /^publish:/i,             // 모든 발행 명령어
];

/**
 * 명령어가 차단 목록에 있는지 확인
 */
export function isBlockedCommand(commandId: string): boolean {
  // 정확한 ID 매칭
  if (BLOCKED_COMMANDS.includes(commandId as typeof BLOCKED_COMMANDS[number])) {
    return true;
  }
  // 패턴 매칭
  return BLOCKED_COMMAND_PATTERNS.some(pattern => pattern.test(commandId));
}
