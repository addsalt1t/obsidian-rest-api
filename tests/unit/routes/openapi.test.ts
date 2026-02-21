import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createOpenApiRouter } from '../../../src/routes/openapi';
import { createSearchPaginationScopeParameters } from '../../../src/routes/openapi/common';

describe('OpenAPI router', () => {
  it('should build search pagination/scope parameters in stable order', () => {
    const params = createSearchPaginationScopeParameters();
    expect(params.map((p) => p.name)).toEqual(['limit', 'offset', 'basePath']);
  });

  it('should expose limit/offset/basePath for search endpoints', async () => {
    const app = express();
    app.use(createOpenApiRouter());

    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);

    const paths = res.body.paths as Record<string, any>;
    const searchParams = paths['/search/'].post.parameters as Array<{ name: string }>;
    const simpleParams = paths['/search/simple/'].post.parameters as Array<{ name: string }>;
    const globParams = paths['/search/glob/'].post.parameters as Array<{ name: string }>;

    expect(searchParams.map((p) => p.name)).toEqual(
      expect.arrayContaining(['limit', 'offset', 'basePath', 'exactCount'])
    );
    expect(simpleParams.map((p) => p.name)).toEqual(
      expect.arrayContaining(['query', 'limit', 'offset', 'basePath'])
    );
    expect(globParams.map((p) => p.name)).toEqual(
      expect.arrayContaining(['pattern', 'limit', 'offset', 'basePath'])
    );
  });

  it('should keep periodic and vault patch parameters intact', async () => {
    const app = express();
    app.use(createOpenApiRouter());

    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);

    const paths = res.body.paths as Record<string, any>;
    const periodicPatchParams = paths['/periodic/{period}'].patch.parameters as Array<{ name: string }>;
    const vaultPatchParams = paths['/vault/{path}'].patch.parameters as Array<{ name: string }>;

    expect(periodicPatchParams.map((p) => p.name)).toEqual(
      expect.arrayContaining(['period', 'year', 'month', 'day', 'target', 'Operation', 'Target-Type'])
    );
    expect(vaultPatchParams.map((p) => p.name)).toEqual(
      expect.arrayContaining(['path', 'target', 'resolve', 'Operation', 'Target-Type'])
    );
  });
});
