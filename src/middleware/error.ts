/**
 * 표준화된 에러 처리 미들웨어
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { PathValidationError } from '../utils/path-validation';

const logger = createLogger('Error');

/**
 * API 에러 응답 인터페이스
 */
interface ApiErrorResponse {
  error: string;      // 에러 코드 (예: 'VALIDATION_ERROR')
  message: string;    // 사람이 읽을 수 있는 메시지
  details?: unknown;  // 추가 세부 정보
}

/**
 * API 에러 클래스
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
 * 자주 사용되는 에러 팩토리 함수
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

  forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
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
 * Express 에러 핸들링 미들웨어
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ApiError인 경우
  if (err instanceof ApiError) {
    res.status(err.statusCode).json(err.toResponse());
    return;
  }

  // PathValidationError인 경우 (path traversal 시도)
  if (err instanceof PathValidationError) {
    logger.warn(`Path traversal attempt: ${err.path}`);
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

  // 일반 에러인 경우 — 내부 정보 유출 방지 (상세 에러는 logger에서 확인)
  logger.error(`[${req.method} ${req.path}] Error:`, err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
}

