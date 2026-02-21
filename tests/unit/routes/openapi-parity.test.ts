import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PARITY_CATALOG } from '@obsidian-workspace/shared-types';
import { createOpenApiRouter } from '../../../src/routes/openapi';

describe('OpenAPI parity gate', () => {
  it('contains all REST paths declared in PARITY_CATALOG', async () => {
    const app = express();
    app.use(createOpenApiRouter());
    const res = await request(app).get('/openapi.json');
    const paths = res.body.paths as Record<string, Record<string, unknown>>;

    for (const entry of PARITY_CATALOG) {
      const pathDef = paths[entry.rest.openApiPath];
      expect(pathDef, `${entry.id} path missing`).toBeDefined();
      const methodKey = entry.rest.method.toLowerCase();
      expect(pathDef[methodKey], `${entry.id} method missing`).toBeDefined();
    }
  });
});
