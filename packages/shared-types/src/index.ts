/**
 * @obsidian-workspace/shared-types
 * Obsidian workspace 프로젝트 간 공유 타입
 */

// Vault types
export type {
  FileInfo,
  FolderInfo,
  FolderTree,
  VaultListResult,
  VaultTreeResponse,
  VaultInfo,
  FileOperationResult,
  FolderOperationResult,
  MoveRenameResult,
  FileMetadata,
  FileWithMetadata,
  LinkInfo,
  UnifiedMetadata,
} from './vault.js';

// Search types
export type {
  RestSearchMatch,
  RestSearchResult,
  SearchMatch,
  SearchResult,
  DataviewResult,
  JsonLogicResult,
  JsonLogicQueryResponse,
} from './search.js';

// Metadata types
export type { TagInfo } from './metadata.js';

// Commands types
export type { Command } from './commands.js';

// Batch types
export type {
  BatchReadResult,
  BatchWriteOperationType,
  BatchWriteOperation,
  BatchWriteResult,
  BatchDeleteResult,
  BatchMetadataResult,
} from './batch.js';

// Operations types
export type {
  PatchOperation,
  PatchTargetType,
  PatchOptions,
  HeadingInfo,
  HeadingResolveResult,
} from './operations.js';

// Periodic notes types
export type {
  PeriodicNotePeriod,
  PeriodicNoteDate,
} from './periodic.js';

// Graph types
export type { HubInfo } from './graph.js';

// Autolink types
export type {
  AutolinkEntity,
  AutolinkScanMatch,
  AutolinkScanRequest,
  AutolinkScanResponse,
  AutolinkLinkifyRequest,
  AutolinkLinkifyChange,
  AutolinkLinkifyResponse,
} from './autolink.js';

// Vector types
export type {
  VectorEmbeddingStatus,
  VectorEmbedRequest,
  VectorEmbedResponse,
  VectorSearchRequest,
  VectorSearchResult,
  VectorSearchResponse,
} from './vector.js';

// Parity catalog
export type { ParityEntry, ParityTier, HttpMethod } from './parity-catalog.js';
export { PARITY_CATALOG } from './parity-catalog.js';
