/**
 * OpenAPI path definitions for: commands, active, periodic, autolink, vector
 */
import {
  createJsonRefResponse,
  createMarkdownOrJsonRequestBody,
  createMarkdownRequestBody,
  createPatchOperationHeaderParameter,
  createPatchTargetTypeHeaderParameter,
  createPeriodicParameters,
} from './common';

const activePatchTargetParameter = {
  name: 'target',
  in: 'query',
  schema: { type: 'string' },
  description: 'Target identifier (heading text, line number)',
};

const periodicPatchTargetParameter = {
  name: 'target',
  in: 'query',
  schema: { type: 'string' },
  description: 'Heading text to target',
};

export const otherPaths = {
  '/commands': {
    get: {
      summary: 'List available commands',
      tags: ['commands'],
      responses: {
        '200': { description: 'Command list' },
      },
    },
  },
  '/commands/{id}': {
    post: {
      summary: 'Execute command',
      tags: ['commands'],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Command executed' },
        '404': { description: 'Command not found' },
      },
    },
  },
  '/open/{path}': {
    post: {
      summary: 'Open file in Obsidian editor',
      tags: ['commands'],
      parameters: [
        {
          name: 'path',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'File path to open',
        },
        {
          name: 'newLeaf',
          in: 'query',
          schema: { type: 'boolean', default: false },
          description: 'Open in new tab',
        },
      ],
      responses: {
        '200': { description: 'File opened' },
        '404': { description: 'File not found' },
      },
    },
  },
  '/active': {
    get: {
      summary: 'Get active file',
      tags: ['active'],
      responses: {
        '200': { description: 'Active file content' },
        '404': { description: 'No active file' },
      },
    },
    put: {
      summary: 'Update active file',
      tags: ['active'],
      requestBody: createMarkdownRequestBody(),
      responses: {
        '200': { description: 'File updated' },
        '404': { description: 'No active file' },
      },
    },
    delete: {
      summary: 'Delete active file',
      tags: ['active'],
      responses: {
        '200': { description: 'File deleted' },
        '404': { description: 'No active file' },
      },
    },
  },
  '/active/': {
    post: {
      summary: 'Append content to active file',
      tags: ['active'],
      requestBody: createMarkdownRequestBody(),
      responses: {
        '200': { description: 'Content appended' },
        '404': { description: 'No active file' },
      },
    },
    patch: {
      summary: 'Patch active file',
      tags: ['active'],
      parameters: [
        activePatchTargetParameter,
        createPatchOperationHeaderParameter(),
        createPatchTargetTypeHeaderParameter(['heading', 'line', 'frontmatter-key']),
      ],
      requestBody: createMarkdownOrJsonRequestBody(),
      responses: {
        '200': { description: 'Active file patched' },
        '404': { description: 'No active file or target not found' },
      },
    },
  },
  '/periodic/{period}': {
    get: {
      summary: 'Get periodic note',
      tags: ['periodic'],
      parameters: createPeriodicParameters(),
      responses: {
        '200': { description: 'Periodic note content' },
        '404': { description: 'Note not found' },
      },
    },
    put: {
      summary: 'Create or update periodic note',
      tags: ['periodic'],
      parameters: createPeriodicParameters(),
      requestBody: createMarkdownRequestBody(),
      responses: {
        '200': { description: 'Periodic note updated' },
        '201': { description: 'Periodic note created' },
      },
    },
    post: {
      summary: 'Append content to periodic note',
      tags: ['periodic'],
      parameters: createPeriodicParameters(),
      requestBody: createMarkdownRequestBody(),
      responses: {
        '200': { description: 'Content appended' },
        '404': { description: 'Note not found' },
      },
    },
    patch: {
      summary: 'Patch periodic note by heading',
      tags: ['periodic'],
      parameters: createPeriodicParameters([
        periodicPatchTargetParameter,
        createPatchOperationHeaderParameter(),
        createPatchTargetTypeHeaderParameter(['heading']),
      ]),
      requestBody: createMarkdownRequestBody(),
      responses: {
        '200': { description: 'Periodic note patched' },
        '404': { description: 'Note or heading not found' },
      },
    },
  },
  '/autolink/scan': {
    post: {
      summary: 'Scan for unlinked entity mentions',
      tags: ['autolink'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['entitySourcePaths'],
              properties: {
                entitySourcePaths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Folder paths containing entity notes (with name frontmatter)',
                },
                targetPaths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Target file paths to scan (defaults to all markdown files)',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonRefResponse('Scan results', '#/components/schemas/AutolinkScanResponse'),
        '400': { description: 'entitySourcePaths is required' },
      },
    },
  },
  '/autolink/linkify': {
    post: {
      summary: 'Convert unlinked mentions to wikilinks',
      tags: ['autolink'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['entitySourcePaths'],
              properties: {
                entitySourcePaths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Folder paths containing entity notes',
                },
                targetPaths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Target file paths (defaults to all markdown files)',
                },
                dryRun: {
                  type: 'boolean',
                  default: false,
                  description: 'Preview changes without applying',
                },
                autoConfirm: {
                  type: 'boolean',
                  default: false,
                  description: 'Apply all confidence levels (default: high only)',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonRefResponse('Linkify results', '#/components/schemas/AutolinkLinkifyResponse'),
        '400': { description: 'entitySourcePaths is required' },
      },
    },
  },
  '/vector/status': {
    get: {
      summary: 'Get embedding status',
      tags: ['vector'],
      parameters: [
        {
          name: 'basePath',
          in: 'query',
          schema: { type: 'string' },
          description: 'Folder path to check (defaults to entire vault)',
        },
      ],
      responses: {
        '200': createJsonRefResponse('Embedding status', '#/components/schemas/VectorEmbeddingStatus'),
      },
    },
  },
  '/vector/embed': {
    post: {
      summary: 'Create or update document embeddings',
      tags: ['vector'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                basePath: {
                  type: 'string',
                  description: 'Target folder (defaults to entire vault)',
                },
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific files to embed',
                },
                force: {
                  type: 'boolean',
                  default: false,
                  description: 'Force re-embed existing documents',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonRefResponse('Embed result', '#/components/schemas/VectorEmbedResponse'),
      },
    },
  },
  '/vector/search': {
    post: {
      summary: 'Semantic vector search',
      tags: ['vector'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query text',
                },
                basePath: {
                  type: 'string',
                  description: 'Search scope folder',
                },
                limit: {
                  type: 'integer',
                  default: 10,
                  description: 'Max results',
                },
                threshold: {
                  type: 'number',
                  default: 0.1,
                  description: 'Minimum similarity score (0-1)',
                },
                frontmatterFilter: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Frontmatter key-value filter',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonRefResponse('Search results', '#/components/schemas/VectorSearchResponse'),
        '400': { description: 'query is required' },
      },
    },
  },
};
