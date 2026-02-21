/**
 * Search-related OpenAPI path definitions
 * Includes: search (JsonLogic/DQL), search/simple, search/glob, tags
 */
import {
  createJsonResponse,
  createSearchPaginationScopeParameters,
} from './common';

const searchQueryParameter = {
  name: 'query',
  in: 'query',
  required: false,
  schema: { type: 'string' },
  description: 'Search text (also accepted in request body)',
};

const searchPatternParameter = {
  name: 'pattern',
  in: 'query',
  required: false,
  schema: { type: 'string' },
  description: 'Glob pattern (also accepted in request body)',
};

const exactCountParameter = {
  name: 'exactCount',
  in: 'query',
  schema: { type: 'boolean', default: false },
  description: 'Scan all files for exact total (disables early termination)',
};

export const searchPaths = {
  '/search/': {
    post: {
      summary: 'JsonLogic or Dataview DQL search',
      tags: ['search'],
      description: 'Content-Type determines query type: application/vnd.olrapi.jsonlogic+json for JsonLogic, application/vnd.olrapi.dataview.dql+txt for Dataview DQL, application/json for JsonLogic (default)',
      parameters: createSearchPaginationScopeParameters([exactCountParameter]),
      requestBody: {
        required: true,
        content: {
          'application/vnd.olrapi.jsonlogic+json': {
            schema: { type: 'object', description: 'JsonLogic query rule' },
          },
          'application/json': {
            schema: { type: 'object', description: 'JsonLogic query rule (default)' },
          },
          'application/vnd.olrapi.dataview.dql+txt': {
            schema: { type: 'string', description: 'Dataview DQL query string' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Search results (format depends on Content-Type)',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    type: 'object',
                    description: 'JsonLogic result',
                    properties: {
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            path: { type: 'string' },
                            result: {},
                          },
                        },
                      },
                      total: { type: 'integer' },
                      limit: { type: 'integer' },
                      offset: { type: 'integer' },
                      hasMore: { type: 'boolean', description: 'More results available (early termination)' },
                      scanned: { type: 'integer', description: 'Files scanned before early termination' },
                      totalFiles: { type: 'integer', description: 'Total target files' },
                    },
                  },
                  {
                    type: 'object',
                    description: 'Dataview DQL result',
                    properties: {
                      type: { type: 'string', enum: ['table', 'list', 'task'] },
                      results: { type: 'array' },
                      truncated: { type: 'boolean' },
                      totalCount: { type: 'integer' },
                      limit: { type: 'integer' },
                    },
                  },
                ],
              },
            },
          },
        },
        '400': { description: 'Invalid query or unsupported Content-Type' },
      },
    },
  },
  '/search/simple/': {
    post: {
      summary: 'Text search in file contents',
      tags: ['search'],
      parameters: [
        searchQueryParameter,
        ...createSearchPaginationScopeParameters(),
      ],
      requestBody: {
        description: 'Alternative: pass query in JSON body',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search text' },
                basePath: { type: 'string', description: 'Restrict search to folder path' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Search results with matches and scores',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        score: { type: 'number' },
                        matches: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              line: { type: 'integer', description: '1-based line number' },
                              context: { type: 'string' },
                              match: {
                                type: 'object',
                                properties: {
                                  start: { type: 'integer' },
                                  end: { type: 'integer' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  total: { type: 'integer' },
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                },
              },
            },
          },
        },
        '400': { description: 'Query is required' },
      },
    },
  },
  '/search/glob/': {
    post: {
      summary: 'Search files by glob pattern',
      tags: ['search'],
      parameters: [
        searchPatternParameter,
        ...createSearchPaginationScopeParameters(),
      ],
      requestBody: {
        description: 'Alternative: pass pattern in JSON body',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                pattern: { type: 'string', description: 'Glob pattern (e.g., folder/*.md, **/*.md)' },
                basePath: { type: 'string', description: 'Restrict search to folder path' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Matching file paths',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                      },
                    },
                  },
                  total: { type: 'integer' },
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                },
              },
            },
          },
        },
        '400': { description: 'Pattern is required' },
      },
    },
  },
  '/tags': {
    get: {
      summary: 'Get all tags',
      tags: ['tags'],
      parameters: [
        { name: 'prefix', in: 'query', schema: { type: 'string' }, description: 'Filter tags by prefix' },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Substring search' },
        { name: 'limit', in: 'query', schema: { type: 'integer' }, description: 'Max results' },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['name', 'count'] }, description: 'Sort order' },
      ],
      responses: {
        '200': createJsonResponse('Tag list with counts', {
          tags: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tag: { type: 'string' },
                count: { type: 'integer' },
              },
            },
          },
        }),
      },
    },
  },
  '/tags/{tag}/files': {
    get: {
      summary: 'Get files by tag',
      tags: ['tags'],
      parameters: [
        { name: 'tag', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
      ],
      responses: {
        '200': {
          description: 'Files containing the tag',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  tag: { type: 'string' },
                  totalCount: { type: 'integer' },
                  count: { type: 'integer' },
                  offset: { type: 'integer' },
                  limit: { type: 'integer' },
                  hasMore: { type: 'boolean' },
                  files: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        name: { type: 'string' },
                      },
                      required: ['path', 'name'],
                    },
                  },
                },
                required: ['tag', 'totalCount', 'count', 'offset', 'limit', 'hasMore', 'files'],
              },
            },
          },
        },
      },
    },
  },
  '/dataview/query': {
    post: {
      summary: 'Execute Dataview DQL query (any type)',
      tags: ['dataview'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string', description: 'Dataview DQL query string' },
              },
            },
          },
        },
      },
      responses: {
        '200': createJsonResponse('Query result', {
          type: { type: 'string', enum: ['table', 'list', 'task'] },
          values: { type: 'array' },
          headers: { type: 'array', items: { type: 'string' }, description: 'Column headers (TABLE only)' },
          truncated: { type: 'boolean' },
          totalCount: { type: 'integer' },
          limit: { type: 'integer' },
        }),
        '400': { description: 'Invalid query or Dataview plugin not available' },
      },
    },
  },
  '/dataview/list': {
    post: {
      summary: 'Execute Dataview LIST query',
      tags: ['dataview'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string', description: 'Dataview LIST query' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'LIST query result' },
        '400': { description: 'Invalid query type (must start with LIST)' },
      },
    },
  },
  '/dataview/table': {
    post: {
      summary: 'Execute Dataview TABLE query',
      tags: ['dataview'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string', description: 'Dataview TABLE query' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'TABLE query result (includes headers)' },
        '400': { description: 'Invalid query type (must start with TABLE)' },
      },
    },
  },
  '/dataview/task': {
    post: {
      summary: 'Execute Dataview TASK query',
      tags: ['dataview'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['query'],
              properties: {
                query: { type: 'string', description: 'Dataview TASK query' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'TASK query result' },
        '400': { description: 'Invalid query type (must start with TASK)' },
      },
    },
  },
};
