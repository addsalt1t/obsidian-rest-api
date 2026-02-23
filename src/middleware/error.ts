/**
 * Standardized error handling middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { PathValidationError } from '../utils/path-validation';

const logger = createLogger('Error');

/**
 * API error response interface.
 */
interface ApiErrorResponse {
  error: string;      // Error code (e.g., 'VALIDATION_ERROR')
  message: string;    // Human-readable message
  details?: unknown;  // Additional details
}

/**
 * API error class.
 */
class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toResponse(): ApiErrorResponse {
    const response: ApiErrorResponse = {
      error: this.code,
      message: this.message,
    };
    if (this.details !== undefined) {
      response.details = this.details;
    }
    return response;
  }
}

/**
 * Commonly used error factory functions.
 */
export const Errors = {
  notFound(resource: string, details?: unknown): ApiError {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`, details);
  },

  badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  },

  validationError(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  },

  unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  },

  forbidden(message = 'Forbidden', details?: unknown): ApiError {
    return new ApiError(403, 'FORBIDDEN', message, details);
  },

  internal(message = 'Internal server error', details?: unknown): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message, details);
  },

  invalidQuery(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'INVALID_QUERY', message, details);
  },

  conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'CONFLICT', message, details);
  },

  pluginNotEnabled(pluginName: string): ApiError {
    return new ApiError(400, 'PLUGIN_NOT_ENABLED', `${pluginName} plugin is not installed or enabled`);
  },
};

/**
 * Express error handling middleware.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ApiError case
  if (err instanceof ApiError) {
    res.status(err.statusCode).json(err.toResponse());
    return;
  }

  // PathValidationError case (path traversal attempt)
  if (err instanceof PathValidationError) {
    logger.warn('Path traversal attempt blocked');
    res.status(err.statusCode).json({
      error: 'PATH_VALIDATION_ERROR',
      message: err.message,
    });
    return;
  }

  // Body parser SyntaxError (malformed JSON)
  if (err instanceof SyntaxError && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: 'INVALID_QUERY',
      message: 'Malformed JSON in request body',
    });
    return;
  }

  // Generic error case -- prevent internal info leakage (check logger for details)
  const errorName = err?.name || 'Error';
  logger.error(`[${req.method} ${req.path}] Internal error (${errorName})`);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
}
