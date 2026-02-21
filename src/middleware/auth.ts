import { timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ERROR_CODE, ERROR_MSG, AUTH_SCHEME, MIN_API_KEY_LENGTH } from '../constants';
import { createLogger } from '../utils/logger';

const logger = createLogger('Auth');

/**
 * Constant-time string comparison using Node.js crypto.
 * Obsidian runs in Electron which has full Node.js crypto access.
 *
 * Compares strings of different lengths in constant time to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    // Compare against self to maintain constant time
    cryptoTimingSafeEqual(bufA, bufA);
    return false;
  }
  return cryptoTimingSafeEqual(bufA, bufB);
}

export function createAuthMiddleware(getApiKey: () => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn('Missing authorization header from %s', req.ip);
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_CODE.UNAUTHORIZED,
        message: ERROR_MSG.AUTH_HEADER_REQUIRED,
      });
      return;
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== AUTH_SCHEME || !token) {
      logger.warn('Invalid authorization format from %s', req.ip);
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: ERROR_CODE.UNAUTHORIZED,
        message: ERROR_MSG.INVALID_AUTH_FORMAT,
      });
      return;
    }

    const apiKey = getApiKey();
    if (apiKey.length < MIN_API_KEY_LENGTH) {
      logger.error('API key too short - configure a key of at least %d characters', MIN_API_KEY_LENGTH);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'CONFIGURATION_ERROR',
        message: 'Server authentication is not properly configured',
      });
      return;
    }
    if (!timingSafeEqual(token, apiKey)) {
      logger.warn('Authentication failed from %s', req.ip);
      res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_CODE.FORBIDDEN,
        message: ERROR_MSG.INVALID_API_KEY,
      });
      return;
    }

    next();
  };
}
