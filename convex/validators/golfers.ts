import { v } from "convex/values";
import type { ValidateGolferDataInput } from "../types/golfers";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

export const golfersValidators = {
  args: {
    listGolfersForSync: {
      clerkId: v.string(),
    },
    syncGolfersFromDataGolf: {
      clerkId: v.string(),
      options: v.optional(
        v.object({
          dryRun: v.optional(v.boolean()),
          limit: v.optional(v.number()),
        }),
      ),
    },
    getGolfersPage: {
      paginationOpts: v.object({
        numItems: v.number(),
        cursor: v.union(v.string(), v.null()),
        id: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          filter: v.optional(
            v.object({
              apiId: v.optional(v.number()),
              country: v.optional(v.string()),
              searchTerm: v.optional(v.string()),
            }),
          ),
        }),
      ),
    },
    bulkInsertGolfers: {
      clerkId: v.string(),
      data: v.array(
        v.object({
          apiId: v.number(),
          playerName: v.string(),
          country: v.optional(v.string()),
          worldRank: v.optional(v.number()),
        }),
      ),
      options: v.optional(
        v.object({
          dryRun: v.optional(v.boolean()),
        }),
      ),
    },
    bulkPatchGolfers: {
      clerkId: v.string(),
      patches: v.array(
        v.object({
          golferId: v.id("golfers"),
          data: v.object({
            apiId: v.optional(v.number()),
            playerName: v.optional(v.string()),
            country: v.optional(v.string()),
            worldRank: v.optional(v.number()),
          }),
        }),
      ),
      options: v.optional(
        v.object({
          dryRun: v.optional(v.boolean()),
        }),
      ),
    },
    adminNormalizeGolferNames: {
      clerkId: v.string(),
      options: v.optional(
        v.object({
          dryRun: v.optional(v.boolean()),
          limit: v.optional(v.number()),
        }),
      ),
    },
    upsertGolfers: {
      clerkId: v.optional(v.string()),
      data: v.array(
        v.object({
          apiId: v.number(),
          playerName: v.string(),
          country: v.optional(v.string()),
          worldRank: v.optional(v.number()),
        }),
      ),
      options: v.optional(
        v.object({
          dryRun: v.optional(v.boolean()),
        }),
      ),
    },
    createGolfers: {
      data: v.object({
        apiId: v.number(),
        playerName: v.string(),
        country: v.optional(v.string()),
        worldRank: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          setActive: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTournaments: v.optional(v.boolean()),
        }),
      ),
    },
    getGolfers: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("golfers")),
          ids: v.optional(v.array(v.id("golfers"))),
          apiId: v.optional(v.number()),
          filter: v.optional(
            v.object({
              apiId: v.optional(v.number()),
              playerName: v.optional(v.string()),
              country: v.optional(v.string()),
              worldRank: v.optional(v.number()),
              minWorldRank: v.optional(v.number()),
              maxWorldRank: v.optional(v.number()),
              searchTerm: v.optional(v.string()),
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
                  v.literal("playerName"),
                  v.literal("country"),
                  v.literal("worldRank"),
                  v.literal("apiId"),
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
              includeTournaments: v.optional(v.boolean()),
              includeStatistics: v.optional(v.boolean()),
              includeTeams: v.optional(v.boolean()),
              includeRecentPerformance: v.optional(v.boolean()),
            }),
          ),
          activeOnly: v.optional(v.boolean()),
          rankedOnly: v.optional(v.boolean()),
          topRankedOnly: v.optional(v.boolean()),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },
    getTournamentLeaderboardGolfers: {
      tournamentId: v.id("tournaments"),
    },
    updateGolfers: {
      golferId: v.id("golfers"),
      data: v.object({
        playerName: v.optional(v.string()),
        country: v.optional(v.string()),
        worldRank: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTournaments: v.optional(v.boolean()),
          includeRecentPerformance: v.optional(v.boolean()),
        }),
      ),
    },
    deleteGolfers: {
      golferId: v.id("golfers"),
      options: v.optional(
        v.object({
          softDelete: v.optional(v.boolean()),
          cascadeDelete: v.optional(v.boolean()),
          replacementGolferId: v.optional(v.id("golfers")),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
    adminDedupeGolfersByName: {
      clerkId: v.string(),
    },
  },
  validateGolferData: (data: ValidateGolferDataInput): ValidationResult => {
    const errors: string[] = [];

    const apiIdErr = validators.positiveNumber(data.apiId, "API ID");
    if (apiIdErr) errors.push(apiIdErr);

    const playerNameErr = validators.stringLength(
      data.playerName,
      2,
      100,
      "Player name",
    );
    if (playerNameErr) errors.push(playerNameErr);

    const countryErr = validators.stringLength(
      data.country,
      0,
      50,
      "Country name",
    );
    if (countryErr) errors.push(countryErr);

    const worldRankErr = validators.numberRange(
      data.worldRank,
      1,
      10000,
      "World rank",
    );
    if (worldRankErr) errors.push(worldRankErr);

    return { isValid: errors.length === 0, errors };
  },
} as const;
