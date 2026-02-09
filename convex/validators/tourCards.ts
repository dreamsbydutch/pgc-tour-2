import { v } from "convex/values";
import type { ValidateTourCardDataInput } from "../types/tourCards";
import type { ValidationResult } from "../types/types";

export const tourCardsValidators = {
  args: {
    createTourCards: {
      data: v.object({
        memberId: v.optional(v.id("members")),

        displayName: v.string(),
        tourId: v.id("tours"),
        seasonId: v.id("seasons"),

        earnings: v.number(),
        points: v.number(),
        wins: v.optional(v.number()),
        topTen: v.number(),
        topFive: v.optional(v.number()),
        madeCut: v.number(),
        appearances: v.number(),
        playoff: v.optional(v.number()),
        currentPosition: v.optional(v.string()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
        }),
      ),
    },
    getTourCards: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("tourCards")),
          memberId: v.optional(v.id("members")),
          clerkId: v.optional(v.string()),
          seasonId: v.optional(v.id("seasons")),
          tourId: v.optional(v.id("tours")),
        }),
      ),
    },
    getActiveMembersMissingTourCards: {
      seasonId: v.id("seasons"),
      previousSeasonId: v.optional(v.id("seasons")),
    },
    getCurrentYearTourCard: {
      options: v.object({
        clerkId: v.string(),
        year: v.number(),
      }),
    },
    getReservedTourSpotsForSeason: {
      options: v.object({
        seasonId: v.id("seasons"),
      }),
    },
    updateTourCards: {
      id: v.id("tourCards"),
      data: v.object({
        displayName: v.optional(v.string()),
        earnings: v.optional(v.number()),
        points: v.optional(v.number()),
        wins: v.optional(v.number()),
        topTen: v.optional(v.number()),
        topFive: v.optional(v.number()),
        madeCut: v.optional(v.number()),
        appearances: v.optional(v.number()),
        playoff: v.optional(v.number()),
        currentPosition: v.optional(v.string()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
        }),
      ),
    },
    switchTourCards: {
      id: v.id("tourCards"),
      tourId: v.id("tours"),
    },
    deleteTourCards: {
      id: v.id("tourCards"),
    },
    recomputeTourCardsForSeasonAsAdmin: {
      seasonId: v.id("seasons"),
    },
    deleteTourCardAndFee: {
      id: v.id("tourCards"),
    },
  },
  validateTourCardData: (data: ValidateTourCardDataInput): ValidationResult => {
    const errors: string[] = [];

    if (data.displayName && data.displayName.trim().length === 0) {
      errors.push("Display name cannot be empty");
    }

    if (data.displayName && data.displayName.trim().length > 100) {
      errors.push("Display name cannot exceed 100 characters");
    }

    if (data.earnings !== undefined && data.earnings < 0) {
      errors.push("Earnings cannot be negative");
    }

    if (data.points !== undefined && data.points < 0) {
      errors.push("Points cannot be negative");
    }

    if (data.wins !== undefined && data.wins < 0) {
      errors.push("Wins cannot be negative");
    }

    if (data.topTen !== undefined && data.topTen < 0) {
      errors.push("Top ten finishes cannot be negative");
    }

    if (data.appearances !== undefined && data.appearances < 0) {
      errors.push("Appearances cannot be negative");
    }

    if (data.madeCut !== undefined && data.madeCut < 0) {
      errors.push("Made cuts cannot be negative");
    }

    return { isValid: errors.length === 0, errors };
  },
} as const;
