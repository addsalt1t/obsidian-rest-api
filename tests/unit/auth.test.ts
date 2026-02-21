import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, createAuthMiddleware } from '../../src/middleware/auth';

describe('timingSafeEqual', () => {
  it('should return true for identical strings', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true);
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('should return false for different strings of same length', () => {
    expect(timingSafeEqual('hello', 'hella')).toBe(false);
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqual('aaaaa', 'bbbbb')).toBe(false);
  });

  it('should return false for strings of different lengths', () => {
    expect(timingSafeEqual('short', 'longer')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('hello', 'hi')).toBe(false);
    expect(timingSafeEqual('a', '')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });
});

describe('createAuthMiddleware', () => {
  const TEST_API_KEY = 'test-api-key-12345';

  function createMockReq(authHeader?: string): Partial<Request> {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
      ip: '127.0.0.1',
    };
  }

  function createMockRes(): Partial<Response> & { statusCode?: number; body?: unknown } {
    const res: Partial<Response> & { statusCode?: number; body?: unknown } = {
      statusCode: 200,
      body: undefined,
    };
    res.status = vi.fn((code: number) => {
      res.statusCode = code;
      return res as Response;
    });
    res.json = vi.fn((data: unknown) => {
      res.body = data;
      return res as Response;
    });
    return res;
  }

  it('should call next() with valid Bearer token', () => {
    const middleware = createAuthMiddleware(() => TEST_API_KEY);
    const req = createMockReq(`Bearer ${TEST_API_KEY}`);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is missing', () => {
    const middleware = createAuthMiddleware(() => TEST_API_KEY);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual(expect.objectContaining({
      error: 'UNAUTHORIZED',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for non-Bearer scheme', () => {
    const middleware = createAuthMiddleware(() => TEST_API_KEY);
    const req = createMockReq('Basic dXNlcjpwYXNz');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual(expect.objectContaining({
      error: 'UNAUTHORIZED',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is missing after Bearer', () => {
    const middleware = createAuthMiddleware(() => TEST_API_KEY);
    const req = createMockReq('Bearer ');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual(expect.objectContaining({
      error: 'UNAUTHORIZED',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 for invalid API key', () => {
    const middleware = createAuthMiddleware(() => TEST_API_KEY);
    const req = createMockReq('Bearer wrong-api-key');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual(expect.objectContaining({
      error: 'FORBIDDEN',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 500 when configured API key is too short', () => {
    const middleware = createAuthMiddleware(() => 'short');
    const req = createMockReq('Bearer short');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual(expect.objectContaining({
      error: 'CONFIGURATION_ERROR',
      message: 'Server authentication is not properly configured',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept API key with exactly 16 characters', () => {
    const key16 = 'abcdefghijklmnop'; // exactly 16 chars
    const middleware = createAuthMiddleware(() => key16);
    const req = createMockReq(`Bearer ${key16}`);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
