import { API_VERSION } from '../../constants';
import {
  createJsonResponse,
  createFieldsQueryParameter,
  createMarkdownOrJsonRequestBody,
  createMarkdownRequestBody,
  createPatchOperationHeaderParameter,
  createPatchTargetTypeHeaderParameter,
  createPathParameter,
} from './common';

const patchTargetQueryParameter = {
  name: 'target',
  in: 'query',
  schema: { type: 'string' },
  description: 'Target identifier (heading text, block ID, line number)',
};

const patchResolveQueryParameter = {
  name: 'resolve',
  in: 'query',
  schema: { type: 'boolean' },
  description: 'Auto-resolve heading path (for ambiguous headings)',
};

/**
 * Vault-related OpenAPI path definitions
 * Includes: health, vault CRUD, folder operations, move/rename
 */
export const vaultPaths = {
  '/health': {
    get: {
      summary: 'Health check',
      tags: ['health'],
      responses: {
        '200': createJsonResponse('Server is healthy', {
          status: { type: 'string', example: 'ok' },
          version: { type: 'string', example: API_VERSION },
        }),
      },
    },
  },
  '/vault/{path}': {
    get: {
      summary: 'Get file or folder contents',
      tags: ['vault'],
      parameters: [
        createPathParameter('File or folder path (trailing / for folder listing)'),
        {
          name: 'Accept',
          in: 'header',
          schema: {
            type: 'string',
            enum: ['text/markdown', 'application/vnd.olrapi.note+json'],
          },
          description: 'Response format (note+json includes metadata)',
        },
        createFieldsQueryParameter(
          ['content', 'frontmatter', 'tags', 'links', 'stat'],
          'Used when Accept is application/vnd.olrapi.note+json',
        ),
      ],
      responses: {
        '200': { description: 'File content or folder listing' },
        '404': { description: 'File or folder not found' },
      },
    },
    put: {
      summary: 'Create or update file',
      tags: ['vault'],
      parameters: [createPathParameter()],
      requestBody: createMarkdownRequestBody(),
      responses: {
        '200': { description: 'File updated' },
        '201': { description: 'File created' },
      },
    },
    post: {
      summary: 'Append content to file',
      tags: ['vault'],
      parameters: [createPathParameter()],
      requestBody: createMarkdownRequestBody(),
      responses: {
        '200': { description: 'Content appended' },
        '404': { description: 'File not found' },
      },
    },
    patch: {
      summary: 'Partial file update',
      tags: ['vault'],
      parameters: [
        createPathParameter(),
        patchTargetQueryParameter,
        patchResolveQueryParameter,
        createPatchOperationHeaderParameter(),
        createPatchTargetTypeHeaderParameter(['heading', 'block', 'line', 'frontmatter', 'frontmatter-key']),
      ],
      requestBody: createMarkdownOrJsonRequestBody(),
      responses: {
        '200': { description: 'File patched' },
        '400': { description: 'Ambiguous heading (candidates returned)' },
        '404': { description: 'File or target not found' },
      },
    },
    delete: {
      summary: 'Delete file',
      tags: ['vault'],
      parameters: [createPathParameter()],
      responses: {
        '200': { description: 'File deleted' },
        '404': { description: 'File not found' },
      },
    },
  },
  '/vault/folder/{path}': {
    post: {
      summary: 'Create folder',
      tags: ['vault'],
      parameters: [createPathParameter('Folder path to create')],
      responses: {
        '201': { description: 'Folder created' },
        '409': { description: 'Folder already exists' },
      },
    },
    delete: {
      summary: 'Delete folder',
      tags: ['vault'],
      parameters: [
        createPathParameter('Folder path to delete'),
        {
          name: 'force',
          in: 'query',
          schema: { type: 'boolean', default: false },
          description: 'Force delete non-empty folders',
        },
      ],
      responses: {
        '200': { description: 'Folder deleted' },
        '404': { description: 'Folder not found' },
        '409': { description: 'Folder not empty (use force=true)' },
      },
    },
  },
  '/vault/{path}/move': {
    post: {
      summary: 'Move file or folder',
      tags: ['vault'],
      parameters: [createPathParameter('Source file or folder path')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['newPath'],
              properties: {
                newPath: {
                  type: 'string',
                  description: 'Destination path',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonResponse('Moved successfully (links auto-updated)', {
          message: { type: 'string' },
          oldPath: { type: 'string' },
          newPath: { type: 'string' },
        }),
        '404': { description: 'Source not found' },
        '409': { description: 'Target already exists' },
      },
    },
  },
  '/vault/{path}/rename': {
    post: {
      summary: 'Rename file or folder',
      tags: ['vault'],
      parameters: [createPathParameter('Source file or folder path')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['newName'],
              properties: {
                newName: {
                  type: 'string',
                  description: 'New name (filename only, not full path)',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonResponse('Renamed successfully (links auto-updated)', {
          message: { type: 'string' },
          oldPath: { type: 'string' },
          newPath: { type: 'string' },
        }),
        '404': { description: 'Source not found' },
        '409': { description: 'Target already exists' },
      },
    },
  },
};
