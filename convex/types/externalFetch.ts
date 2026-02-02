export type FetchWithRetryConfig = {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  validateResponse?: (json: unknown) => boolean;
  logPrefix?: string;
};

export type FetchResult<T> =
  | {
      ok: true;
      data: T;
      attempts: number;
    }
  | {
      ok: false;
      error: string;
      attempts: number;
    };
