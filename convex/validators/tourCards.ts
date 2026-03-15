import { v } from "convex/values";
import { idValidators } from "./_shared";

const skipValidationOptions = v.optional(
  v.object({
    skipValidation: v.optional(v.boolean()),
  }),
);

const tourCardMutableFields = {
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
};

const tourCardCreateData = v.object({
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
});

const tourCardUpdateData = v.object({
  tourId: v.optional(v.id("tours")),
  ...tourCardMutableFields,
});

export const tourCardsValidators = {
  args: {
    createTourCards: {
      data: tourCardCreateData,
      options: skipValidationOptions,
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
      seasonId: idValidators.seasonId,
      previousSeasonId: idValidators.optionalSeasonId,
    },
    getCurrentYearTourCard: {
      options: v.object({
        clerkId: v.string(),
        year: v.number(),
      }),
    },
    getReservedTourSpotsForSeason: {
      options: v.object({
        seasonId: idValidators.seasonId,
      }),
    },
    updateTourCards: {
      id: idValidators.tourCardId,
      data: tourCardUpdateData,
      options: skipValidationOptions,
    },
    switchTourCards: {
      id: idValidators.tourCardId,
      tourId: idValidators.tourId,
    },
    deleteTourCards: {
      id: idValidators.tourCardId,
    },
    recomputeTourCardsForSeasonAsAdmin: {
      seasonId: idValidators.seasonId,
    },
    deleteTourCardAndFee: {
      id: idValidators.tourCardId,
    },
  },
} as const;
