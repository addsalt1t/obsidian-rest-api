import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { asyncHandler } from '../../../src/middleware/asyncHandler';
import { errorHandler } from '../../../src/middleware/error';
import { PathValidationError } from '../../../src/utils/path-validation';

describe('asyncHandler', () => {
  function createTestApp(handler: express.RequestHandler) {
    const app = express();
    app.get('/test', handler);
    app.use(errorHandler);
    return app;
  }

  it('should pass successful async handler response', async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.json({ success: true });
    });

    const app = createTestApp(handler);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should delegate async errors to error middleware with 500', async () => {
    const handler = asyncHandler(async () => {
      throw new Error('Something went wrong');
    });

    const app = createTestApp(handler);
    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Internal server error');
  });

  it('should delegate PathValidationError to error middleware with 400', async () => {
    const handler = asyncHandler(async () => {
      throw new PathValidationError('../etc/passwd');
    });

    const app = createTestApp(handler);
    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
  });

  it('should delegate non-Error throws to error middleware', async () => {
    const handler = asyncHandler(async () => {
      throw 'string error';
    });

    const app = createTestApp(handler);
    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });

  it('should delegate rejected promises to error middleware', async () => {
    const handler = asyncHandler(async () => {
      return Promise.reject(new Error('Promise rejected'));
    });

    const app = createTestApp(handler);
    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Internal server error');
  });
});
