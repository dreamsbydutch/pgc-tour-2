import { internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin } from "../utils/auth";
import {
  recomputeStandingsRanksForSeason,
  recomputeStandingsRowForCard,
  refreshStandingsForTeams,
  upsertStandingsContributionForTeam,
} from "../utils/standings";

/** Reconciles a completed tournament after lifecycle metadata changes. */
export const refreshTournament = internalMutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .take(500);
    return await refreshStandingsForTeams(ctx, teams);
  },
});

const standingsBackfillArgs = {
  seasonId: v.id("seasons"),
  cursor: v.optional(v.union(v.string(), v.null())),
  limit: v.optional(v.number()),
};

async function backfillSeasonPage(
  ctx: MutationCtx,
  args: {
    seasonId: Id<"seasons">;
    cursor?: string | null;
    limit?: number;
  },
) {
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 10);
  const page = await ctx.db
    .query("tourCards")
    .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
    .paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
      maximumRowsRead: limit,
      maximumBytesRead: 512_000,
    });
  let contributions = 0;
  for (const card of page.page) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", card._id))
      .take(100);
    for (const team of teams) {
      const tournament = await ctx.db.get(team.tournamentId);
      if (tournament && tournament.startDate <= Date.now()) {
        await upsertStandingsContributionForTeam(ctx, team);
        contributions += 1;
      }
    }
    await recomputeStandingsRowForCard(ctx, card._id);
  }
  if (page.isDone) {
    await recomputeStandingsRanksForSeason(ctx, args.seasonId);
  }
  return {
    continueCursor: page.continueCursor,
    isDone: page.isDone,
    tourCards: page.page.length,
    contributions,
  };
}

/** Bounded, resumable migration for seasons created before the read model. */
export const adminBackfillSeason = mutation({
  args: standingsBackfillArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await backfillSeasonPage(ctx, args);
  },
});

/** Deployment-credential entry point for release-time standings backfills. */
export const backfillSeasonPageInternal = internalMutation({
  args: standingsBackfillArgs,
  handler: backfillSeasonPage,
});

export const adminRecomputeSeasonRanks = mutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await recomputeStandingsRanksForSeason(ctx, args.seasonId);
  },
});
