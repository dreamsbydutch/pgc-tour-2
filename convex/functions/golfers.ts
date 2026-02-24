import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import {
  normalizeDgSkillEstimateToPgcRating,
  normalizePlayerNameFromDataGolf,
} from "../utils/datagolf";

/**
 * Applies country + OWGR (and normalized player name) updates to `golfers` from an input ranking array.
 *
 * This is intentionally a mutation-only write path (no DataGolf calls), so it can be used by other
 * server-side jobs that already fetched rankings.
 *
 * @param args.rankings Ranking rows from DataGolf (dg_id/owgr_rank/player_name/country).
 * @returns Summary counts of matched/updated golfers.
 */
export const applyGolfersWorldRankFromDataGolfInput = internalMutation({
  args: {
    rankings: v.array(
      v.object({
        dg_id: v.number(),
        owgr_rank: v.number(),
        player_name: v.string(),
        country: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let golfersMatched = 0;
    let golfersUpdated = 0;

    for (const r of args.rankings) {
      if (!Number.isFinite(r.dg_id) || !Number.isFinite(r.owgr_rank)) continue;
      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", r.dg_id))
        .first();
      if (!golfer) continue;
      golfersMatched += 1;

      const normalizedName = normalizePlayerNameFromDataGolf(r.player_name);
      const patch: Partial<Doc<"golfers">> & { updatedAt: number } = {
        updatedAt: Date.now(),
      };
      if (normalizedName && normalizedName !== golfer.playerName) {
        patch.playerName = normalizedName;
      }
      if (r.owgr_rank && r.owgr_rank !== golfer.worldRank) {
        patch.worldRank = r.owgr_rank;
      }

      const nextCountry = r.country.trim();
      if (nextCountry.length > 0 && nextCountry !== golfer.country) {
        patch.country = nextCountry;
      }

      const keys = Object.keys(patch);
      if (keys.length > 1) {
        await ctx.db.patch(golfer._id, patch);
        golfersUpdated += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      golfersMatched,
      golfersUpdated,
      rankingsProcessed: args.rankings.length,
    } as const;
  },
});
/**
 * Creates the full set of `tournamentGolfers` for a tournament from grouped DataGolf inputs.
 *
 * Notes:
 * - Skips if the tournament already has at least one tournament golfer.
 * - Ensures `golfers` records exist (creates missing), and inserts `tournamentGolfers` for each.
 *
 * @param args.tournamentId Tournament id.
 * @param args.groups Group list with a `groupNumber` and golfer entries.
 * @returns A small status object indicating whether inserts were skipped or performed.
 */
export const createTournamentGolfers = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    groups: v.array(
      v.object({
        groupNumber: v.number(),
        golfers: v.array(
          v.object({
            dgId: v.number(),
            playerName: v.string(),
            country: v.optional(v.string()),
            r1TeeTime: v.optional(v.number()),
            r2TeeTime: v.optional(v.number()),
            worldRank: v.optional(v.number()),
            skillEstimate: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .first();
    if (existing) {
      return {
        ok: true,
        skipped: true,
        reason: "already_has_golfers",
        tournamentId: args.tournamentId,
      } as const;
    }

    let inserted = 0;
    for (const group of args.groups) {
      for (const g of group.golfers) {
        const existingGolfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", g.dgId))
          .first();

        const golferId = existingGolfer
          ? existingGolfer._id
          : await ctx.db.insert("golfers", {
              apiId: g.dgId,
              playerName: normalizePlayerNameFromDataGolf(g.playerName),
              ...(g.country ? { country: g.country } : {}),
              ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
              updatedAt: Date.now(),
            });
        const existingTG = await ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer_tournament", (q) =>
            q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
          )
          .first();
        const rating = normalizeDgSkillEstimateToPgcRating(
          g.skillEstimate ?? -1.875,
        );

        if (!existingTG) {
          await ctx.db.insert("tournamentGolfers", {
            golferId,
            tournamentId: args.tournamentId,
            group: group.groupNumber,
            worldRank: g.worldRank ?? 501,
            rating,
            ...(typeof g.r1TeeTime === "string"
              ? { roundOneTeeTime: g.r1TeeTime }
              : {}),
            ...(typeof g.r2TeeTime === "string"
              ? { roundTwoTeeTime: g.r2TeeTime }
              : {}),
            updatedAt: Date.now(),
          });
          inserted += 1;
        }
      }
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      golfersProcessed: inserted,
      groupsCreated: args.groups.filter((g) => g.golfers.length > 0).length,
    } as const;
  },
});
export const createMissingTournamentGolfers = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    golfers: v.array(
      v.object({
        dg_id: v.number(),
        player_name: v.string(),
        country: v.optional(v.string()),
        worldRank: v.optional(v.number()),
        dg_skill_estimate: v.optional(v.number()),
        r1_teetime: v.optional(v.number()),
        r2_teetime: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const g of args.golfers) {
      const existingGolfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", g.dg_id))
        .first();

      const golferId = existingGolfer
        ? existingGolfer._id
        : await ctx.db.insert("golfers", {
            apiId: g.dg_id,
            playerName: normalizePlayerNameFromDataGolf(g.player_name),
            ...(g.country ? { country: g.country } : {}),
            ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
            updatedAt: Date.now(),
          });
      const existingTG = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (!existingTG) {
        await ctx.db.insert("tournamentGolfers", {
          golferId,
          tournamentId: args.tournamentId,
          worldRank: g.worldRank ?? 501,
          group: 0,
          usage: 0,
          round: 0,
          rating: normalizeDgSkillEstimateToPgcRating(
            g.dg_skill_estimate ?? -1.875,
          ),
          updatedAt: Date.now(),
        });
        inserted += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      golfersProcessed: inserted,
    } as const;
  },
});

export const updateTournamentGolfer = internalMutation({
  args: {
    tournamentGolfer: v.object({
      _id: v.id("tournamentGolfers"),
      golferId: v.id("golfers"),
      tournamentId: v.id("tournaments"),
      position: v.optional(v.string()),
      posChange: v.optional(v.number()),
      score: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      topTen: v.optional(v.number()),
      win: v.optional(v.number()),
      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      group: v.optional(v.number()),
      endHole: v.optional(v.number()),
      round: v.optional(v.number()),
      roundOne: v.optional(v.number()),
      roundTwo: v.optional(v.number()),
      roundThree: v.optional(v.number()),
      roundFour: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.number()),
      rating: v.optional(v.number()),
      worldRank: v.optional(v.number()),
      usage: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tournamentGolfer._id, {
      ...args.tournamentGolfer,
      updatedAt: Date.now(),
    });
  },
});
