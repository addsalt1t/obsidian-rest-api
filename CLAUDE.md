# obsidian-rest-api

Extended REST API plugin for Obsidian (Express-based)

## Commands

```bash
npm test              # Unit tests
npm run test:coverage # Coverage report
npm run build         # Build
npm run lint          # Lint
```

## Architecture

```
src/
├── routes/            # Express route handlers (thin layer, 27 files)
│   ├── vault.ts, active.ts, batch.ts, periodic.ts, periodic-context.ts
│   ├── search.ts, metadata.ts, tags.ts, graph.ts, commands.ts
│   ├── dataview.ts, autolink.ts, vector.ts
│   ├── vault/handlers/    # Vault read/write/patch sub-handlers
│   │   └── tree.ts, utils.ts
│   └── openapi/           # OpenAPI spec (9 modules)
├── services/          # Business logic (22 files)
│   ├── autolink/          # Autolink service (6 files, 614 LOC)
│   ├── vector/            # Vector service (8 files, 574 LOC)
│   ├── tagCache.ts        # Event-based tag cache
│   ├── backlinkCache.ts   # Event-based backlink cache
│   ├── fileListCache.ts   # File list cache
│   ├── filePatching.ts    # Heading/block/line patching (458 LOC)
│   ├── dataviewQuery.ts   # Dataview query execution
│   ├── yaml-formatter.ts  # YAML formatting
│   └── markdownParser.ts  # Markdown parsing
├── middleware/         # Express middleware
│   ├── asyncHandler.ts    # Error auto-delegation (.catch(next))
│   ├── auth.ts            # Bearer token authentication
│   └── error.ts           # Error response formatting (ApiError → coded responses)
├── utils/             # Utilities (16 files)
│   ├── response-builders.ts   # buildNoteJsonResponse(), buildMetadataResponse()
│   ├── request-parsers.ts     # parsePagination(), parseStringParam()
│   ├── file-helpers.ts        # resolveSafeFilePath()
│   ├── batch-validation.ts    # validateBatchArray()
│   ├── patch-dispatcher.ts    # dispatchPatch()
│   ├── patch-request.ts       # PATCH request parsing
│   ├── metadata-ready.ts      # waitForMetadataReady()
│   ├── errors.ts              # ApiError definition
│   └── batch-helpers.ts, concurrency.ts, content.ts, crypto.ts, regex.ts, path-validation.ts, path-scope.ts, logger.ts
├── server.ts, main.ts, settings.ts, constants.ts
```

## Required Patterns

Patterns that must be followed when writing route handlers:

| Pattern | Utility | Description |
|---------|---------|-------------|
| Error handling | `asyncHandler` | Wraps routes — no try-catch needed |
| Request params | `parseStringParam()` etc. | No `as string` — use type-safe functions |
| Note JSON response | `buildNoteJsonResponse()` | Unified note response builder |
| File path validation | `resolveSafeFilePath()` | validatePath + ensureMarkdownPath + getFileOrNull combined |
| PATCH dispatch | `dispatchPatch()` | Unified targetType branching logic |
| Batch validation | `validateBatchArray()` | Size/empty-array validation combined |
| Pagination | `parsePagination()` | limit/offset parsing combined |
| Metadata response | `buildMetadataResponse()` | Unified metadata extraction |

## Service Subdomains

### Autolink (6 files, 610 LOC)
- `autolink-service.ts`: scan, linkify, extractEntitiesFromPaths
- `scan-engine.ts`: Entity scan engine
- `entity-extractor.ts`: Entity extraction from files
- `matcher.ts`: Pattern matching

### Vector (8 files, 557 LOC)
- `vector-service.ts`: embed, vectorSearch, TF-IDF
- `cache.ts`: Embedding cache
- `scope.ts`: Search scope management
- `tfidf.ts`: TF-IDF algorithm

## Cache Architecture

3 event-based singleton caches:
- `tagCache.ts`: vault + metadataCache events → instant invalidation
- `backlinkCache.ts`: vault + metadataCache + resolved events
- `fileListCache.ts`: vault event-based

**Event listeners**: `vault.on`, `vault.offref`, `metadataCache.on`, `metadataCache.offref`

## OpenAPI Spec

Split into 9 modules (`routes/openapi/`):
- `base.ts`: Shared schemas
- `common.ts`: Common response/parameter schemas
- `paths-vault.ts`, `paths-batch.ts`, `paths-search.ts`, `paths-metadata.ts`, `paths-graph.ts`, `paths-other.ts`: Per-endpoint
- `index.ts`: Composition

When adding new APIs, add to the corresponding paths file.

## REST API Reference

- Swagger UI: `https://127.0.0.1:27125/docs`
- OpenAPI spec: `https://127.0.0.1:27125/openapi.json`

## Gotchas

- No try-catch in route handlers — `asyncHandler` delegates via `.catch(next)`, `errorHandler` sends response
- No `req.params.xxx as string` — use type-safe functions from `request-parsers.ts`
- Route tests must use `createRouterTestApp()` — includes errorHandler (without it, error responses won't be captured)
- `instanceof TFile` doesn't work in test mocks — use duck typing (`'extension' in file`)
- `tagCache`/`backlinkCache` are singletons — call `disposeXxxCache()` in `beforeEach` during tests
- Cache mock App requires `vault.on`/`vault.offref`/`metadataCache.on`/`metadataCache.offref`
- `waitForMetadataReady()` — waits for metadataCache re-indexing after file move/rename
- `errorHandler` — ApiError responds with code (INTERNAL_ERROR etc.), generic Error masked as 'Internal server error'
