import { API_VERSION } from '../../constants';

/**
 * OpenAPI 3.0 base spec (info, servers, tags, components, security)
 * Path definitions are in separate files (paths-*.ts)
 */
export const openApiBase = {
  openapi: '3.0.3',
  info: {
    title: 'Obsidian Extended REST API',
    version: API_VERSION,
    description: 'Extended REST API for Obsidian vault operations',
    contact: {
      name: 'GitHub Repository',
      url: 'https://github.com/jedi/obsidian-workspace',
    },
  },
  servers: [
    {
      url: 'https://127.0.0.1:27125',
      description: 'Local Obsidian server (HTTPS)',
    },
    {
      url: 'http://127.0.0.1:27125',
      description: 'Local Obsidian server (HTTP)',
    },
  ],
  tags: [
    { name: 'vault', description: 'File and folder operations' },
    { name: 'batch', description: 'Batch file operations' },
    { name: 'search', description: 'Search operations' },
    { name: 'metadata', description: 'Metadata operations' },
    { name: 'graph', description: 'Note graph operations' },
    { name: 'commands', description: 'Obsidian command execution' },
    { name: 'active', description: 'Active file operations' },
    { name: 'periodic', description: 'Periodic notes operations' },
    { name: 'dataview', description: 'Dataview queries' },
    { name: 'tags', description: 'Tag operations' },
    { name: 'autolink', description: 'Unlinked mention detection and auto-wikilink' },
    { name: 'vector', description: 'TF-IDF semantic search' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key authentication',
      },
    },
    schemas: {
      FileInfo: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          name: { type: 'string' },
          extension: { type: 'string' },
          size: { type: 'integer' },
          ctime: { type: 'integer' },
          mtime: { type: 'integer' },
        },
      },
      FolderInfo: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          name: { type: 'string' },
          children: { type: 'array', items: { type: 'string' } },
        },
      },
      BatchReadResult: {
        type: 'object',
        properties: {
          success: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                error: { type: 'string' },
              },
            },
          },
          total: { type: 'integer' },
        },
      },
      BatchWriteResult: {
        type: 'object',
        properties: {
          success: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                created: { type: 'boolean' },
              },
            },
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                error: { type: 'string' },
              },
            },
          },
          total: { type: 'integer' },
        },
      },
      BatchDeleteResult: {
        type: 'object',
        properties: {
          success: { type: 'array', items: { type: 'string' } },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                error: { type: 'string' },
              },
            },
          },
          total: { type: 'integer' },
        },
      },
      UnifiedMetadata: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          frontmatter: { type: 'object', additionalProperties: true },
          tags: { type: 'array', items: { type: 'string' } },
          links: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                displayText: { type: 'string' },
              },
            },
          },
          backlinks: { type: 'array', items: { type: 'string' } },
          stat: {
            type: 'object',
            properties: {
              size: { type: 'integer' },
              ctime: { type: 'integer' },
              mtime: { type: 'integer' },
            },
          },
        },
      },
      AutolinkScanResponse: {
        type: 'object',
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entityName: { type: 'string' },
                entityPath: { type: 'string' },
                matchedText: { type: 'string' },
                filePath: { type: 'string' },
                line: { type: 'integer' },
                column: { type: 'integer' },
                context: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
          },
          totalFiles: { type: 'integer' },
          totalMatches: { type: 'integer' },
          byEntity: { type: 'object', additionalProperties: { type: 'integer' } },
        },
      },
      AutolinkLinkifyResponse: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filePath: { type: 'string' },
                line: { type: 'integer' },
                before: { type: 'string' },
                after: { type: 'string' },
                applied: { type: 'boolean' },
              },
            },
          },
          filesModified: { type: 'integer' },
          totalChanges: { type: 'integer' },
          skipped: { type: 'integer' },
        },
      },
      VectorEmbeddingStatus: {
        type: 'object',
        properties: {
          totalDocuments: { type: 'integer' },
          embeddedDocuments: { type: 'integer' },
          pendingDocuments: { type: 'integer' },
          modelName: { type: 'string' },
        },
      },
      VectorEmbedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          processed: { type: 'integer' },
          skipped: { type: 'integer' },
          errors: { type: 'array', items: { type: 'string' } },
        },
      },
      VectorSearchResponse: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                name: { type: 'string' },
                score: { type: 'number' },
                frontmatter: { type: 'object', additionalProperties: true },
                excerpt: { type: 'string' },
              },
            },
          },
          query: { type: 'string' },
          totalSearched: { type: 'integer' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};
