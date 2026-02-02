import { v } from "convex/values";
import { TIME } from "../functions/_constants";
import type { ValidateSeasonDataInput } from "../types/seasons";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

const validateSeasonData = (
  data: ValidateSeasonDataInput,
): ValidationResult => {
  const errors: string[] = [];

  const currentYear = new Date().getFullYear();

  const yearErr = validators.numberRange(
    data.year,
    2020,
    currentYear + 5,
    "Season year",
  );
  if (yearErr) errors.push(yearErr);

  const numberErr = validators.numberRange(data.number, 1, 10, "Season number");
  if (numberErr) errors.push(numberErr);

  if (data.startDate && data.endDate && data.startDate >= data.endDate) {
    errors.push("Season start date must be before end date");
  }

  if (
    data.registrationDeadline &&
    data.endDate &&
    data.registrationDeadline > data.endDate
  ) {
    errors.push("Registration deadline must be on or before season end date");
  }

  const now = Date.now();
  if (data.endDate && data.endDate < now - 365 * TIME.MS_PER_DAY) {
    errors.push("Season end date cannot be more than 1 year in the past");
  }

  return { isValid: errors.length === 0, errors };
};

export const seasonsValidators = {
  args: {
    getStandingsViewData: {
      seasonId: v.id("seasons"),
    },

    createSeasons: {
      data: v.object({
        year: v.number(),
        number: v.number(),
        startDate: v.optional(v.number()),
        endDate: v.optional(v.number()),
        registrationDeadline: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTours: v.optional(v.boolean()),
        }),
      ),
    },

    getSeasons: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("seasons")),
          ids: v.optional(v.array(v.id("seasons"))),
          filter: v.optional(
            v.object({
              year: v.optional(v.number()),
              minYear: v.optional(v.number()),
              maxYear: v.optional(v.number()),
              number: v.optional(v.number()),
              name: v.optional(v.string()),
              hasDescription: v.optional(v.boolean()),
              startAfter: v.optional(v.number()),
              startBefore: v.optional(v.number()),
              endAfter: v.optional(v.number()),
              endBefore: v.optional(v.number()),
              searchTerm: v.optional(v.string()),
              isUpcoming: v.optional(v.boolean()),
              isCompleted: v.optional(v.boolean()),
              createdAfter: v.optional(v.number()),
              createdBefore: v.optional(v.number()),
              updatedAfter: v.optional(v.number()),
              updatedBefore: v.optional(v.number()),
            }),
          ),
          sort: v.optional(
            v.object({
              sortBy: v.optional(
                v.union(
                  v.literal("name"),
                  v.literal("year"),
                  v.literal("startDate"),
                  v.literal("endDate"),
                  v.literal("createdAt"),
                  v.literal("updatedAt"),
                ),
              ),
              sortOrder: v.optional(
                v.union(v.literal("asc"), v.literal("desc")),
              ),
            }),
          ),
          pagination: v.optional(
            v.object({
              limit: v.optional(v.number()),
              offset: v.optional(v.number()),
            }),
          ),
          enhance: v.optional(
            v.object({
              includeTours: v.optional(v.boolean()),
              includeTournaments: v.optional(v.boolean()),
              includeMembers: v.optional(v.boolean()),
              includeStatistics: v.optional(v.boolean()),
              includeTotals: v.optional(v.boolean()),
            }),
          ),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },

    updateSeasons: {
      seasonId: v.id("seasons"),
      data: v.object({
        year: v.optional(v.number()),
        number: v.optional(v.number()),
        startDate: v.optional(v.number()),
        endDate: v.optional(v.number()),
        registrationDeadline: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTours: v.optional(v.boolean()),
          includeTournaments: v.optional(v.boolean()),
        }),
      ),
    },

    deleteSeasons: {
      seasonId: v.id("seasons"),
      options: v.optional(
        v.object({
          cascadeDelete: v.optional(v.boolean()),
          migrateToSeason: v.optional(v.id("seasons")),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
  },

  validateSeasonData,
} as const;
