import { v } from "convex/values";

export const idValidators = {
  tournamentId: v.id("tournaments"),
  optionalTournamentId: v.optional(v.id("tournaments")),
  tourCardId: v.id("tourCards"),
  seasonId: v.id("seasons"),
  optionalSeasonId: v.optional(v.id("seasons")),
  tourId: v.id("tours"),
  memberId: v.id("members"),
} as const;

export const sharedArgs = {
  none: {},
  tournamentId: {
    tournamentId: idValidators.tournamentId,
  },
  optionalTournamentId: {
    tournamentId: idValidators.optionalTournamentId,
  },
  clerkId: {
    clerkId: v.string(),
  },
} as const;

export const sortOrderValidator = v.union(v.literal("asc"), v.literal("desc"));

export const paginationValidator = v.object({
  limit: v.optional(v.number()),
  offset: v.optional(v.number()),
});

export const teeTimeValueValidator = v.union(v.number(), v.string());
