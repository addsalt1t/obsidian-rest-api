import type { Request } from 'express';
import { normalizePath } from 'obsidian';
import { ERROR_MSG } from '../../constants';
import { Errors } from '../../middleware/error';
import { validatePath } from '../../utils/path-validation';

interface ResolveVaultPathOptions {
  required?: boolean;
}

interface VaultPathResponse {
  message: string;
  path: string;
}

export function extractRequestPath(req: Request): string {
  const raw = (req.params as Record<string, unknown>).path ?? req.params[0];
  if (Array.isArray(raw)) {
    return raw.join('/');
  }

  return typeof raw === 'string' ? raw : '';
}

export function resolveValidatedVaultPath(
  req: Request,
  options: ResolveVaultPathOptions = {},
): { requestPath: string; normalizedPath: string } {
  const requestPath = extractRequestPath(req);
  if (!requestPath) {
    if (options.required) {
      throw Errors.badRequest(ERROR_MSG.PATH_REQUIRED);
    }
    return { requestPath: '', normalizedPath: '' };
  }

  validatePath(requestPath);
  return { requestPath, normalizedPath: normalizePath(requestPath) };
}

export function buildVaultPathResponse(
  message: string,
  path: string,
): VaultPathResponse {
  return { message, path };
}
