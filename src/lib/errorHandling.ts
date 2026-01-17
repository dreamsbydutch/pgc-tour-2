/**
 * Error handling utilities for Convex operations
 */

/**
 * Check if an error is an authorization error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("Forbidden") ||
      error.message.includes("Unauthorized") ||
      error.message.includes("permission") ||
      error.message.includes("not authorized")
    );
  }
  return false;
}

/**
 * Check if an error is a not found error
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("not found");
  }
  return false;
}

/**
 * Check if an error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("Validation failed") ||
      error.message.includes("Invalid")
    );
  }
  return false;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (isAuthError(error)) {
      if (error.message.includes("Unauthorized")) {
        return "Please sign in to continue";
      }
      if (error.message.includes("Admin")) {
        return "This action requires administrator privileges";
      }
      if (error.message.includes("Moderator")) {
        return "This action requires moderator or administrator privileges";
      }
      if (error.message.includes("own")) {
        return "You can only modify your own resources";
      }
      return "You don't have permission to perform this action";
    }

    if (isNotFoundError(error)) {
      return "The requested resource was not found";
    }

    if (isValidationError(error)) {
      return error.message.replace("Validation failed: ", "");
    }

    return error.message;
  }

  return "An unexpected error occurred";
}

/**
 * Error response type for typed error handling
 */
export interface ErrorResponse {
  isError: true;
  isAuthError: boolean;
  isNotFoundError: boolean;
  isValidationError: boolean;
  message: string;
  originalError: unknown;
}

/**
 * Parse error into structured response
 */
export function parseError(error: unknown): ErrorResponse {
  return {
    isError: true,
    isAuthError: isAuthError(error),
    isNotFoundError: isNotFoundError(error),
    isValidationError: isValidationError(error),
    message: getErrorMessage(error),
    originalError: error,
  };
}
