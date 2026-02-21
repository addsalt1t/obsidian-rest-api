/**
 * Graph-related OpenAPI path definitions
 * Includes: links, backlinks, orphans, hubs
 */
export const graphPaths = {
  '/graph/links/{path}': {
    get: {
      summary: 'Get outbound links',
      tags: ['graph'],
      parameters: [
        { name: 'path', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Outbound links',
          content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              links: { type: 'array', items: { type: 'string' } },
              count: { type: 'integer' },
            },
          }}},
        },
        '404': { description: 'File not found' },
      },
    },
  },
  '/graph/backlinks/{path}': {
    get: {
      summary: 'Get backlinks',
      tags: ['graph'],
      parameters: [
        { name: 'path', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Backlinks',
          content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              backlinks: { type: 'array', items: { type: 'string' } },
              count: { type: 'integer' },
            },
          }}},
        },
        '404': { description: 'File not found' },
      },
    },
  },
  '/graph/orphans': {
    get: {
      summary: 'Get orphan notes',
      tags: ['graph'],
      responses: {
        '200': {
          description: 'Orphan notes list',
          content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              orphans: { type: 'array', items: { type: 'string' } },
              count: { type: 'integer' },
            },
          }}},
        },
      },
    },
  },
  '/graph/hubs': {
    get: {
      summary: 'Get hub notes',
      tags: ['graph'],
      parameters: [
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 10 },
        },
      ],
      responses: {
        '200': {
          description: 'Hub notes list',
          content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              hubs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    inlinkCount: { type: 'integer' },
                  },
                },
              },
            },
          }}},
        },
      },
    },
  },
};
