/**
 * Metadata-related OpenAPI path definitions
 */
import { createFieldsQueryParameter, createJsonRefResponse } from './common';

export const metadataPaths = {
  '/metadata/{path}': {
    get: {
      summary: 'Get unified metadata',
      tags: ['metadata'],
      parameters: [
        {
          name: 'path',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        createFieldsQueryParameter(['frontmatter', 'tags', 'links', 'backlinks', 'stat']),
      ],
      responses: {
        '200': createJsonRefResponse('Unified metadata', '#/components/schemas/UnifiedMetadata'),
        '404': { description: 'File not found' },
      },
    },
  },
};
