/**
 * Batch operation OpenAPI path definitions
 * Includes: batch read, write, delete, metadata
 */
import { createJsonRefResponse } from './common';

export const batchPaths = {
  '/batch/read': {
    post: {
      summary: 'Batch read files',
      tags: ['batch'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['paths'],
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 50,
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonRefResponse('Batch read result', '#/components/schemas/BatchReadResult'),
      },
    },
  },
  '/batch/write': {
    post: {
      summary: 'Batch write files',
      tags: ['batch'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['operations'],
              properties: {
                operations: {
                  type: 'array',
                  maxItems: 50,
                  items: {
                    type: 'object',
                    required: ['path', 'content'],
                    properties: {
                      path: { type: 'string' },
                      content: { type: 'string' },
                      operation: {
                        type: 'string',
                        enum: ['create', 'update', 'upsert'],
                        default: 'upsert',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonRefResponse('Batch write result', '#/components/schemas/BatchWriteResult'),
      },
    },
  },
  '/batch/delete': {
    post: {
      summary: 'Batch delete files',
      tags: ['batch'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['paths'],
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 50,
                },
                force: {
                  type: 'boolean',
                  description: 'Force delete non-empty folders',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonRefResponse('Batch delete result', '#/components/schemas/BatchDeleteResult'),
      },
    },
  },
  '/batch/metadata': {
    post: {
      summary: 'Batch read file metadata',
      tags: ['batch'],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['paths'],
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 50,
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Batch metadata result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'array',
                    items: {
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
            },
          },
        },
      },
    },
  },
};
