import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";

import type { Id } from "../_generated/dataModel";
import type {
  FieldPlayer,
  LiveModelPlayer,
  RankedPlayer,
} from "../types/datagolf";

function parsePositionNumber(position?: string | null): number | null {
  if (!position) return null;
  const stripped = String(position).trim().replace(/^T/i, "");
  const num = Number.parseInt(stripped, 10);
  return Number.isFinite(num) ? num : null;
}

function computePosChange(
  prevPosition?: string,
  nextPosition?: string,
): number {
  const prevNum = parsePositionNumber(prevPosition);
  const nextNum = parsePositionNumber(nextPosition);
  if (prevNum === null || nextNum === null) return 0;
  return prevNum - nextNum;
}

function buildUsagePercentByGolferApiId(options: {
  teams: Array<{ golferIds: number[] }>;
}): Map<number, number> {
  const counts = new Map<number, number>();
  const totalTeams = options.teams.length;
  if (totalTeams === 0) return new Map();

  for (const team of options.teams) {
    for (const golferApiId of team.golferIds) {
      counts.set(golferApiId, (counts.get(golferApiId) ?? 0) + 1);
    }
  }

  const percent = new Map<number, number>();
  for (const [golferApiId, count] of counts.entries()) {
    percent.set(golferApiId, (count / totalTeams) * 100);
  }

  return percent;
}

export const getActiveTournamentIdForCron = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"tournaments"> | null> => {
    const active = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();

    if (active) return active._id;

    const live = await ctx.db
      .query("tournaments")
      .filter((q) => q.eq(q.field("livePlay"), true))
      .first();

    return live?._id ?? null;
  },
});

export const getTournamentNameForCron = internalQuery({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const tournament = await ctx.db.get(args.tournamentId);
    return tournament?.name ?? null;
  },
});

export const applyDataGolfLiveSync = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    currentRound: v.optional(v.number()),
    eventName: v.optional(v.string()),
    field: v.array(
      v.object({
        am: v.number(),
        country: v.string(),
        dg_id: v.number(),
        dk_id: v.optional(v.string()),
        dk_salary: v.optional(v.number()),
        early_late: v.optional(v.number()),
        fd_id: v.optional(v.string()),
        fd_salary: v.optional(v.number()),
        flag: v.optional(v.string()),
        pga_number: v.optional(v.number()),
        player_name: v.string(),
        r1_teetime: v.optional(v.string()),
        start_hole: v.optional(v.number()),
        unofficial: v.optional(v.number()),
        yh_id: v.optional(v.string()),
        yh_salary: v.optional(v.number()),
      }),
    ),
    rankings: v.array(
      v.object({
        am: v.number(),
        country: v.string(),
        datagolf_rank: v.number(),
        dg_id: v.number(),
        dg_skill_estimate: v.number(),
        owgr_rank: v.number(),
        player_name: v.string(),
        primary_tour: v.string(),
      }),
    ),
    liveStats: v.array(
      v.object({
        player_name: v.string(),
        dg_id: v.number(),
        current_pos: v.string(),
        current_score: v.number(),
        end_hole: v.number(),
        make_cut: v.number(),
        round: v.number(),
        thru: v.string(),
        today: v.number(),
        top_10: v.optional(v.number()),
        top_20: v.number(),
        top_5: v.number(),
        win: v.number(),
        R1: v.optional(v.number()),
        R2: v.optional(v.number()),
        R3: v.optional(v.number()),
        R4: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found for live sync");
    }

    const fieldById = new Map<number, FieldPlayer>();
    for (const f of args.field) {
      fieldById.set(f.dg_id, f);
    }

    const rankingById = new Map<number, RankedPlayer>();
    for (const r of args.rankings) {
      rankingById.set(r.dg_id, r);
    }

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const usageByGolferApiId = buildUsagePercentByGolferApiId({ teams });

    let golfersInserted = 0;
    const golfersUpdated = 0;
    let tournamentGolfersInserted = 0;
    let tournamentGolfersUpdated = 0;

    for (const field of args.field) {
      const golferApiId = field.dg_id;
      const ranking = rankingById.get(golferApiId);

      const existingGolfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", golferApiId))
        .first();

      const golferId = existingGolfer
        ? existingGolfer._id
        : await ctx.db.insert("golfers", {
            apiId: golferApiId,
            playerName: field.player_name,
            country: field.country || ranking?.country,
            worldRank:
              typeof ranking?.owgr_rank === "number"
                ? ranking.owgr_rank
                : undefined,
            updatedAt: Date.now(),
          });

      if (!existingGolfer) golfersInserted += 1;

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (!existingTournamentGolfer) {
        await ctx.db.insert("tournamentGolfers", {
          tournamentId: args.tournamentId,
          golferId,
          roundOneTeeTime: field.r1_teetime,
          worldRank:
            typeof ranking?.owgr_rank === "number"
              ? ranking.owgr_rank
              : undefined,
          rating:
            typeof ranking?.dg_skill_estimate === "number"
              ? Math.round(
                  (((ranking.dg_skill_estimate ?? -1.875) + 2) / 0.0004) * 100,
                ) / 100
              : undefined,
          updatedAt: Date.now(),
        });
        tournamentGolfersInserted += 1;
      }
    }

    for (const live of args.liveStats as LiveModelPlayer[]) {
      const golferApiId = live.dg_id;
      const field = fieldById.get(golferApiId);
      const ranking = rankingById.get(golferApiId);

      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", golferApiId))
        .first();

      if (!golfer) continue;

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golfer._id).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (!existingTournamentGolfer) continue;

      const nextPosition = live.current_pos;
      const nextPosChange = computePosChange(
        existingTournamentGolfer.position,
        nextPosition,
      );

      const nextUsage = usageByGolferApiId.get(golferApiId);

      const thruNum = (() => {
        const raw = String(live.thru).trim();
        if (!raw) return undefined;
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : undefined;
      })();

      await ctx.db.patch(existingTournamentGolfer._id, {
        position: nextPosition,
        posChange: nextPosChange,
        score: live.current_score,
        today: live.today,
        ...(thruNum !== undefined ? { thru: thruNum } : {}),
        round: live.round,
        endHole: live.end_hole,
        makeCut: live.make_cut,
        topTen: live.top_10,
        win: live.win,
        roundOne: live.R1,
        roundTwo: live.R2,
        roundThree: live.R3,
        roundFour: live.R4,
        roundOneTeeTime: field?.r1_teetime,
        worldRank:
          typeof ranking?.owgr_rank === "number"
            ? ranking.owgr_rank
            : undefined,
        rating:
          typeof ranking?.dg_skill_estimate === "number"
            ? Math.round(
                (((ranking.dg_skill_estimate ?? -1.875) + 2) / 0.0004) * 100,
              ) / 100
            : undefined,
        ...(nextUsage !== undefined ? { usage: nextUsage } : {}),
        updatedAt: Date.now(),
      });

      tournamentGolfersUpdated += 1;
    }

    const shouldSetLivePlay = args.liveStats.length > 0;
    await ctx.db.patch(args.tournamentId, {
      ...(args.currentRound !== undefined
        ? { currentRound: args.currentRound }
        : {}),
      ...(shouldSetLivePlay ? { livePlay: true } : {}),
      ...(tournament.status === "cancelled" || tournament.status === "completed"
        ? {}
        : shouldSetLivePlay
          ? { status: "active" as const }
          : {}),
      updatedAt: Date.now(),
    });

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      eventName: args.eventName,
      currentRound: args.currentRound,
      golfersInserted,
      golfersUpdated,
      tournamentGolfersInserted,
      tournamentGolfersUpdated,
      livePlayers: args.liveStats.length,
    } as const;
  },
});
