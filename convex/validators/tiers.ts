import { v } from "convex/values";
import type { ValidateTierDataInput } from "../types/tiers";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

const validateTierData = (data: ValidateTierDataInput): ValidationResult => {
  const errors: string[] = [];

  const nameErr = validators.stringLength(data.name, 3, 100, "Tier name");
  if (nameErr) errors.push(nameErr);

  if (data.payouts && data.payouts.length === 0) {
    errors.push("At least one payout amount must be defined");
  }

  if (data.payouts && data.payouts.some((payout) => payout < 0)) {
    errors.push("All payout amounts must be non-negative");
  }

  if (data.points && data.points.length === 0) {
    errors.push("At least one points value must be defined");
  }

  if (data.points && data.points.some((point) => point < 0)) {
    errors.push("All points values must be non-negative");
  }

  if (
    data.payouts &&
    data.points &&
    data.payouts.length !== data.points.length
  ) {
    errors.push("Payouts and points arrays must have the same length");
  }

  if (data.minimumParticipants !== undefined && data.minimumParticipants < 1) {
    errors.push("Minimum participants must be at least 1");
  }

  if (data.maximumParticipants !== undefined && data.maximumParticipants < 1) {
    errors.push("Maximum participants must be at least 1");
  }

  if (
    data.minimumParticipants !== undefined &&
    data.maximumParticipants !== undefined &&
    data.minimumParticipants > data.maximumParticipants
  ) {
    errors.push("Minimum participants cannot exceed maximum participants");
  }

  return { isValid: errors.length === 0, errors };
};

export const tiersValidators = {
  args: {
    createTiers: {
      data: v.object({
        name: v.string(),
        seasonId: v.id("seasons"),
        payouts: v.array(v.number()),
        points: v.array(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          setActive: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeSeason: v.optional(v.boolean()),
        }),
      ),
    },

    getTiers: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("tiers")),
          ids: v.optional(v.array(v.id("tiers"))),
          filter: v.optional(
            v.object({
              seasonId: v.optional(v.id("seasons")),
              name: v.optional(v.string()),
              minPayouts: v.optional(v.number()),
              maxPayouts: v.optional(v.number()),
              minPoints: v.optional(v.number()),
              maxPoints: v.optional(v.number()),
              minParticipants: v.optional(v.number()),
              maxParticipants: v.optional(v.number()),
              hasDescription: v.optional(v.boolean()),
              searchTerm: v.optional(v.string()),
              payoutLevelsMin: v.optional(v.number()),
              payoutLevelsMax: v.optional(v.number()),
              pointLevelsMin: v.optional(v.number()),
              pointLevelsMax: v.optional(v.number()),
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
                  v.literal("totalPayouts"),
                  v.literal("totalPoints"),
                  v.literal("minimumParticipants"),
                  v.literal("maximumParticipants"),
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
              includeSeason: v.optional(v.boolean()),
              includeTournaments: v.optional(v.boolean()),
              includeStatistics: v.optional(v.boolean()),
            }),
          ),
          activeOnly: v.optional(v.boolean()),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },

    updateTiers: {
      tierId: v.id("tiers"),
      data: v.object({
        name: v.optional(v.string()),
        payouts: v.optional(v.array(v.number())),
        points: v.optional(v.array(v.number())),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeSeason: v.optional(v.boolean()),
          includeTournaments: v.optional(v.boolean()),
        }),
      ),
    },

    deleteTiers: {
      tierId: v.id("tiers"),
      options: v.optional(
        v.object({
          softDelete: v.optional(v.boolean()),
          reassignTournaments: v.optional(v.id("tiers")),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
  },

  validateTierData,
} as const;
