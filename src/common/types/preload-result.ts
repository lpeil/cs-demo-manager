/**
 * Result type for preload API operations.
 * Used to represent operations that can either succeed or fail with an error code.
 */
export type PreloadResult<T> = { success: T } | { error: { code: number } };

/**
 * Type guard to check if a PreloadResult is a success result.
 */
export function isSuccessResult<T>(result: PreloadResult<T>): result is { success: T } {
  return 'success' in result;
}

