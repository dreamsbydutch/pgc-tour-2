import { v } from "convex/values";
import { mutation } from "../_generated/server";

function toOptionalNumber(value: number | null | undefined): number | undefined {
  return value === null ? undefined : value;
}

function toOptionalRoundTeeTime(
  value: number | string | null | undefined,
): number | string | undefined {
  return value === null ? undefined : value;
}

export const updateTeamRoster = mutation({
  args: {
    teamId: v.id("teams"),
    apiIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      golferIds: args.apiIds,
      updatedAt: Date.now(),
      updatedRosterAt: Date.now(),
    });
  },
});

export const updateTeam = mutation({
  args: {
    team: v.object({
      _id: v.id("teams"),
      earnings: v.optional(v.number()),
      points: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      position: v.optional(v.string()),
      pastPosition: v.optional(v.string()),
      score: v.optional(v.number()),
      topTen: v.optional(v.number()),
      topFive: v.optional(v.number()),
      topThree: v.optional(v.number()),
      win: v.optional(v.number()),
      today: v.optional(v.union(v.number(), v.null())),
      thru: v.optional(v.union(v.number(), v.null())),
      round: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
      roundOne: v.optional(v.union(v.number(), v.null())),
      roundTwoTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
      roundTwo: v.optional(v.union(v.number(), v.null())),
      roundThreeTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
      roundThree: v.optional(v.union(v.number(), v.null())),
      roundFourTeeTime: v.optional(v.union(v.number(), v.string(), v.null())),
      roundFour: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.team._id, {
      ...args.team,
      today: toOptionalNumber(args.team.today),
      thru: toOptionalNumber(args.team.thru),
      roundOneTeeTime: toOptionalRoundTeeTime(args.team.roundOneTeeTime),
      roundOne: toOptionalNumber(args.team.roundOne),
      roundTwoTeeTime: toOptionalRoundTeeTime(args.team.roundTwoTeeTime),
      roundTwo: toOptionalNumber(args.team.roundTwo),
      roundThreeTeeTime: toOptionalRoundTeeTime(args.team.roundThreeTeeTime),
      roundThree: toOptionalNumber(args.team.roundThree),
      roundFourTeeTime: toOptionalRoundTeeTime(args.team.roundFourTeeTime),
      roundFour: toOptionalNumber(args.team.roundFour),
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.team._id);
  },
});

export const createTeam = mutation({
  args: {
    data: v.object({
      tournamentId: v.id("tournaments"),
      tourCardId: v.id("tourCards"),
      golferIds: v.array(v.number()),
      round: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
      roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_tournament_tour_card", (q) =>
        q
          .eq("tournamentId", args.data.tournamentId)
          .eq("tourCardId", args.data.tourCardId),
      )
      .first();

    if (existingTeam) {
      const golferIdsChanged =
        existingTeam.golferIds.length !== args.data.golferIds.length ||
        existingTeam.golferIds.some(
          (apiId, index) => apiId !== args.data.golferIds[index],
        );

      await ctx.db.patch(existingTeam._id, {
        ...args.data,
        updatedAt: now,
        ...(golferIdsChanged ? { updatedRosterAt: now } : {}),
      });
      return await ctx.db.get(existingTeam._id);
    }

    const teamId = await ctx.db.insert("teams", {
      ...args.data,
      updatedAt: now,
      updatedRosterAt: now,
    });

    return await ctx.db.get(teamId);
  },
});
