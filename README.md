# Obsidian Extended REST API

A comprehensive REST API plugin for Obsidian vaults. Provides file CRUD, search, metadata, graph analysis, Dataview queries, autolink, semantic search, and more.

## Requirements

- Obsidian 1.4.0 or higher
- (Optional) Dataview plugin - required for Dataview-related endpoints

## Installation

### From GitHub Release (Recommended)

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Create the folder `.obsidian/plugins/extended-rest-api/` in your Obsidian vault.
3. Copy the three downloaded files into that folder.
4. Restart Obsidian and enable the plugin in Community plugins settings.

The folder name `extended-rest-api` must match the `id` in `manifest.json`.

### Manual Build from Source

1. Clone or download this repository.
2. Run `npm install`.
3. Run `npm run build`.
4. Copy the generated `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/extended-rest-api/` in your vault.
5. Restart Obsidian and enable the plugin in settings.

## Configuration

The following options are available in the plugin settings:

- **Port**: REST API server port (default: 27125)
- **API Key**: Bearer token for authentication (auto-generated or manually entered)
- **Enable HTTPS**: Whether to use HTTPS (default: true)
- **CORS Origins**: Allowed origins (default: localhost only)

## API Endpoints

All requests require an `Authorization: Bearer <API_KEY>` header.

Swagger UI: After starting Obsidian, visit `https://127.0.0.1:27125/docs` for the full API documentation.

### Endpoint Categories

| Category | Path | Description |
|----------|------|-------------|
| **Vault** | `/vault/*` | File CRUD, read/write/append/patch content |
| **Folders** | `/vault/folders/*` | Create/delete/move/rename folders |
| **Batch** | `/batch/*` | Batch read/write/delete/metadata |
| **Search** | `/search/*` | Text, tag, glob pattern, JsonLogic search |
| **Metadata** | `/metadata/*` | Frontmatter read/write, backlinks |
| **Tags** | `/tags/*` | Tag listing, files by tag |
| **Graph** | `/graph/*` | Outlinks, backlinks, orphan notes, hub analysis |
| **Active** | `/active/*` | Current active file read/write/patch |
| **Periodic** | `/periodic/*` | Periodic notes (daily/weekly/monthly, etc.) |
| **Commands** | `/commands/*` | Obsidian command listing/execution, file opening |
| **Dataview** | `/dataview/*` | Dataview queries (LIST/TABLE/TASK/CALENDAR) |
| **Autolink** | `/autolink/*` | Unlinked entity detection (scan) and auto wikilink conversion (linkify) |
| **Vector** | `/vector/*` | TF-IDF embedding generation and semantic search |
| **Health** | `/health` | Server health check |
| **OpenAPI** | `/docs`, `/openapi.json` | Swagger UI and OpenAPI spec |

### Usage Examples

```bash
# List tags
curl -k https://127.0.0.1:27125/tags \
  -H "Authorization: Bearer YOUR_API_KEY"

# Read a file
curl -k https://127.0.0.1:27125/vault/notes/example.md \
  -H "Authorization: Bearer YOUR_API_KEY"

# Text search
curl -k "https://127.0.0.1:27125/search?q=project" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Dataview query
curl -k https://127.0.0.1:27125/dataview/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "TABLE file.name FROM #project"}'

# Graph analysis - hub notes
curl -k "https://127.0.0.1:27125/graph/hubs?limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Security

- The server binds to localhost (127.0.0.1) only.
- All requests require Bearer token authentication.
- HTTPS with self-signed certificates is supported for encrypted communication.

## Network Use

- This plugin opens an HTTP/HTTPS server only on `127.0.0.1` on the local machine.
- API requests and responses are processed via local process communication (`localhost`) only.
- No vault data is transmitted to external remote servers.

## Data Handling

- This plugin accesses files and metadata in the current vault to process API requests.
- Only authenticated requests (`Authorization: Bearer <API_KEY>`) are processed.
- No telemetry (usage tracking or analytics data) is collected.

## Comparison with Obsidian Local REST API

Extended REST API includes all features of Local REST API plus additional capabilities.

| Feature | Local REST API | Extended REST API |
|---------|----------------|-------------------|
| File CRUD | Yes | Yes |
| Search | Yes | Yes (+ tag/glob/JsonLogic) |
| Command execution | Yes | Yes |
| Batch operations | No | Yes |
| Tags/Metadata | No | Yes |
| Graph analysis | No | Yes |
| Active file | No | Yes |
| Periodic notes | No | Yes |
| Dataview queries | No | Yes |
| Autolink | No | Yes |
| Semantic search (Vector) | No | Yes |
| Swagger UI | No | Yes |

## Contract Sync for MCP

- Export the REST↔MCP parity lock file with `npm run contract:export`.
- Commit `contracts/parity-catalog.lock.json` when `PARITY_CATALOG` changes.
- `tests/unit/parity/parity-lock.test.ts` fails if the lock file is missing or stale.

## License

MIT License
