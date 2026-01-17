import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

export function formatRank(position: number): string {
  const suffix = ["th", "st", "nd", "rd"][position % 10] || "th";
  if (position >= 11 && position <= 13) return `${position}th`;
  return `${position}${suffix}`;
}
export function getTournamentTimeline<
  T extends {
    _id: string;
    startDate: number;
    endDate: number;
  },
>(tournaments: T[]) {
  const now = Date.now();
  const sorted = tournaments.sort((a, b) => a.startDate - b.startDate);

  const past = sorted.filter((t) => t.endDate < now);
  const current = sorted.find((t) => t.startDate <= now && t.endDate >= now);
  const future = sorted.filter((t) => t.startDate > now);

  return {
    all: sorted,
    past,
    current,
    future,
  };
}
export function formatScore(score: number | null): string {
  if (score === null) return "E";
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return score.toString();
}

export function hasItems<T>(array: T[] | null | undefined): array is T[] {
  return Array.isArray(array) && array.length > 0;
}

export function isNonEmptyString(
  str: string | null | undefined,
): str is string {
  return typeof str === "string" && str.trim().length > 0;
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function formatTournamentDateRange(
  startDate: number,
  endDate: number,
): string {
  const start = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(startDate);

  const end = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(endDate);

  return `${start} - ${end}`;
}

const DATAGOLF_BASE_URL = "https://feeds.datagolf.com/";

/**
 * Fetches data from the DataGolf API with proper error handling and caching.
 * Adds a cache-busting `_t` query param.
 * Adapted for Convex environment.
 *
 * @param endpoint - The DataGolf API endpoint (e.g., "preds/live-hole-stats")
 * @param params - Optional query parameters as an object
 * @param apiKey - DataGolf API key (usually from environment)
 * @returns Parsed JSON data from the API
 * @throws Error if the request fails or the API key is missing
 */
export async function fetchDataGolf(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  apiKey?: string,
): Promise<unknown> {
  if (!apiKey) {
    throw new Error("Missing DataGolf API key (EXTERNAL_DATA_API_KEY)");
  }

  const url = new URL(endpoint, DATAGOLF_BASE_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("_t", Date.now().toString());

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      url.searchParams.set(k, String(v));
    }
  }

  console.log(`🌐 Fetching DataGolf API: ${endpoint}`, {
    timestamp: new Date().toISOString(),
    url: url.toString().replace(apiKey, "[REDACTED]"),
  });

  const res = await fetch(url.toString(), {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "User-Agent": "PGC-Tour-App/1.0",
    },
  });

  if (!res.ok) {
    console.error(`❌ DataGolf API error: ${res.status} ${res.statusText}`, {
      endpoint,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    });
    throw new Error(`DataGolf API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as unknown;
  console.log(`✅ DataGolf API success: ${endpoint}`, {
    timestamp: new Date().toISOString(),
    dataSize: JSON.stringify(data).length,
  });

  return data;
}

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
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
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
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Type guard for number values
 * @param value - Value to check
 * @returns True if value is a number (excluding NaN)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
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
