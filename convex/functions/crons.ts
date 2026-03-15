import { action, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// Level 1: public cron wrappers

/** Runs the golfer world-rank refresh cron on demand. */
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

/** Runs the next-tournament group creation cron on demand. */
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

/** Recomputes standings through the standings cron mutation. */
export const recomputeStandings_Public: ReturnType<typeof mutation> = mutation({
  handler: async (ctx) => {
    return await ctx.runMutation(
      internal.crons.standings.recomputeStandings,
      {},
    );
  },
});

/** Runs the tournament sync cron on demand. */
export const runTournamentSync_Public: ReturnType<typeof action> = action({
  handler: async (ctx) => {
    return await ctx.runAction(internal.crons.sync.runTournamentSync, {});
  },
});

/** Runs the targeted previous-tournament sync cron for one tournament. */
export const updatePreviousTournament_Public: ReturnType<typeof action> =
  action({
    args: {
      tournamentId: v.id("tournaments"),
    },
    handler: async (ctx, args) => {
      return await ctx.runAction(internal.crons.sync.updatePreviousTournament, {
        tournamentId: args.tournamentId,
      });
    },
  });
