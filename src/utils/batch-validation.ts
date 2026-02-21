import { MAX_BATCH_SIZE, ERROR_MSG } from '../constants';

interface BatchValidationResult {
  valid: boolean;
  error?: string;
  meta?: { requested: number; limit: number };
}

/**
 * Validate that the input is a non-empty array within the batch size limit.
 *
 * @param array - The input to validate (expected to be a non-empty array)
 * @param maxSize - Maximum allowed array length (defaults to MAX_BATCH_SIZE)
 * @param emptyError - Custom error message for empty/non-array input
 *                     (defaults to ERROR_MSG.PATHS_ARRAY_REQUIRED)
 * @param validateStringElements - When true, validate all elements are strings (defaults to true).
 *                                 Set to false for arrays of objects (e.g. batch write operations).
 *
 * @example
 * // In a route handler:
 * const validation = validateBatchArray(paths);
 * if (!validation.valid) {
 *   return res.status(400).json({ error: validation.error, ...validation.meta });
 * }
 */
export function validateBatchArray(
  array: unknown,
  maxSize: number = MAX_BATCH_SIZE,
  emptyError: string = ERROR_MSG.PATHS_ARRAY_REQUIRED,
  validateStringElements: boolean = true,
): BatchValidationResult {
  if (!Array.isArray(array) || array.length === 0) {
    return { valid: false, error: emptyError };
  }
  if (array.length > maxSize) {
    return {
      valid: false,
      error: `Maximum ${maxSize} files per batch`,
      meta: { requested: array.length, limit: maxSize },
    };
  }
  // Validate element types (all must be strings) — skip for object arrays (e.g. batch write ops)
  if (validateStringElements) {
    const nonStringIndex = array.findIndex(item => typeof item !== 'string');
    if (nonStringIndex !== -1) {
      return {
        valid: false,
        error: `Array element at index ${nonStringIndex} must be a string`,
      };
    }
  }
  return { valid: true };
}
