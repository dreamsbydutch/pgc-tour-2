import { v } from "convex/values";

export const cronGroupsValidators = {
  args: {
    getCreateGroupsTarget: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    copyFromFirstPlayoff: {
      tournamentId: v.id("tournaments"),
      firstPlayoffTournamentId: v.id("tournaments"),
    },
    applyCreateGroups: {
      tournamentId: v.id("tournaments"),
      groups: v.array(
        v.object({
          groupNumber: v.number(),
          golfers: v.array(
            v.object({
              dgId: v.number(),
              playerName: v.string(),
              country: v.optional(v.string()),
              r1TeeTime: v.optional(v.string()),
              r2TeeTime: v.optional(v.string()),
              worldRank: v.optional(v.number()),
              skillEstimate: v.optional(v.number()),
            }),
          ),
        }),
      ),
    },
    runCreateGroupsForNextTournament: {
      tournamentId: v.optional(v.id("tournaments")),
    },
  },
} as const;
