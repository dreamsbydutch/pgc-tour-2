/**
 * Shared utilities for Convex functions.
 *
 * processData: Generic filtering, sorting, pagination
 * formatCents: Convert cents to dollar strings
 * sumArray: Generic array summation
 * dateUtils: Date/time calculations
 * normalize: String normalization (email, names)
 * validators: Common validation patterns
 */

import type { ProcessDataOptions } from "../types/functionUtils";
import { MS_PER_DAY, CENTS_PER_DOLLAR } from "./_constants";

/**
 * Generic data processing utility for filtering, sorting, and pagination.
 *
 * Many CRUD modules share this exact pattern; keeping it centralized reduces drift.
 */
export function processData<T>(
  data: T[],
  options: ProcessDataOptions<T> = {},
): T[] {
  let result = [...data];

  if (options.filter) {
    result = result.filter(options.filter);
  }

  if (options.sort) {
    result.sort(options.sort);
  }

  if (options.skip) {
    result = result.slice(options.skip);
  }
  if (options.limit) {
    result = result.slice(0, options.limit);
  }

  return result;
}

/**
 * Format cents as dollars with 2 decimal places
 */
export function formatCents(cents: number): string {
  return `$${(cents / CENTS_PER_DOLLAR).toFixed(2)}`;
}

/**
 * Generic array sum helper
 */
export function sumArray(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0);
}

export const dateUtils = {
  /**
   * Calculate days between two timestamps
   */
  daysBetween(startMs: number, endMs: number): number {
    return Math.floor((endMs - startMs) / MS_PER_DAY);
  },

  /**
   * Calculate days until a future timestamp
   */
  daysUntil(futureMs: number): number {
    return Math.floor((futureMs - Date.now()) / MS_PER_DAY);
  },

  /**
   * Calculate days since a past timestamp
   */
  daysSince(pastMs: number): number {
    return Math.floor((Date.now() - pastMs) / MS_PER_DAY);
  },
} as const;

export const normalize = {
  /**
   * Normalize email to lowercase and trim
   */
  email(email: string): string {
    return email.trim().toLowerCase();
  },

  /**
   * Normalize name by trimming and collapsing whitespace
   */
  name(name: string): string {
    return name.trim().replace(/\s+/g, " ");
  },
} as const;

export const validators = {
  stringLength: (
    str: string | undefined,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (!str) return null;
    const trimmed = str.trim();
    if (trimmed.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    if (trimmed.length > max) {
      return `${fieldName} cannot exceed ${max} characters`;
    }
    return null;
  },

  numberRange: (
    num: number | undefined,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (num === undefined) return null;
    if (num < min || num > max) {
      return `${fieldName} must be between ${min} and ${max}`;
    }
    return null;
  },

  url: (url: string | undefined, fieldName: string): string | null => {
    if (!url) return null;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return `${fieldName} must be a valid HTTP/HTTPS URL`;
    }
    return null;
  },

  positiveNumber: (
    num: number | undefined,
    fieldName: string,
  ): string | null => {
    if (num === undefined) return null;
    if (num < 0) {
      return `${fieldName} cannot be negative`;
    }
    return null;
  },
};
