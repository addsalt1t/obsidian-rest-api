/**
 * Extended REST API constants.
 * Centralized management of hardcoded values.
 */

// ============ Server Configuration ============

/** Default port number */
export const DEFAULT_PORT = 27125;

/** Server binding host */
export const SERVER_HOST = '127.0.0.1';

/** Localhost hostname (for certificates) */
export const LOCALHOST = 'localhost';

/** Default allowed CORS origins */
export const DEFAULT_CORS_ORIGINS: readonly string[] = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

// ============ Rate Limiting ============

/** Rate limit time window (milliseconds) */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/** Maximum requests per window */
export const RATE_LIMIT_MAX_REQUESTS = 100;

// ============ Request Body Limits ============

/** Maximum JSON body size */
export const JSON_BODY_LIMIT = '1mb';

/** Maximum text body size (supports full markdown file content) */
export const TEXT_BODY_LIMIT = '10mb';

// ============ Certificate Configuration ============

/** RSA key size (bits) - using 4096 for long-term security */
export const RSA_KEY_SIZE = 4096;

/** Certificate validity period (years) */
export const CERT_VALIDITY_YEARS = 2;

/** Certificate organization name */
export const CERT_ORG_NAME = 'Obsidian Extended REST API';

// ============ Cache Configuration ============

/** Tag cache TTL (milliseconds) */
export const TAG_CACHE_TTL_MS = 30000; // 30 seconds

/** File list cache TTL (milliseconds) */
export const FILE_LIST_CACHE_TTL_MS = 30000; // 30 seconds

/** Backlink cache TTL (milliseconds) */
export const BACKLINK_CACHE_TTL_MS = 30000; // 30 seconds

/** Maximum glob regex cache size */
export const GLOB_CACHE_MAX_SIZE = 100;

// ============ Tree Traversal Configuration ============

/** Minimum tree depth */
export const TREE_DEPTH_MIN = 1;

/** Maximum tree depth */
export const TREE_DEPTH_MAX = 100;

/** Default tree depth */
export const TREE_DEFAULT_DEPTH = 10;

// ============ Dataview Configuration ============

/** Dataview query timeout (milliseconds) */
export const QUERY_TIMEOUT_MS = 30000; // 30 seconds

/** Maximum Dataview query results */
export const DATAVIEW_MAX_RESULTS = 1000;

// ============ Pagination Configuration ============

/** Default page size */
export const DEFAULT_PAGE_LIMIT = 100;

/** Maximum page size */
export const MAX_PAGE_LIMIT = 1000;

// ============ Search Configuration ============

/** Maximum recursion depth for JsonLogic queries */
export const MAX_JSONLOGIC_DEPTH = 10;

/** Search concurrency limit */
export const SEARCH_CONCURRENCY = 10;

/** Search context window size (characters before and after match) */
export const SEARCH_CONTEXT_CHARS = 50;

/** Maximum matches per file */
export const MAX_MATCHES_PER_FILE = 10;

/** Search score calculation multiplier */
export const SEARCH_SCORE_MULTIPLIER = 100;

// ============ Batch Configuration ============

/** Maximum number of files per batch operation */
export const MAX_BATCH_SIZE = 50;

/** Batch operation concurrency limit */
export const BATCH_CONCURRENCY = 10;

// ============ API Version ============

/** API version (for health check responses) */
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
export const MIN_API_KEY_LENGTH = 32;

// ============ File Extensions ============

export const FILE_EXT = {
  MARKDOWN: '.md',
} as const;

// ============ Command Security ============

/**
 * List of dangerous commands that are blocked from execution.
 * These commands can perform destructive operations such as vault deletion, data loss, or security risks.
 */
export const BLOCKED_COMMANDS = [
  // ============ Vault Deletion/Destruction ============
  'app:delete-vault',
  'file-recovery:open',

  // ============ Settings/System ============
  'app:open-settings',
  'app:open-installer',
  'app:open-sandbox-vault',
  'app:reload',
  'app:show-debug-info',

  // ============ Plugin Management (Security Risk) ============
  'app:open-plugins',
  'community-plugins:browse',
  'community-plugins:toggle',

  // ============ Bulk File Operations ============
  'file-explorer:reveal-active-file',
  'file-explorer:move-file',
  'file-explorer:duplicate-file',

  // ============ External Integrations/Sync ============
  'obsidian-sync:setup',
  'obsidian-sync:view-version-history',
  'publish:open',
  'publish:view-changes',

  // ============ Authentication/Account ============
  'app:manage-account',
  'app:login',
  'app:logout',

  // ============ UI Operations (Prevent Unnecessary API Usage) ============
  'app:open-help',
  'app:toggle-default-new-pane-mode',
  'app:toggle-left-sidebar',
  'app:toggle-right-sidebar',
  'app:go-back',
  'app:go-forward',

  // ============ Templates/Automation (Prevent Unintended Execution) ============
  'templater-obsidian:insert-templater',
  'templater-obsidian:replace-in-file-templater',
  'templater-obsidian:jump-to-next-cursor-location',
] as const;

/**
 * Pattern-based command blocklist.
 * Provides defense-in-depth against newly added dangerous commands.
 */
export const BLOCKED_COMMAND_PATTERNS: RegExp[] = [
  /^app:delete/i,           // All commands starting with app:delete
  /^file-recovery:/i,       // All file-recovery: commands
  /delete-vault/i,          // Vault deletion related
  /^obsidian-sync:/i,       // All sync commands
  /^publish:/i,             // All publish commands
];

/**
 * Check whether a command is in the blocklist.
 */
export function isBlockedCommand(commandId: string): boolean {
  // Exact ID matching
  if (BLOCKED_COMMANDS.includes(commandId as typeof BLOCKED_COMMANDS[number])) {
    return true;
  }
  // Pattern matching
  return BLOCKED_COMMAND_PATTERNS.some(pattern => pattern.test(commandId));
}
