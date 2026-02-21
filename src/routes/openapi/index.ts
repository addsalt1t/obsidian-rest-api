import { Router, Request, Response } from 'express';
import { openApiBase } from './base';
import { vaultPaths } from './paths-vault';
import { batchPaths } from './paths-batch';
import { searchPaths } from './paths-search';
import { metadataPaths } from './paths-metadata';
import { graphPaths } from './paths-graph';
import { otherPaths } from './paths-other';

/**
 * OpenAPI 3.0 spec generation
 * Since the REST API plugin runs within the Obsidian environment,
 * the spec is defined manually to minimize external library dependencies
 */
const openApiSpec = {
  ...openApiBase,
  paths: {
    ...vaultPaths,
    ...batchPaths,
    ...searchPaths,
    ...metadataPaths,
    ...graphPaths,
    ...otherPaths,
  },
};

// Swagger UI HTML
const swaggerUiHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Obsidian Extended REST API</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout'
    });
  </script>
</body>
</html>`;

export function createOpenApiRouter(): Router {
  const router = Router();

  // GET /openapi.json - OpenAPI spec
  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  // GET /docs - Swagger UI
  router.get('/docs', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(swaggerUiHtml);
  });

  return router;
}
