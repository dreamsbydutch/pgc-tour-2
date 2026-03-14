import { api } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { DataGolfRankedPlayer } from "../types/datagolf";
import { normalizePlayerNameFromDataGolf } from "../utils/datagolf";

export const updateGolfersWorldRankFromDataGolfInput: ReturnType<
  typeof internalAction
> = internalAction({
  handler: async (ctx) => {
    let rankings: unknown;
    try {
      rankings = await ctx.runAction(
        api.functions.datagolf.fetchDataGolfRankings,
        {},
      );
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }
    const rankingsList = Array.isArray(
      (rankings as { rankings?: unknown }).rankings,
    )
      ? ((rankings as { rankings: unknown[] })
          .rankings as DataGolfRankedPlayer[])
      : [];
    if (rankingsList.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_rankings",
        rankingsFetched: 0,
      } as const;
    }
    let golfersMatched = 0;
    let golfersUpdated = 0;

    for (const r of rankingsList) {
      if (!Number.isFinite(r.dg_id) || !Number.isFinite(r.owgr_rank)) continue;
        const golfer = await ctx.runQuery(
          api.functions.golfers.getGolferByApiId,
          { apiId: r.dg_id }
        );
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
          await ctx.runMutation(
            api.functions.golfers.updateGolfer,
            {
              golferId: golfer._id,
              ranking: patch,
            }
          );
          golfersUpdated += 1;
        }
    }

    return {
      ok: true,
      skipped: false,
      golfersMatched,
      golfersUpdated,
      rankingsProcessed: rankingsList.length,
      rankingsFetched: rankingsList.length,
    } as const;
  },
});
