import type { FetchResult, FetchWithRetryConfig } from "../types/externalFetch";

const DEFAULT_CONFIG: Required<Omit<FetchWithRetryConfig, "validateResponse">> =
  {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    logPrefix: "fetchWithRetry",
  };

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
