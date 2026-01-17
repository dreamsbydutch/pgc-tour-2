/**
 * Shared constants for Convex functions
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const FIFTEEN_MINUTES = 15 * MS_PER_MINUTE;

export const TIME = {
  FIFTEEN_MINUTES,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
} as const;

export const CENTS_PER_DOLLAR = 100 as const;

export const NAME_MIN = 1 as const;
export const NAME_MAX = 100 as const;
export const DESCRIPTION_MAX = 1000 as const;
export const EMAIL_MAX = 255 as const;

export const URL_PROTOCOLS = ["http:", "https:"] as const;

export const SEASON_MIN_YEAR = 2000 as const;
export const SEASON_MAX_FUTURE_YEARS = 2 as const;
