import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const updateTeamRoster = internalMutation({
  args: {
    teamId: v.id("teams"),
    apiIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      golferIds: args.apiIds,
      updatedAt: Date.now(),
    });
  },
});

export const updateTeam = internalMutation({
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
      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
      roundFour: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.team._id, { ...args.team, updatedAt: Date.now() });
  },
});
