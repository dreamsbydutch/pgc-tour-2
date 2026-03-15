import { action, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const updateGolfersWorldRankFromDataGolfInput_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.crons.golfers.updateGolfersWorldRankFromDataGolfInput,
      {},
    );
  },
});

export const runCreateGroupsForNextTournament_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.crons.groups.runCreateGroupsForNextTournament,
      {},
    );
  },
});

export const recomputeStandings_Public: ReturnType<typeof mutation> = mutation({
  handler: async (ctx) => {
    return await ctx.runMutation(internal.crons.standings.recomputeStandings, {});
  },
});

export const runTournamentSync_Public: ReturnType<typeof action> = action({
  handler: async (ctx) => {
    return await ctx.runAction(internal.crons.sync.runTournamentSync, {});
  },
});

export const updatePreviousTournament_Public: ReturnType<typeof action> = action({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(internal.crons.sync.updatePreviousTournament, {
      tournamentId: args.tournamentId,
    });
  },
});