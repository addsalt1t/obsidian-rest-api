import express, { Router } from 'express';
import { errorHandler } from '../../src/middleware/error';

/**
 * Express app factory for route testing.
 * Mounts the given router and attaches the error handler.
 *
 * @example
 * const testApp = createRouterTestApp(createVaultRouter(mockApp), '/vault');
 * const res = await request(testApp).get('/vault/note.md');
 */
export function createRouterTestApp(router: Router, basePath = '/'): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.text({ type: 'text/*' }));
  app.use(basePath, router);
  app.use(errorHandler);
  return app;
}
