import express, { Router } from 'express';
import { errorHandler } from '../../src/middleware/error';

/**
 * 라우트 테스트용 Express 앱 팩토리
 * 라우터를 마운트하고 에러 핸들러를 설정한다.
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
