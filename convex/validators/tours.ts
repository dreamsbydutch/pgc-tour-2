import { v } from "convex/values";
import type { ValidateTourDataInput } from "../types/tours";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

const validateTourData = (data: ValidateTourDataInput): ValidationResult => {
  const errors: string[] = [];

  const nameErr = validators.stringLength(data.name, 3, 100, "Tour name");
  if (nameErr) errors.push(nameErr);

  const shortFormErr = validators.stringLength(
    data.shortForm,
    2,
    10,
    "Short form",
  );
  if (shortFormErr) errors.push(shortFormErr);

  const buyInErr = validators.positiveNumber(data.buyIn, "Buy-in amount");
  if (buyInErr) errors.push(buyInErr);

  if (data.maxParticipants !== undefined && data.maxParticipants < 1) {
    errors.push("Maximum participants must be at least 1");
  }

  if (data.playoffSpots && data.playoffSpots.length === 0) {
    errors.push("At least one playoff spot must be defined");
  }

  if (data.playoffSpots && data.playoffSpots.some((spot) => spot < 1)) {
    errors.push("All playoff spots must be positive numbers");
  }

  const logoUrlErr = validators.url(data.logoUrl, "Logo URL");
  if (logoUrlErr) errors.push(logoUrlErr);

  return { isValid: errors.length === 0, errors };
};

export const toursValidators = {
  args: {
    createTours: {
      data: v.object({
        name: v.string(),
        shortForm: v.string(),
        logoUrl: v.string(),
        seasonId: v.id("seasons"),
        buyIn: v.number(),
        playoffSpots: v.array(v.number()),
        maxParticipants: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          setActive: v.optional(v.boolean()),
          autoCreateTourCards: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeSeason: v.optional(v.boolean()),
        }),
      ),
    },

    getTours: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("tours")),
          ids: v.optional(v.array(v.id("tours"))),
          filter: v.optional(
            v.object({
              seasonId: v.optional(v.id("seasons")),
              shortForm: v.optional(v.string()),
              minBuyIn: v.optional(v.number()),
              maxBuyIn: v.optional(v.number()),
              minParticipants: v.optional(v.number()),
              maxParticipants: v.optional(v.number()),
              hasDescription: v.optional(v.boolean()),
              searchTerm: v.optional(v.string()),
              playoffSpotsMin: v.optional(v.number()),
              playoffSpotsMax: v.optional(v.number()),
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
                  v.literal("shortForm"),
                  v.literal("buyIn"),
                  v.literal("maxParticipants"),
                  v.literal("createdAt"),
                  v.literal("updatedAt"),
                  v.literal("playoffSpots"),
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
              includeSeason: v.optional(v.boolean()),
              includeTournaments: v.optional(v.boolean()),
              includeParticipants: v.optional(v.boolean()),
              includeStatistics: v.optional(v.boolean()),
              includeTourCards: v.optional(v.boolean()),
            }),
          ),
          activeOnly: v.optional(v.boolean()),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },

    updateTours: {
      tourId: v.id("tours"),
      data: v.object({
        name: v.optional(v.string()),
        shortForm: v.optional(v.string()),
        logoUrl: v.optional(v.string()),
        buyIn: v.optional(v.number()),
        playoffSpots: v.optional(v.array(v.number())),
        maxParticipants: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          cascadeToTourCards: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeSeason: v.optional(v.boolean()),
          includeParticipants: v.optional(v.boolean()),
        }),
      ),
    },

    deleteTours: {
      tourId: v.id("tours"),
      options: v.optional(
        v.object({
          softDelete: v.optional(v.boolean()),
          cascadeDelete: v.optional(v.boolean()),
          transferParticipants: v.optional(v.id("tours")),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
  },

  validateTourData,
} as const;
