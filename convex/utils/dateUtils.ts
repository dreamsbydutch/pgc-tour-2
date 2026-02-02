import { MS_PER_DAY } from "../functions/_constants";

export const dateUtils = {
  daysBetween(startMs: number, endMs: number): number {
    return Math.floor((endMs - startMs) / MS_PER_DAY);
  },

  daysUntil(futureMs: number): number {
    return Math.floor((futureMs - Date.now()) / MS_PER_DAY);
  },

  daysSince(pastMs: number): number {
    return Math.floor((Date.now() - pastMs) / MS_PER_DAY);
  },
} as const;
