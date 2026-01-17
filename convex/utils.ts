/**
 * Convex Utilities
 * Utility functions for use in Convex backend functions
 */

// =============================================================================
// BATCH PROCESSING UTILITIES
// =============================================================================

/**
 * Batches async operations to avoid rate limits
 * @param items Array of items to process
 * @param batchSize Number of items to process in each batch
 * @param processor Function to process each item
 * @param delayMs Delay between batches in milliseconds
 * @returns Promise that resolves when all batches are processed
 */
export async function batchProcess<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>,
  delayMs = 50,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    await Promise.all(batch.map(processor));

    // Small delay between batches to avoid rate limits
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Batches async operations without delays (for use inside transactions)
 * @param items Array of items to process
 * @param batchSize Number of items to process in each batch
 * @param processor Function to process each item
 * @returns Promise that resolves when all batches are processed
 */
export async function batchProcessWithoutDelay<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    await Promise.all(batch.map(processor));
  }
}

/**
 * Batches async operations and returns results
 * @param items Array of items to process
 * @param batchSize Number of items to process in each batch
 * @param processor Function to process each item and return a result
 * @param delayMs Delay between batches in milliseconds
 * @returns Promise that resolves with array of results
 */
export async function batchProcessWithResults<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  delayMs = 50,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Type guard for number values
 * @param value - Value to check
 * @returns True if value is a number (excluding NaN)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

/**
 * Validates if a string is not empty after trimming
 * @param str - String to validate
 * @returns True if string is not empty
 */
export function isNonEmptyString(str: unknown): str is string {
  return typeof str === "string" && str.trim().length > 0;
}

/**
 * Validates if a value is a valid golf score
 * @param score - Score to validate
 * @returns True if valid golf score
 */
export function isValidGolfScore(score: unknown): score is number {
  return isNumber(score) && score >= -40 && score <= 99;
}

/**
 * Validates if a value is a valid hole number (1-18)
 * @param hole - Hole number to validate
 * @returns True if valid hole number
 */
export function isValidHole(hole: unknown): hole is number {
  return isNumber(hole) && Number.isInteger(hole) && hole >= 1 && hole <= 18;
}

/**
 * Validates if a value is a valid round number (1-4)
 * @param round - Round number to validate
 * @returns True if valid round number
 */
export function isValidRound(round: unknown): round is number {
  return isNumber(round) && Number.isInteger(round) && round >= 1 && round <= 4;
}

/**
 * Validates if a value is a valid tournament status
 * @param status - Status to validate
 * @returns True if valid tournament status
 */
export function isValidTournamentStatus(
  status: unknown,
): status is "upcoming" | "current" | "completed" {
  return (
    status === "upcoming" || status === "current" || status === "completed"
  );
}

// =============================================================================
// GENERAL UTILITIES
// =============================================================================

/**
 * Safely gets a nested property from an object using a dot-separated path string.
 * Returns undefined if any part of the path is missing.
 *
 * @param obj - The object to traverse
 * @param path - Dot-separated path string (e.g., 'a.b.c')
 * @returns The value at the given path, or undefined if not found
 */
export function getPath<T = unknown, R = unknown>(
  obj: T,
  path: string,
): R | undefined {
  if (!obj || typeof path !== "string" || !path) return undefined;
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && key in (acc as object)
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    ) as R | undefined;
}

/**
 * Extracts a human-readable error message from any error-like value.
 * Handles Error objects, fetch errors, and plain strings.
 *
 * @param error - The error value to extract a message from
 * @returns The error message as a string
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  } catch {
    return "Unserializable error";
  }
}

/**
 * Groups array items by a key function
 * @param array - Array to group
 * @param keyFn - Function to extract grouping key
 * @returns Object with grouped items
 */
export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/**
 * Generic sort function with type safety
 * @param items - Items to sort
 * @param key - Key to sort by
 * @param direction - Sort direction
 * @returns Sorted array
 */
export function sortItems<T>(
  items: T[],
  key: keyof T,
  direction: "asc" | "desc" = "desc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal == null || bVal == null) return 0;
    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Formats a golf score for display.
 * Returns 'E' for even (0), '+N' for positive, and '-N' for negative scores.
 *
 * @param score - The golf score as a number
 * @returns Formatted score string
 */
export function formatScore(score: number | null): string {
  if (score === 0) return "E";
  if (!score) return "-";
  if (score > 0) return `+${score}`;
  return String(score);
}

/**
 * Safe numeric conversion utility
 */
export function safeNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return isNaN(num) || !isFinite(num) ? fallback : num;
}

/**
 * Gets a golfer's tee time string for the current round from a golfer object.
 * Returns the tee time for the current round (e.g., roundOneTeeTime, roundTwoTeeTime, etc.),
 * or undefined if not found.
 *
 * @param golfer - Golfer object with round and tee time fields
 * @returns Tee time string or undefined
 */
export function getGolferTeeTime(golfer: {
  round?: number | null;
  roundOneTeeTime?: string | null;
  roundTwoTeeTime?: string | null;
  roundThreeTeeTime?: string | null;
  roundFourTeeTime?: string | null;
}): string | undefined {
  if (!golfer || typeof golfer.round !== "number") return undefined;
  const roundMap = [
    undefined,
    "roundOneTeeTime",
    "roundTwoTeeTime",
    "roundThreeTeeTime",
    "roundFourTeeTime",
  ];
  const key = roundMap[golfer.round];
  const teeTime =
    key && golfer[key as keyof typeof golfer]
      ? String(golfer[key as keyof typeof golfer])
      : undefined;
  if (!teeTime) return undefined;
  // Try to parse and format just the time part
  const date = new Date(teeTime);
  if (!isNaN(date.getTime())) {
    return date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  }
  // Fallback: try to extract time from string (e.g., "2025-07-12 15:35")
  const timeRegex = /(\d{1,2}):(\d{2})/;
  const match = timeRegex.exec(teeTime);
  if (match) {
    const hour = Number(match[1]);
    const minute = match[2];
    let period = "AM";
    let displayHour = hour;
    if (hour === 0) {
      displayHour = 12;
    } else if (hour >= 12) {
      period = "PM";
      if (hour > 12) displayHour = hour - 12;
    }
    return `${displayHour}:${minute} ${period}`;
  }
  return teeTime;
}
