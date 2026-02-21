import { vi } from 'vitest';
import type { Request, Response } from 'express';

/**
 * Mock Response type that exposes spy methods for assertion.
 *
 * @example
 * ```ts
 * const res = createMockResponse();
 * someHandler(req, res);
 * expect(res.status).toHaveBeenCalledWith(200);
 * expect(res.json).toHaveBeenCalledWith({ ok: true });
 * ```
 */
export type MockResponse = Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
};

/**
 * Create a minimal Express Request mock.
 *
 * Defaults to empty params, query, body, and headers.
 * Use `overrides` to set specific values.
 *
 * @example
 * ```ts
 * const req = createMockRequest({
 *   params: { path: 'notes/test.md' },
 *   headers: { 'content-type': 'text/markdown' },
 * });
 * ```
 */
export function createMockRequest(overrides?: Partial<Request>): Request {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as Request;
}

/**
 * Create a chainable Express Response mock.
 *
 * Methods (status, json, send, set, type) return `this`
 * for chaining, matching Express behavior.
 *
 * @example
 * ```ts
 * const res = createMockResponse();
 * handler(req, res);
 *
 * expect(res.status).toHaveBeenCalledWith(404);
 * expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
 * ```
 */
export function createMockResponse(): MockResponse {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res as unknown as MockResponse;
}
