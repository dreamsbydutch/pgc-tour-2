/**
 * Tournament Golfers - Basic CRUD
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireModerator } from "../auth";

export const createTournamentGolfers = mutation({
  args: {
    data: v.object({
      golferId: v.id("golfers"),
      tournamentId: v.id("tournaments"),

      position: v.optional(v.string()),
      posChange: v.optional(v.number()),
      score: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      topTen: v.optional(v.number()),
      win: v.optional(v.number()),
      earnings: v.optional(v.number()),

      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      endHole: v.optional(v.number()),
      group: v.optional(v.number()),

      roundOneTeeTime: v.optional(v.string()),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.string()),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.string()),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.string()),
      roundFour: v.optional(v.number()),

      rating: v.optional(v.number()),
      worldRank: v.optional(v.number()),
      usage: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const tournamentGolferId = await ctx.db.insert("tournamentGolfers", {
      ...args.data,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(tournamentGolferId);
  },
});

export const getTournamentGolferRecords = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tournamentGolfers")),
        ids: v.optional(v.array(v.id("tournamentGolfers"))),
        filter: v.optional(
          v.object({
            tournamentId: v.optional(v.id("tournaments")),
            golferId: v.optional(v.id("golfers")),
          }),
        ),
        limit: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      return await ctx.db.get(options.id);
    }

    if (options.ids) {
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      return docs.filter(Boolean);
    }

    const filter = options.filter || {};
    let results;
    if (filter.golferId && filter.tournamentId) {
      results = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q
            .eq("golferId", filter.golferId!)
            .eq("tournamentId", filter.tournamentId!),
        )
        .collect();
    } else if (filter.tournamentId) {
      results = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", filter.tournamentId!),
        )
        .collect();
    } else if (filter.golferId) {
      results = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer", (q) => q.eq("golferId", filter.golferId!))
        .collect();
    } else {
      results = await ctx.db.query("tournamentGolfers").collect();
    }

    if (options.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return results;
  },
});

/**
 * Paginated (cursor) tournament golfer records.
 * Uses indexes based on the provided filter.
 */
export const getTournamentGolferRecordsPage = query({
  args: {
    filter: v.object({
      tournamentId: v.optional(v.id("tournaments")),
      golferId: v.optional(v.id("golfers")),
    }),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = args.limit ?? 200;
    const { tournamentId, golferId } = args.filter;

    if (golferId && tournamentId) {
      return await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golferId).eq("tournamentId", tournamentId),
        )
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    if (tournamentId) {
      return await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    if (golferId) {
      return await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer", (q) => q.eq("golferId", golferId))
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    throw new Error(
      "getTournamentGolferRecordsPage requires filter.tournamentId and/or filter.golferId",
    );
  },
});

export const updateTournamentGolfers = mutation({
  args: {
    tournamentGolferId: v.id("tournamentGolfers"),
    data: v.object({
      position: v.optional(v.string()),
      posChange: v.optional(v.number()),
      score: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      topTen: v.optional(v.number()),
      win: v.optional(v.number()),
      earnings: v.optional(v.number()),

      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      endHole: v.optional(v.number()),
      group: v.optional(v.number()),

      roundOneTeeTime: v.optional(v.string()),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.string()),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.string()),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.string()),
      roundFour: v.optional(v.number()),

      rating: v.optional(v.number()),
      worldRank: v.optional(v.number()),
      usage: v.optional(v.number()),

      updatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    await ctx.db.patch(args.tournamentGolferId, {
      ...args.data,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.tournamentGolferId);
  },
});

export const deleteTournamentGolfers = mutation({
  args: { tournamentGolferId: v.id("tournamentGolfers") },
  handler: async (ctx, args) => {
    await requireModerator(ctx);

    const existing = await ctx.db.get(args.tournamentGolferId);
    if (!existing) return null;
    await ctx.db.delete(args.tournamentGolferId);
    return existing;
  },
});
