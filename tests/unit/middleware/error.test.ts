import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Errors, errorHandler } from '../../../src/middleware/error';
import { PathValidationError } from '../../../src/utils/path-validation';

describe('Error Middleware', () => {
  describe('Errors factory', () => {
    it('should create notFound error', () => {
      const err = Errors.notFound('File');

      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('File not found');
    });

    it('should create notFound error with details', () => {
      const err = Errors.notFound('File', { path: '/test.md' });

      expect(err.statusCode).toBe(404);
      const response = err.toResponse();
      expect(response.details).toEqual({ path: '/test.md' });
    });

    it('should create badRequest error', () => {
      const err = Errors.badRequest('Invalid input');

      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('BAD_REQUEST');
      expect(err.message).toBe('Invalid input');
    });

    it('should create validationError', () => {
      const err = Errors.validationError('Field required', { field: 'name' });

      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.toResponse().details).toEqual({ field: 'name' });
    });

    it('should create unauthorized error', () => {
      const err = Errors.unauthorized();

      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    it('should create unauthorized error with custom message', () => {
      const err = Errors.unauthorized('Token expired');

      expect(err.message).toBe('Token expired');
    });

    it('should create forbidden error', () => {
      const err = Errors.forbidden();

      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });

    it('should create internal error', () => {
      const err = Errors.internal();

      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('INTERNAL_ERROR');
    });

    it('should create internal error with details', () => {
      const err = Errors.internal('Database error', { query: 'SELECT *' });

      expect(err.message).toBe('Database error');
      expect(err.toResponse().details).toEqual({ query: 'SELECT *' });
    });

    it('should create pluginNotEnabled error', () => {
      const err = Errors.pluginNotEnabled('Dataview');

      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('PLUGIN_NOT_ENABLED');
      expect(err.message).toContain('Dataview');
    });

    it('should create invalidQuery error', () => {
      const err = Errors.invalidQuery('Not a valid expression');

      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_QUERY');
      expect(err.message).toBe('Not a valid expression');
    });

    it('should create invalidQuery error with details', () => {
      const err = Errors.invalidQuery('Structural error', { reason: 'bad op' });

      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_QUERY');
      expect(err.toResponse().details).toEqual({ reason: 'bad op' });
    });
  });

  describe('errorHandler middleware', () => {
    function createTestApp(errorToThrow: Error) {
      const app = express();

      app.get('/error', () => {
        throw errorToThrow;
      });

      app.use(errorHandler);

      return app;
    }

    it('should handle ApiError', async () => {
      const apiError = Errors.notFound('Resource');
      const app = createTestApp(apiError);

      const res = await request(app).get('/error');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Resource not found');
    });

    it('should handle PathValidationError', async () => {
      const pathError = new PathValidationError('../etc/passwd');
      const app = createTestApp(pathError);

      const res = await request(app).get('/error');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PATH_VALIDATION_ERROR');
      // Security: response should NOT contain user-supplied path (CWE-209)
      expect(res.body.message).not.toContain('../etc/passwd');
      expect(res.body.message).toContain('path traversal');
    });

    it('should handle generic Error with masked message', async () => {
      const genericError = new Error('Something went wrong');
      const app = createTestApp(genericError);

      const res = await request(app).get('/error');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
      expect(res.body.message).toBe('Internal server error');
    });

    it('should handle error without message', async () => {
      const errorWithoutMessage = new Error();
      const app = createTestApp(errorWithoutMessage);

      const res = await request(app).get('/error');

      expect(res.status).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should handle body parser SyntaxError as 400 INVALID_QUERY', async () => {
      const syntaxError = new SyntaxError('Unexpected token');
      Object.assign(syntaxError, { type: 'entity.parse.failed' });
      const app = createTestApp(syntaxError);

      const res = await request(app).get('/error');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUERY');
      expect(res.body.message).toBe('Malformed JSON in request body');
    });

    it('should handle non-body-parser SyntaxError as 500', async () => {
      const syntaxError = new SyntaxError('Unexpected token');
      const app = createTestApp(syntaxError);

      const res = await request(app).get('/error');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });
});
