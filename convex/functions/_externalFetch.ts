/**
 * Production-hardened wrapper for external HTTP calls.
 *
 * Adds:
 * - Timeout via `AbortController`
 * - Retries with exponential backoff
 * - Special handling for rate limits (HTTP 429)
 * - Optional JSON-shape validation (retry when invalid)
 *
 * Intended for outbound calls from Convex actions (Clerk, DataGolf, etc.).
 */

/**
 * Configuration for {@link fetchWithRetry}.
 */
export type FetchWithRetryConfig = {
  /**
   * Abort the request after this many milliseconds.
   *
   * @defaultValue 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Number of retries after the initial attempt.
   *
   * Total attempts = `retries + 1`.
   *
   * @defaultValue 3
   */
  retries?: number;

  /**
   * Base backoff delay in milliseconds.
   *
   * Backoff is exponential per attempt:
   * `delayMs = retryDelay * 2 ** attemptIndex`
   *
   * @defaultValue 1000 (1 second)
   */
  retryDelay?: number;

  /**
   * Optional JSON validator.
   *
   * If provided, JSON is parsed and then passed here.
   * - Return `true` to accept.
   * - Return `false` to treat it as a failure (and retry if retries remain).
   */
  validateResponse?: (json: unknown) => boolean;

  /**
   * Prefix for `console.*` logs emitted by this helper.
   *
   * @defaultValue "fetchWithRetry"
   */
  logPrefix?: string;
};

/**
 * Result type returned by {@link fetchWithRetry}.
 */
type FetchResult<T> =
  | {
      ok: true;
      /** Parsed JSON payload (typed by the caller via `T`). */
      data: T;
      /** Total number of attempts made (includes the initial request). */
      attempts: number;
    }
  | {
      ok: false;
      /** Human-readable error message. */
      error: string;
      /** Total number of attempts made (includes the initial request). */
      attempts: number;
    };

const DEFAULT_CONFIG: Required<Omit<FetchWithRetryConfig, "validateResponse">> =
  {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    logPrefix: "fetchWithRetry",
  };

/**
 * Fetch JSON with timeouts and retries.
 *
 * Behavior summary:
 * - Retries on network errors, timeouts, invalid JSON, validation failures, and HTTP 5xx.
 * - Treats HTTP 429 (rate limit) specially, honoring `Retry-After` when present.
 * - Does **not** retry other HTTP 4xx errors (they return immediately).
 *
 * Notes:
 * - This helper always attempts to parse the response as JSON for success responses.
 * - To validate shape beyond TypeScript types, supply `config.validateResponse`.
 *
 * @typeParam T - Expected JSON payload type.
 * @param url - Absolute or relative URL.
 * @param options - Standard `fetch` options (method, headers, body, etc.).
 * @param config - Retry/timeout/validation settings.
 * @returns A discriminated union: `{ ok: true, data, attempts }` or `{ ok: false, error, attempts }`.
 *
 * @example
 * const result = await fetchWithRetry<MyResponse>(
 *   "https://example.com/api",
 *   { headers: { Authorization: `Bearer ${token}` } },
 *   {
 *     timeout: 10_000,
 *     retries: 2,
 *     validateResponse: (json): json is MyResponse =>
 *       typeof json === "object" && json !== null && "items" in json,
 *   },
 * );
 *
 * if (!result.ok) throw new Error(result.error);
 * return result.data;
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options?: RequestInit,
  config?: FetchWithRetryConfig,
): Promise<FetchResult<T>> {
  const { timeout, retries, retryDelay, logPrefix } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const validateResponse = config?.validateResponse;

  let lastError = "";
  let attempts = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts++;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : retryDelay * 2 ** attempt * 2;

          console.warn(
            `[${logPrefix}] Rate limited (429), waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`,
          );

          if (attempt < retries) {
            await sleep(waitMs);
            continue;
          }

          lastError = `Rate limited (429) after ${attempts} attempts`;
          continue;
        }

        if (response.status >= 500) {
          const errorText = await response.text().catch(() => "");
          lastError = `Server error (${response.status}): ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;

          console.warn(
            `[${logPrefix}] ${lastError}, attempt ${attempt + 1}/${retries + 1}`,
          );

          if (attempt < retries) {
            await sleep(retryDelay * 2 ** attempt);
            continue;
          }

          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          lastError = `HTTP error (${response.status}): ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;

          return {
            ok: false,
            error: lastError,
            attempts,
          };
        }

        let json: unknown;
        try {
          json = await response.json();
        } catch (parseError) {
          lastError = `Invalid JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`;

          if (attempt < retries) {
            console.warn(
              `[${logPrefix}] ${lastError}, attempt ${attempt + 1}/${retries + 1}`,
            );
            await sleep(retryDelay * 2 ** attempt);
            continue;
          }

          return {
            ok: false,
            error: lastError,
            attempts,
          };
        }

        if (validateResponse && !validateResponse(json)) {
          lastError = "Response validation failed";

          if (attempt < retries) {
            console.warn(
              `[${logPrefix}] ${lastError}, attempt ${attempt + 1}/${retries + 1}`,
            );
            await sleep(retryDelay * 2 ** attempt);
            continue;
          }

          return {
            ok: false,
            error: lastError,
            attempts,
          };
        }

        if (attempt > 0) {
          console.log(
            `[${logPrefix}] Request succeeded after ${attempt + 1} attempts`,
          );
        }

        return {
          ok: true,
          data: json as T,
          attempts,
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          lastError = `Request timeout after ${timeout}ms`;

          console.warn(
            `[${logPrefix}] ${lastError}, attempt ${attempt + 1}/${retries + 1}`,
          );

          if (attempt < retries) {
            await sleep(retryDelay * 2 ** attempt);
            continue;
          }

          continue;
        }

        lastError = `Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;

        console.warn(
          `[${logPrefix}] ${lastError}, attempt ${attempt + 1}/${retries + 1}`,
        );

        if (attempt < retries) {
          await sleep(retryDelay * 2 ** attempt);
          continue;
        }

        continue;
      }
    } catch (unexpectedError) {
      lastError = `Unexpected error: ${unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError)}`;

      console.error(`[${logPrefix}] ${lastError}`);

      if (attempt < retries) {
        await sleep(retryDelay * 2 ** attempt);
        continue;
      }

      break;
    }
  }

  return {
    ok: false,
    error: lastError || "Request failed after all retries",
    attempts,
  };
}

/**
 * Sleep helper used for retry backoff delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
