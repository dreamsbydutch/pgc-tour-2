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

export const EXCLUDED_GOLFER_IDS = new Set([18417]);

export const GROUP_LIMITS = {
  GROUP_1: { percentage: 0.1, maxCount: 10 },
  GROUP_2: { percentage: 0.175, maxCount: 16 },
  GROUP_3: { percentage: 0.225, maxCount: 22 },
  GROUP_4: { percentage: 0.25, maxCount: 30 },
} as const;

export const MAX_PRETOURNAMENT_LEADTIME = 3 * 24 * 60 * 60 * 1000;
