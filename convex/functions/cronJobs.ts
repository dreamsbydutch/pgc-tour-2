import { v } from "convex/values";

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  FieldPlayer,
  LiveModelPlayer,
  RankedPlayer,
} from "../types/datagolf";

function normalizePlayerNameFromDataGolf(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes(",")) return trimmed.replace(/\s+/g, " ").trim();

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) return trimmed.replace(/\s+/g, " ").trim();

  const last = parts[0] ?? trimmed;
  const first = parts.slice(1).join(", ").trim();
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

function normalizeEventTokens(name: string): string[] {
  const STOP = new Set([
    "the",
    "a",
    "an",
    "and",
    "of",
    "at",
    "in",
    "on",
    "for",
    "to",
    "by",
    "presented",
    "championship",
    "tournament",
    "cup",
    "classic",
  ]);

  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1)
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !STOP.has(w));
}

function eventNameLooksCompatible(
  expectedTournamentName: string,
  dataGolfEventName: string,
): {
  ok: boolean;
  score: number;
  intersection: string[];
  expectedTokens: string[];
  actualTokens: string[];
} {
  const expectedTokens = normalizeEventTokens(expectedTournamentName);
  const actualTokens = normalizeEventTokens(dataGolfEventName);

  const expectedNorm = expectedTournamentName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const actualNorm = dataGolfEventName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (expectedNorm && actualNorm) {
    if (
      expectedNorm.includes(actualNorm) ||
      actualNorm.includes(expectedNorm)
    ) {
      return {
        ok: true,
        score: 1,
        intersection: [],
        expectedTokens,
        actualTokens,
      };
    }
  }

  const expectedSet = new Set(expectedTokens);
  const actualSet = new Set(actualTokens);
  const intersection = [...expectedSet].filter((t) => actualSet.has(t));
  const denom = Math.max(expectedSet.size, actualSet.size, 1);
  const score = intersection.length / denom;
  const ok = score >= 0.6 || (intersection.length >= 2 && score >= 0.5);

  return { ok, score, intersection, expectedTokens, actualTokens };
}

const EXCLUDED_GOLFER_IDS = new Set([18417]);

const GROUP_LIMITS = {
  GROUP_1: { percentage: 0.1, maxCount: 10 },
  GROUP_2: { percentage: 0.175, maxCount: 16 },
  GROUP_3: { percentage: 0.225, maxCount: 22 },
  GROUP_4: { percentage: 0.25, maxCount: 30 },
} as const;

type EnhancedGolfer = FieldPlayer & {
  ranking?: RankedPlayer;
};

function isPlayoffTierName(tierName?: string | null): boolean {
  return (tierName ?? "").toLowerCase().includes("playoff");
}

async function listPlayoffTournamentsForSeason(
  ctx: QueryCtx,
  seasonId: Id<"seasons">,
) {
  const tournaments: Doc<"tournaments">[] = await ctx.db
    .query("tournaments")
    .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
    .collect();

  const withTier = await Promise.all(
    tournaments.map(async (t) => {
      const tier = await ctx.db.get(t.tierId);
      return {
        tournament: t,
        tierName: (tier?.name as string | undefined) ?? null,
      };
    }),
  );

  return withTier
    .filter(({ tierName }) => isPlayoffTierName(tierName))
    .map(({ tournament }) => tournament)
    .sort((a, b) => a.startDate - b.startDate);
}

export const getGolferIdsByApiIds = internalQuery({
  args: {
    apiIds: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const unique = Array.from(new Set(args.apiIds));

    const rows = await Promise.all(
      unique.map(async (apiId) => {
        const golfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
          .first();
        return {
          apiId,
          golferId: golfer?._id ?? null,
        };
      }),
    );

    return rows;
  },
});

export const updateGolfersWorldRanksFromRankings = internalMutation({
  args: {
    rankings: v.array(
      v.object({
        dg_id: v.number(),
        owgr_rank: v.number(),
        player_name: v.string(),
        country: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let golfersMatched = 0;
    let golfersUpdated = 0;

    for (const r of args.rankings) {
      const apiId = r.dg_id;
      const nextWorldRank = r.owgr_rank;
      if (!Number.isFinite(apiId) || !Number.isFinite(nextWorldRank)) continue;

      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
        .first();

      if (!golfer) continue;
      golfersMatched += 1;

      const patch: Partial<Doc<"golfers">> & { updatedAt: number } = {
        updatedAt: Date.now(),
      };

      const normalizedName = normalizePlayerNameFromDataGolf(r.player_name);
      if (normalizedName && normalizedName !== golfer.playerName) {
        patch.playerName = normalizedName;
      }

      if (nextWorldRank !== golfer.worldRank) {
        patch.worldRank = nextWorldRank;
      }

      const nextCountry = typeof r.country === "string" ? r.country.trim() : "";
      if (nextCountry && golfer.country !== nextCountry) {
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

export const getCreateGroupsTarget = internalQuery({
  args: {
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    let tournamentId = args.tournamentId as Id<"tournaments"> | undefined;
    if (!tournamentId) {
      const upcoming: Doc<"tournaments">[] = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", "upcoming"))
        .collect();

      const future = upcoming.filter((t) => t.startDate > now);
      future.sort((a, b) => a.startDate - b.startDate);
      tournamentId = future[0]?._id;
    }

    if (!tournamentId) {
      return {
        ok: true,
        skipped: true,
        reason: "no_upcoming_tournament",
      } as const;
    }

    const existing = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .first();

    if (existing) {
      return {
        ok: true,
        skipped: true,
        reason: "already_has_golfers",
        tournamentId,
      } as const;
    }

    const tournament = await ctx.db.get(tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const tier = await ctx.db.get(tournament.tierId);
    const isPlayoff = isPlayoffTierName(
      (tier?.name as string | undefined) ?? null,
    );

    let eventIndex: 1 | 2 | 3 = 1;
    let firstPlayoffTournamentId: Id<"tournaments"> | null = null;

    if (isPlayoff) {
      const playoffEvents = await listPlayoffTournamentsForSeason(
        ctx,
        tournament.seasonId,
      );
      const idx = playoffEvents.findIndex((t) => t._id === tournamentId);
      eventIndex = idx === -1 ? 1 : (Math.min(3, idx + 1) as 1 | 2 | 3);
      firstPlayoffTournamentId = playoffEvents[0]?._id ?? null;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId,
      tournamentName: tournament.name,
      isPlayoff,
      eventIndex,
      firstPlayoffTournamentId,
      seasonId: tournament.seasonId,
    } as const;
  },
});

export const copyFromFirstPlayoff = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    firstPlayoffTournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const baseGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.firstPlayoffTournamentId),
      )
      .collect();

    const baseTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.firstPlayoffTournamentId),
      )
      .collect();

    let golfersCopied = 0;
    let teamsCopied = 0;
    const groupSet = new Set<number>();

    for (const tg of baseGolfers) {
      if (typeof tg.group === "number") groupSet.add(tg.group);

      const existing = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", tg.golferId).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("tournamentGolfers", {
        golferId: tg.golferId,
        tournamentId: args.tournamentId,
        group: tg.group,
        rating: tg.rating,
        worldRank: tg.worldRank,
        updatedAt: Date.now(),
      });
      golfersCopied += 1;
    }

    for (const team of baseTeams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", args.tournamentId)
            .eq("tourCardId", team.tourCardId),
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("teams", {
        tournamentId: args.tournamentId,
        tourCardId: team.tourCardId,
        golferIds: team.golferIds,
        score: team.score,
        position: team.position,
        pastPosition: team.pastPosition,
        updatedAt: Date.now(),
      });
      teamsCopied += 1;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      copiedFromTournamentId: args.firstPlayoffTournamentId,
      golfersCopied,
      teamsCopied,
      groupsCreated: groupSet.size,
    } as const;
  },
});

export const applyCreateGroups = internalMutation({
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
            r1TeeTime: v.optional(v.string()),
            r2TeeTime: v.optional(v.string()),
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

        if (existingGolfer) {
          const normalized = normalizePlayerNameFromDataGolf(
            existingGolfer.playerName,
          );
          if (normalized !== existingGolfer.playerName) {
            await ctx.db.patch(existingGolfer._id, {
              playerName: normalized,
              updatedAt: Date.now(),
            });
          }
        }

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

function normalizeDgSkillEstimateToPgcRating(dgSkillEstimate: number): number {
  const x = dgSkillEstimate;

  if (!Number.isFinite(x)) return 0;

  if (x < -1.5) {
    const raw = 5 + ((x + 1.5) / 1.5) * 5;
    return Math.max(0, Math.min(5, Math.round(raw * 100) / 100));
  }

  if (x <= 2) {
    const raw = 5 + ((x + 1.5) / 3.5) * 95;
    return Math.max(0, Math.round(raw * 100) / 100);
  }

  const extra = 20 * Math.sqrt((x - 2) / 1.5);
  const raw = 100 + extra;
  return Math.min(150, Math.round(raw * 100) / 100);
}

function determineGroupIndex(
  currentIndex: number,
  totalGolfers: number,
  groups: EnhancedGolfer[][],
): number {
  const remainingGolfers = totalGolfers - currentIndex;

  if (
    groups[0].length < totalGolfers * GROUP_LIMITS.GROUP_1.percentage &&
    groups[0].length < GROUP_LIMITS.GROUP_1.maxCount
  ) {
    return 0;
  }

  if (
    groups[1].length < totalGolfers * GROUP_LIMITS.GROUP_2.percentage &&
    groups[1].length < GROUP_LIMITS.GROUP_2.maxCount
  ) {
    return 1;
  }

  if (
    groups[2].length < totalGolfers * GROUP_LIMITS.GROUP_3.percentage &&
    groups[2].length < GROUP_LIMITS.GROUP_3.maxCount
  ) {
    return 2;
  }

  if (
    groups[3].length < totalGolfers * GROUP_LIMITS.GROUP_4.percentage &&
    groups[3].length < GROUP_LIMITS.GROUP_4.maxCount
  ) {
    return 3;
  }
  if (
    remainingGolfers <= groups[3].length + groups[4].length * 0.5 ||
    remainingGolfers === 1
  ) {
    return 4;
  }

  return currentIndex % 2 ? 3 : 4;
}

export const runCreateGroupsForNextTournament: ReturnType<
  typeof internalAction
> = internalAction({
  args: {
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args): Promise<unknown> => {
    type CreateGroupsTarget =
      | {
          ok: true;
          skipped: true;
          reason: string;
          tournamentId?: Id<"tournaments">;
        }
      | {
          ok: true;
          skipped: false;
          tournamentId: Id<"tournaments">;
          tournamentName: string;
          isPlayoff: boolean;
          eventIndex: 1 | 2 | 3;
          firstPlayoffTournamentId: Id<"tournaments"> | null;
          seasonId: Id<"seasons">;
        };

    const target: CreateGroupsTarget = await ctx.runQuery(
      internal.functions.cronJobs.getCreateGroupsTarget,
      { tournamentId: args.tournamentId },
    );

    if (target.skipped) return target;

    const tournamentId = target.tournamentId;

    if (
      target.isPlayoff &&
      target.eventIndex > 1 &&
      target.firstPlayoffTournamentId
    ) {
      const createResult = await ctx.runMutation(
        internal.functions.cronJobs.copyFromFirstPlayoff,
        {
          tournamentId,
          firstPlayoffTournamentId: target.firstPlayoffTournamentId,
        },
      );

      return {
        ok: true,
        tournamentId,
        createGroups: createResult,
      };
    }
    const tour = "pga" as const;

    const [fieldUpdates, rankings] = await Promise.all([
      ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
        options: { tour },
      }),
      ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
    ]);

    console.log(
      "[create_groups_for_next_tournament] DataGolf field-updates payload",
      fieldUpdates,
    );

    const dataGolfEventName =
      typeof (fieldUpdates as { event_name?: unknown }).event_name === "string"
        ? (fieldUpdates as { event_name: string }).event_name
        : "";

    if (!dataGolfEventName.trim()) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId,
        tournamentName: target.tournamentName,
      } as const;
    }

    const compatible = eventNameLooksCompatible(
      target.tournamentName,
      dataGolfEventName,
    );

    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId,
        tournamentName: target.tournamentName,
        dataGolfEventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      } as const;
    }

    const field = Array.isArray((fieldUpdates as { field?: unknown }).field)
      ? ((fieldUpdates as { field: unknown[] }).field as FieldPlayer[])
      : [];

    console.log(
      "[create_groups_for_next_tournament] DataGolf field length",
      field.length,
    );

    const rankingsList = Array.isArray(
      (rankings as { rankings?: unknown }).rankings,
    )
      ? ((rankings as { rankings: unknown[] }).rankings as RankedPlayer[])
      : [];

    const byDgId = new Map<number, RankedPlayer>();
    for (const r of rankingsList) byDgId.set(r.dg_id, r);

    const processed: EnhancedGolfer[] = field
      .filter((g) => !EXCLUDED_GOLFER_IDS.has(g.dg_id))
      .map((g) => ({ ...g, ranking: byDgId.get(g.dg_id) }))
      .sort(
        (a, b) =>
          (b.ranking?.dg_skill_estimate ?? -50) -
          (a.ranking?.dg_skill_estimate ?? -50),
      );

    const groups: EnhancedGolfer[][] = [[], [], [], [], []];
    processed.forEach((g, index) => {
      const gi = determineGroupIndex(index, processed.length, groups);
      groups[gi]!.push(g);
    });

    const createResult = await ctx.runMutation(
      internal.functions.cronJobs.applyCreateGroups,
      {
        tournamentId,
        groups: groups.map((group, idx) => ({
          groupNumber: idx + 1,
          golfers: group.map((g) => ({
            dgId: g.dg_id,
            playerName: normalizePlayerNameFromDataGolf(g.player_name),
            country: g.country,
            worldRank: g.ranking?.owgr_rank,
            ...(typeof g.r1_teetime === "string" && g.r1_teetime.trim().length
              ? {
                  r1TeeTime: g.r1_teetime,
                  ...(typeof g.r2_teetime === "string" &&
                  g.r2_teetime.trim().length
                    ? { r2TeeTime: g.r2_teetime }
                    : {}),
                }
              : {}),
            skillEstimate: g.ranking?.dg_skill_estimate,
          })),
        })),
      },
    );

    const worldRankUpdate = await ctx.runMutation(
      internal.functions.cronJobs.updateGolfersWorldRanksFromRankings,
      {
        rankings: rankingsList.map((r) => ({
          dg_id: r.dg_id,
          owgr_rank: r.owgr_rank,
          player_name: r.player_name,
          country: r.country,
        })),
      },
    );

    return {
      ok: true,
      tournamentId,
      createGroups: createResult,
      worldRankUpdate,
    };
  },
});

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
    let tournamentGolfersInserted = 0;
    let tournamentGolfersUpdated = 0;

    for (const field of args.field) {
      const golferApiId = field.dg_id;
      const ranking = rankingById.get(golferApiId);

      const existingGolfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", golferApiId))
        .first();

      if (existingGolfer) {
        const normalized = normalizePlayerNameFromDataGolf(
          existingGolfer.playerName,
        );
        if (normalized !== existingGolfer.playerName) {
          await ctx.db.patch(existingGolfer._id, {
            playerName: normalized,
            updatedAt: Date.now(),
          });
        }
      }

      const golferId = existingGolfer
        ? existingGolfer._id
        : await ctx.db.insert("golfers", {
            apiId: golferApiId,
            playerName: normalizePlayerNameFromDataGolf(field.player_name),
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
              ? normalizeDgSkillEstimateToPgcRating(ranking.dg_skill_estimate)
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
            ? normalizeDgSkillEstimateToPgcRating(ranking.dg_skill_estimate)
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
      golfersUpdated: 0,
      tournamentGolfersInserted,
      tournamentGolfersUpdated,
      livePlayers: args.liveStats.length,
    } as const;
  },
});

/** Explicit annotations avoid TS7022/TS7023 during Convex codegen. */
export const runDataGolfLiveSync: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    handler: async (ctx, args) => {
      const tournamentId =
        args.tournamentId ??
        (await ctx.runQuery(
          internal.functions.cronJobs.getActiveTournamentIdForCron,
          {},
        ));

      if (!tournamentId) {
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const tour = "pga" as const;

      const tournamentName = await ctx.runQuery(
        internal.functions.cronJobs.getTournamentNameForCron,
        { tournamentId },
      );

      const [fieldUpdates, rankings, inPlay] = await Promise.all([
        ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
          options: { tour },
        }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
        ctx.runAction(api.functions.datagolf.fetchLiveModelPredictions, {
          options: { tour },
        }),
      ]);

      const field = Array.isArray(fieldUpdates.field)
        ? (fieldUpdates.field as FieldPlayer[])
        : [];
      const rankingsList = Array.isArray(rankings.rankings)
        ? (rankings.rankings as RankedPlayer[])
        : [];
      const live = Array.isArray(inPlay.data)
        ? (inPlay.data as LiveModelPlayer[])
        : [];

      const dataGolfEventName =
        typeof inPlay.info?.event_name === "string"
          ? inPlay.info.event_name
          : typeof (fieldUpdates as { event_name?: unknown }).event_name ===
              "string"
            ? (fieldUpdates as { event_name: string }).event_name
            : undefined;

      if (tournamentName && dataGolfEventName) {
        const compatible = eventNameLooksCompatible(
          tournamentName,
          dataGolfEventName,
        );

        if (!compatible.ok) {
          return {
            ok: true,
            skipped: true,
            reason: "event_name_mismatch",
            tournamentId,
            tournamentName,
            dataGolfEventName,
            score: compatible.score,
            intersection: compatible.intersection,
            expectedTokens: compatible.expectedTokens,
            actualTokens: compatible.actualTokens,
          } as const;
        }
      }

      return await ctx.runMutation(
        internal.functions.cronJobs.applyDataGolfLiveSync,
        {
          tournamentId,
          currentRound:
            typeof fieldUpdates.current_round === "number"
              ? fieldUpdates.current_round
              : undefined,
          field,
          rankings: rankingsList,
          liveStats: live,
          eventName:
            typeof dataGolfEventName === "string"
              ? dataGolfEventName
              : undefined,
        },
      );
    },
  });

export const recomputeStandingsForCurrentSeason = internalMutation({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();

    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .collect();

    if (seasons.length === 0) {
      return { ok: true, skipped: true, reason: "no_current_season" } as const;
    }

    const season = seasons.reduce((best, s) =>
      s.number > best.number ? s : best,
    );

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    if (tourCards.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_tour_cards",
        seasonId: season._id,
      } as const;
    }

    const calculations = await Promise.all(
      tourCards.map(async (tc) => {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_tour_card", (q) => q.eq("tourCardId", tc._id))
          .collect();

        const completed = teams.filter((t) => (t.round ?? 0) > 4);

        const win = completed.filter((t) => {
          const posNum = parsePositionNumber(t.position ?? null);
          return posNum === 1;
        }).length;

        const topTen = completed.filter((t) => {
          const posNum = parsePositionNumber(t.position ?? null);
          return posNum !== null && posNum <= 10;
        }).length;

        const madeCut = completed.filter((t) => t.position !== "CUT").length;

        const appearances = completed.length;

        const earnings = completed.reduce(
          (sum, t) => sum + (t.earnings ?? 0),
          0,
        );
        const points = completed.reduce(
          (sum, t) => sum + Math.round(t.points ?? 0),
          0,
        );

        return {
          tourCardId: tc._id,
          tourId: tc.tourId,
          win,
          topTen,
          madeCut,
          appearances,
          earnings,
          points,
        };
      }),
    );

    const byTour = new Map<Id<"tours">, typeof calculations>();
    for (const calc of calculations) {
      const list = byTour.get(calc.tourId) ?? [];
      list.push(calc);
      byTour.set(calc.tourId, list);
    }

    let updated = 0;

    for (const list of byTour.values()) {
      for (const calc of list) {
        const samePointsCount = list.filter(
          (a) => a.points === calc.points,
        ).length;
        const betterPointsCount = list.filter(
          (a) => a.points > calc.points,
        ).length;
        const position = `${samePointsCount > 1 ? "T" : ""}${betterPointsCount + 1}`;

        const playoff =
          betterPointsCount < 15 ? 1 : betterPointsCount < 35 ? 2 : 0;

        await ctx.db.patch(calc.tourCardId, {
          points: calc.points,
          earnings: calc.earnings,
          wins: calc.win,
          topTen: calc.topTen,
          madeCut: calc.madeCut,
          appearances: calc.appearances,
          currentPosition: position,
          playoff,
          updatedAt: Date.now(),
        });

        updated += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      seasonId: season._id,
      tourCardsUpdated: updated,
    } as const;
  },
});

type TeamsCronGolferSnap = {
  apiId: number;
  position: string | null;
  score: number | null;
  today: number | null;
  thru: number | null;
  roundOneTeeTime: string | null;
  roundOne: number | null;
  roundTwoTeeTime: string | null;
  roundTwo: number | null;
  roundThreeTeeTime: string | null;
  roundThree: number | null;
  roundFourTeeTime: string | null;
  roundFour: number | null;
};

type TeamsCronTournamentSnap = {
  tournamentId: Id<"tournaments">;
  seasonId: Id<"seasons">;
  startDate: number;
  currentRound: number;
  livePlay: boolean;
  par: number;
  tierPoints: number[];
  tierPayouts: number[];
  isPlayoff: boolean;
  teams: Doc<"teams">[];
  tourCards: Doc<"tourCards">[];
  golfers: TeamsCronGolferSnap[];
};

type TeamsCronPlayoffContext =
  | {
      isPlayoff: false;
      eventIndex: 0;
      carryInByTourCardId: Record<string, number>;
    }
  | {
      isPlayoff: true;
      eventIndex: 1 | 2 | 3;
      carryInByTourCardId: Record<string, number>;
    };

function roundDecimalTeamsCron(
  n: number | null | undefined,
  places = 1,
): number | null {
  if (n == null) return null;
  return Math.round(n * 10 ** places) / 10 ** places;
}

export const getActiveTournamentIdForTeamsCron = internalQuery({
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
    if (live) return live._id;

    const now = Date.now();
    const overlapping = await ctx.db
      .query("tournaments")
      .withIndex("by_dates", (q) => q.lte("startDate", now))
      .filter((q) => q.gte(q.field("endDate"), now))
      .first();

    return overlapping?._id ?? null;
  },
});

function isPlayoffTierNameTeamsCron(name?: string | null): boolean {
  return (name ?? "").toLowerCase().includes("playoff");
}

export const getTournamentSnapshotForTeamsCron = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args): Promise<TeamsCronTournamentSnap> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const course = await ctx.db.get(tournament.courseId);
    if (!course) throw new Error("Course not found");

    const tier = await ctx.db.get(tournament.tierId);
    if (!tier) throw new Error("Tier not found");

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const tgs = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const golfers: TeamsCronGolferSnap[] = [];
    for (const tg of tgs) {
      const g = await ctx.db.get(tg.golferId);
      if (!g) continue;
      golfers.push({
        apiId: g.apiId,
        position: tg.position ?? null,
        score: tg.score ?? null,
        today: tg.today ?? null,
        thru: tg.thru ?? null,
        roundOneTeeTime: tg.roundOneTeeTime ?? null,
        roundOne: tg.roundOne ?? null,
        roundTwoTeeTime: tg.roundTwoTeeTime ?? null,
        roundTwo: tg.roundTwo ?? null,
        roundThreeTeeTime: tg.roundThreeTeeTime ?? null,
        roundThree: tg.roundThree ?? null,
        roundFourTeeTime: tg.roundFourTeeTime ?? null,
        roundFour: tg.roundFour ?? null,
      });
    }

    const isPlayoff = isPlayoffTierNameTeamsCron(
      (tier.name as string | undefined) ?? null,
    );

    return {
      tournamentId: args.tournamentId,
      seasonId: tournament.seasonId,
      startDate: tournament.startDate,
      currentRound: tournament.currentRound ?? 1,
      livePlay: tournament.livePlay ?? false,
      par: course.par,
      tierPoints: tier.points ?? [],
      tierPayouts: tier.payouts ?? [],
      isPlayoff,
      teams,
      tourCards,
      golfers,
    };
  },
});

export const computePlayoffContext = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args): Promise<TeamsCronPlayoffContext> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const tier = await ctx.db.get(tournament.tierId);
    const isPlayoff = isPlayoffTierNameTeamsCron(
      (tier?.name as string | undefined) ?? null,
    );

    if (!isPlayoff) {
      return {
        isPlayoff: false as const,
        eventIndex: 0 as const,
        carryInByTourCardId: {},
      };
    }

    const playoffEvents = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const playoffSorted = [] as Array<{
      id: Id<"tournaments">;
      startDate: number;
    }>;
    for (const t of playoffEvents) {
      const tTier = await ctx.db.get(t.tierId);
      if (
        !isPlayoffTierNameTeamsCron((tTier?.name as string | undefined) ?? null)
      )
        continue;
      playoffSorted.push({ id: t._id, startDate: t.startDate });
    }

    playoffSorted.sort((a, b) => a.startDate - b.startDate);
    const idx = playoffSorted.findIndex((t) => t.id === args.tournamentId);
    const eventIndex = idx === -1 ? 1 : (Math.min(3, idx + 1) as 1 | 2 | 3);

    const prevId =
      eventIndex >= 2 ? playoffSorted[eventIndex - 2]?.id : undefined;
    if (!prevId) {
      return {
        isPlayoff: true as const,
        eventIndex,
        carryInByTourCardId: {},
      };
    }

    const prevTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", prevId))
      .collect();

    const carryInByTourCardId: Record<string, number> = {};
    for (const t of prevTeams) {
      carryInByTourCardId[String(t.tourCardId)] = t.score ?? 0;
    }

    return {
      isPlayoff: true as const,
      eventIndex,
      carryInByTourCardId,
    };
  },
});

export const applyTeamsUpdate = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    updates: v.array(
      v.object({
        teamId: v.id("teams"),
        round: v.number(),
        roundOne: v.optional(v.number()),
        roundTwo: v.optional(v.number()),
        roundThree: v.optional(v.number()),
        roundFour: v.optional(v.number()),
        today: v.optional(v.number()),
        thru: v.optional(v.number()),
        score: v.optional(v.number()),
        position: v.optional(v.string()),
        pastPosition: v.optional(v.string()),
        points: v.optional(v.number()),
        earnings: v.optional(v.number()),
        roundOneTeeTime: v.optional(v.string()),
        roundTwoTeeTime: v.optional(v.string()),
        roundThreeTeeTime: v.optional(v.string()),
        roundFourTeeTime: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let updated = 0;

    for (const u of args.updates) {
      const existing = await ctx.db.get(u.teamId);
      if (!existing) continue;

      if (existing.tournamentId !== args.tournamentId) continue;

      await ctx.db.patch(u.teamId, {
        round: u.round,
        roundOne: u.roundOne,
        roundTwo: u.roundTwo,
        roundThree: u.roundThree,
        roundFour: u.roundFour,
        today: u.today,
        thru: u.thru,
        score: u.score,
        position: u.position,
        pastPosition: u.pastPosition,
        points: u.points,
        earnings: u.earnings,
        roundOneTeeTime: u.roundOneTeeTime,
        roundTwoTeeTime: u.roundTwoTeeTime,
        roundThreeTeeTime: u.roundThreeTeeTime,
        roundFourTeeTime: u.roundFourTeeTime,
      });

      updated += 1;
    }

    return { updated };
  },
});

export const runUpdateTeamsForActiveTournament: ReturnType<
  typeof internalAction
> = internalAction({
  args: {
    tournamentId: v.optional(v.id("tournaments")),
  },
  handler: async (ctx, args) => {
    type Update = {
      teamId: Id<"teams">;
      round: 1 | 2 | 3 | 4 | 5;
      roundOne?: number;
      roundTwo?: number;
      roundThree?: number;
      roundFour?: number;
      today?: number;
      thru?: number;
      score?: number;
      position?: string;
      pastPosition?: string;
      points?: number;
      earnings?: number;
      roundOneTeeTime?: string;
      roundTwoTeeTime?: string;
      roundThreeTeeTime?: string;
      roundFourTeeTime?: string;
      _isCut: boolean;
    };

    const tournamentId =
      args.tournamentId ??
      (await ctx.runQuery(
        internal.functions.cronJobs.getActiveTournamentIdForTeamsCron,
        {},
      ));

    if (!tournamentId) {
      return {
        ok: true,
        skipped: true,
        reason: "no_active_tournament",
      } as const;
    }

    const snap = (await ctx.runQuery(
      internal.functions.cronJobs.getTournamentSnapshotForTeamsCron,
      { tournamentId },
    )) as TeamsCronTournamentSnap;

    type SnapGolfer = (typeof snap.golfers)[number];

    if (!snap.teams || snap.teams.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_teams",
        tournamentId,
      } as const;
    }

    const playoff = (await ctx.runQuery(
      internal.functions.cronJobs.computePlayoffContext,
      { tournamentId },
    )) as TeamsCronPlayoffContext;

    const eventIndex = (playoff.isPlayoff ? playoff.eventIndex : 0) as
      | 0
      | 1
      | 2
      | 3;
    const carryInByTourCardId: Record<string, number> = playoff.isPlayoff
      ? playoff.carryInByTourCardId
      : {};
    const par: number = snap.par;
    const live: boolean = Boolean(snap.livePlay);
    const currentRound: number = snap.currentRound ?? 1;

    const updates: Update[] = [];
    for (const team of snap.teams) {
      const teamGolfers = snap.golfers.filter((g) =>
        team.golferIds.includes(g.apiId),
      );
      const active = teamGolfers.filter(
        (g) => !(g.position && /CUT|WD|DQ/i.test(g.position)),
      );
      const r1Times = teamGolfers.map((g) => g.roundOneTeeTime);
      const r2Times = teamGolfers.map((g) => g.roundTwoTeeTime);
      const r3Times = teamGolfers.map((g) => g.roundThreeTeeTime);
      const r4Times = teamGolfers.map((g) => g.roundFourTeeTime);

      const earliestTimeStr = (
        times: Array<string | null | undefined>,
        position = 1,
      ) => {
        const valid = times.filter((t): t is string =>
          Boolean(t && t.trim().length),
        );
        if (!valid.length) return undefined;
        const pos = Math.max(1, Math.floor(position));
        try {
          const parsed = valid
            .map((t) => ({ t, d: new Date(t).getTime() }))
            .filter(({ d }) => !Number.isNaN(d));
          if (parsed.length === valid.length && parsed.length > 0) {
            parsed.sort((a, b) => a.d - b.d);
            return parsed[pos - 1]?.t;
          }
        } catch (err) {
          void err;
        }
        const sorted = [...valid].sort();
        return sorted[pos - 1];
      };

      const r = Math.min(5, Math.max(1, Math.floor(currentRound))) as
        | 1
        | 2
        | 3
        | 4
        | 5;
      const tee1 = earliestTimeStr(r1Times, 1);
      const tee2 = earliestTimeStr(r2Times, 1);
      const tee3 = r >= 3 ? earliestTimeStr(r3Times, 6) : undefined;
      const tee4 = r >= 4 ? earliestTimeStr(r4Times, 6) : undefined;
      let base = 0;
      if (eventIndex !== 0) {
        if (eventIndex === 1) {
          const bracket = (() => {
            const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
            const p = tc?.playoff ?? 0;
            return p === 2 ? "silver" : p === 1 ? "gold" : null;
          })();

          if (bracket) {
            const participantIds = new Set(snap.teams.map((t) => t.tourCardId));
            const bracketFlag = bracket === "gold" ? 1 : 2;
            const group = snap.tourCards.filter(
              (c) =>
                participantIds.has(c._id) && (c.playoff ?? 0) === bracketFlag,
            );
            const sorted = [...group].sort(
              (a, b) => (b.points ?? 0) - (a.points ?? 0),
            );
            const me = sorted.find((c) => c._id === team.tourCardId);
            if (me) {
              const myPts = me.points ?? 0;
              const better = sorted.filter(
                (c) => (c.points ?? 0) > myPts,
              ).length;
              const tied = sorted.filter(
                (c) => (c.points ?? 0) === myPts,
              ).length;
              const strokes =
                bracket === "gold"
                  ? (snap.tierPoints ?? []).slice(0, 30)
                  : (snap.tierPoints ?? []).slice(0, 40);
              if (tied > 1) {
                const slice = strokes.slice(better, better + tied);
                const sum = slice.reduce(
                  (a: number, b: number) => a + (b ?? 0),
                  0,
                );
                base += tied > 0 ? Math.round((sum / tied) * 10) / 10 : 0;
              } else {
                base += strokes[better] ?? 0;
              }
            }
          }
        }

        if (eventIndex >= 2) {
          base += carryInByTourCardId[String(team.tourCardId)] ?? 0;
        }
      }

      const getRound = (g: SnapGolfer, n: 1 | 2 | 3 | 4) =>
        n === 1
          ? g.roundOne
          : n === 2
            ? g.roundTwo
            : n === 3
              ? g.roundThree
              : g.roundFour;

      const rankForRound = (
        golfers: SnapGolfer[],
        round: 1 | 2 | 3 | 4,
        liveMode: boolean,
      ) => {
        return [...golfers].sort((a, b) => {
          const va = liveMode
            ? (a.today ?? 0)
            : (getRound(a, round) ?? 0) - par;
          const vb = liveMode
            ? (b.today ?? 0)
            : (getRound(b, round) ?? 0) - par;
          if (va !== vb) return va - vb;
          const sa = a.score ?? 0;
          const sb = b.score ?? 0;
          if (sa !== sb) return sa - sb;
          return (a.apiId ?? 0) - (b.apiId ?? 0);
        });
      };

      const selectionCountFor = (ev: 0 | 1 | 2 | 3, round: 1 | 2 | 3 | 4) => {
        if (ev <= 1) return round <= 2 ? 10 : 5;
        if (ev === 2) return 5;
        return 3;
      };

      const pickTopN = (
        golfers: SnapGolfer[],
        round: 1 | 2 | 3 | 4,
        liveMode: boolean,
        n: number,
      ) => rankForRound(golfers, round, liveMode).slice(0, n);

      const avg = (nums: number[]) => {
        const list = nums.filter((n) => Number.isFinite(n));
        if (!list.length) return 0;
        return list.reduce((a, b) => a + b, 0) / list.length;
      };

      const avgOverPar = (golfers: SnapGolfer[], round: 1 | 2 | 3 | 4) => {
        const vals = golfers.map((g) => (getRound(g, round) ?? 0) - par);
        return avg(vals);
      };

      const avgToday = (golfers: SnapGolfer[]) =>
        avg(golfers.map((g) => g.today ?? 0));
      const avgThru = (golfers: SnapGolfer[]) =>
        avg(golfers.map((g) => g.thru ?? 0));

      const contrib = (round: 1 | 2 | 3 | 4, liveMode: boolean) => {
        const required = selectionCountFor(eventIndex, round);
        const eligible = team.golferIds.length > 0 && active.length >= required;
        if (!eligible) {
          const bracket = (() => {
            const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
            const p = tc?.playoff ?? 0;
            return p === 2 ? "silver" : p === 1 ? "gold" : "silver";
          })();
          const worst = { value: 0, thru: liveMode ? undefined : 18 };
          for (const t2 of snap.teams) {
            const tc2 = snap.tourCards.find((c) => c._id === t2.tourCardId);
            const p2 = tc2?.playoff ?? 0;
            const bracket2 = p2 === 2 ? "silver" : p2 === 1 ? "gold" : "silver";
            if (bracket2 !== bracket) continue;

            const tg2 = snap.golfers.filter((g) =>
              t2.golferIds.includes(g.apiId),
            );
            const active2 = tg2.filter(
              (g) => !(g.position && /CUT|WD|DQ/i.test(g.position)),
            );
            const eligible2 =
              t2.golferIds.length > 0 && active2.length >= required;
            if (!eligible2) continue;

            const pool2 =
              required >= 10
                ? tg2
                : pickTopN(active2, round, liveMode, required);
            const today2 = liveMode
              ? avgToday(pool2)
              : avgOverPar(pool2, round);
            const thru2 = liveMode ? avgThru(pool2) : 18;
            if (today2 > worst.value) {
              worst.value = today2;
              worst.thru = thru2;
            }
          }

          return { today: worst.value, thru: worst.thru, overPar: worst.value };
        }

        const pool =
          required >= 10
            ? teamGolfers
            : pickTopN(active, round, liveMode, required);
        if (liveMode) {
          const today = avgToday(pool);
          const thru = avgThru(pool);
          return { today, thru, overPar: today };
        }
        const overPar = avgOverPar(pool, round);
        return { today: overPar, thru: 18, overPar };
      };

      const rawRoundPost = (round: 1 | 2 | 3 | 4) => {
        const required = selectionCountFor(eventIndex, round);
        const eligible = team.golferIds.length > 0 && active.length >= required;
        if (!eligible) {
          const fallback = contrib(round, false);
          return fallback.overPar + par;
        }
        const pool =
          required >= 10
            ? teamGolfers
            : pickTopN(active, round, false, required);
        return avg(pool.map((g) => getRound(g, round) ?? 0));
      };

      const r1Raw = rawRoundPost(1);
      const r2Raw = rawRoundPost(2);
      const r3Raw = rawRoundPost(3);
      const r4Raw = rawRoundPost(4);

      const r1Post = contrib(1, false);
      const r2Post = contrib(2, false);
      const r3Post = contrib(3, false);
      const r4Post = contrib(4, false);
      const isCut = eventIndex === 0 && r >= 3 && active.length < 5;

      let roundOne: number | undefined;
      let roundTwo: number | undefined;
      let roundThree: number | undefined;
      let roundFour: number | undefined;
      let today: number | undefined;
      let thru: number | undefined;
      let score: number | undefined;

      if (isCut) {
        roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
      } else if (r === 1) {
        if (live) {
          const liveC = contrib(1, true);
          today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
          thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
          score =
            eventIndex === 0
              ? (roundDecimalTeamsCron(
                  avg(teamGolfers.map((g) => g.score ?? 0)),
                  1,
                ) ?? undefined)
              : (roundDecimalTeamsCron(base + liveC.today, 1) ?? undefined);
        }
      } else if (r === 2) {
        roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
        if (live) {
          const liveC = contrib(2, true);
          today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
          thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
          score =
            roundDecimalTeamsCron(
              base + (r1Post.overPar ?? 0) + liveC.today,
              1,
            ) ?? undefined;
        } else {
          today = roundDecimalTeamsCron(r1Post.overPar, 1) ?? undefined;
          thru = 18;
          score =
            roundDecimalTeamsCron(base + (r1Post.overPar ?? 0), 1) ?? undefined;
        }
      } else if (r === 3) {
        roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
        if (live) {
          const liveC = contrib(3, true);
          today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
          thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
          score =
            roundDecimalTeamsCron(
              base +
                (r1Post.overPar ?? 0) +
                (r2Post.overPar ?? 0) +
                liveC.today,
              1,
            ) ?? undefined;
        } else {
          today = roundDecimalTeamsCron(r2Post.overPar, 1) ?? undefined;
          thru = 18;
          score =
            roundDecimalTeamsCron(
              base + (r1Post.overPar ?? 0) + (r2Post.overPar ?? 0),
              1,
            ) ?? undefined;
        }
      } else if (r === 4) {
        roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
        roundThree = roundDecimalTeamsCron(r3Raw, 1) ?? undefined;
        if (live) {
          const liveC = contrib(4, true);
          today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
          thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
          score =
            roundDecimalTeamsCron(
              base +
                (r1Post.overPar ?? 0) +
                (r2Post.overPar ?? 0) +
                (r3Post.overPar ?? 0) +
                liveC.today,
              1,
            ) ?? undefined;
        } else {
          today = roundDecimalTeamsCron(r3Post.overPar, 1) ?? undefined;
          thru = 18;
          score =
            roundDecimalTeamsCron(
              base +
                (r1Post.overPar ?? 0) +
                (r2Post.overPar ?? 0) +
                (r3Post.overPar ?? 0),
              1,
            ) ?? undefined;
        }
      } else if (r === 5) {
        roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
        roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
        roundThree = roundDecimalTeamsCron(r3Raw, 1) ?? undefined;
        roundFour = roundDecimalTeamsCron(r4Raw, 1) ?? undefined;
        today = roundDecimalTeamsCron(r4Post.overPar, 1) ?? undefined;
        thru = 18;
        score =
          roundDecimalTeamsCron(
            base +
              (r1Post.overPar ?? 0) +
              (r2Post.overPar ?? 0) +
              (r3Post.overPar ?? 0) +
              (r4Post.overPar ?? 0),
            1,
          ) ?? undefined;
      }

      updates.push({
        teamId: team._id,
        round: r,
        roundOne,
        roundTwo,
        roundThree,
        roundFour,
        today,
        thru,
        score,
        roundOneTeeTime: tee1,
        roundTwoTeeTime: tee2,
        roundThreeTeeTime: tee3,
        roundFourTeeTime: tee4,
        _isCut: isCut,
      });
    }
    if (eventIndex === 0) {
      const labels = (() => {
        const withScore = updates
          .filter((u) => typeof u.score === "number")
          .sort((a, b) => (a.score as number) - (b.score as number));
        const map = new Map<string, string>();
        let i = 0;
        while (i < withScore.length) {
          const score = withScore[i]!.score as number;
          let j = i + 1;
          while (
            j < withScore.length &&
            (withScore[j]!.score as number) === score
          )
            j++;
          const tieCount = j - i;
          const label = (tieCount > 1 ? "T" : "") + (i + 1);
          for (let k = i; k < j; k++)
            map.set(String(withScore[k]!.teamId), label);
          i = j;
        }
        for (const u of updates) {
          if (u._isCut) map.set(String(u.teamId), "CUT");
        }
        return map;
      })();

      for (const u of updates) u.position = labels.get(String(u.teamId));
    } else {
      const playoffByTeamId = new Map<string, number>();
      for (const team of snap.teams) {
        const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
        playoffByTeamId.set(String(team._id), tc?.playoff ?? 0);
      }

      const assignBracket = (bracketFlag: 1 | 2) => {
        const bracketTeams = updates.filter(
          (u) => playoffByTeamId.get(String(u.teamId)) === bracketFlag,
        );
        const withScore = bracketTeams
          .filter((u) => typeof u.score === "number")
          .sort((a, b) => (a.score as number) - (b.score as number));

        let i = 0;
        while (i < withScore.length) {
          const score = withScore[i]!.score as number;
          let j = i + 1;
          while (
            j < withScore.length &&
            (withScore[j]!.score as number) === score
          )
            j++;
          const tieCount = j - i;
          const label = (tieCount > 1 ? "T" : "") + (i + 1);
          for (let k = i; k < j; k++) withScore[k]!.position = label;
          i = j;
        }
      };

      assignBracket(1);
      assignBracket(2);
    }
    const parsePosNum = (pos?: string) => {
      const m = pos ? /\d+/.exec(pos) : null;
      return m ? parseInt(m[0], 10) : null;
    };

    const avgAwards = (arr: number[], start: number, count: number) => {
      let sum = 0;
      for (let i = 0; i < count; i++) sum += arr[start + i] ?? 0;
      return count > 0 ? sum / count : 0;
    };

    const awardPointsAndEarnings = (group: Update[], offset: number) => {
      const byPos = new Map<number, Update[]>();
      for (const t of group) {
        const n = parsePosNum(t.position);
        if (!n || n <= 0) continue;
        const arr = byPos.get(n) ?? [];
        arr.push(t);
        byPos.set(n, arr);
      }
      const positions = Array.from(byPos.keys()).sort((a, b) => a - b);
      for (const p of positions) {
        const tied = byPos.get(p)!;
        const count = tied.length;
        const baseIdx = p - 1 + offset;
        const pts = avgAwards(snap.tierPoints ?? [], baseIdx, count);
        const pay = avgAwards(snap.tierPayouts ?? [], baseIdx, count);
        for (const t of tied) {
          t.points = Math.round(pts);
          t.earnings = Math.round(pay);
        }
      }
    };

    const awardEarningsOnly = (group: Update[], offset: number) => {
      const byPos = new Map<number, Update[]>();
      for (const t of group) {
        const n = parsePosNum(t.position);
        if (!n || n <= 0) continue;
        const arr = byPos.get(n) ?? [];
        arr.push(t);
        byPos.set(n, arr);
      }
      const positions = Array.from(byPos.keys()).sort((a, b) => a - b);
      for (const p of positions) {
        const tied = byPos.get(p)!;
        const count = tied.length;
        const baseIdx = p - 1 + offset;
        const pay = avgAwards(snap.tierPayouts ?? [], baseIdx, count);
        for (const t of tied) {
          t.points = 0;
          t.earnings = Math.round(pay);
        }
      }
    };

    if (eventIndex !== 0) {
      for (const u of updates) u.points = 0;

      const isFinalPlayoff = eventIndex === 3 && currentRound === 5;
      if (isFinalPlayoff) {
        const playoffByTeamId = new Map<string, number>();
        for (const team of snap.teams) {
          const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
          playoffByTeamId.set(String(team._id), tc?.playoff ?? 0);
        }
        const bracket1 = updates.filter(
          (u) => playoffByTeamId.get(String(u.teamId)) === 1,
        );
        const bracket2 = updates.filter(
          (u) => playoffByTeamId.get(String(u.teamId)) === 2,
        );
        awardEarningsOnly(bracket1, 0);
        awardEarningsOnly(bracket2, 75);
      } else {
        for (const u of updates) u.earnings = 0;
      }
    } else {
      awardPointsAndEarnings(updates, 0);
    }
    const cleanUpdates = updates.map(({ _isCut, ...rest }) => rest);

    return await ctx.runMutation(internal.functions.cronJobs.applyTeamsUpdate, {
      tournamentId,
      updates: cleanUpdates,
    });
  },
});

const CronJobNameValidator = v.union(
  v.literal("datagolf_live_sync"),
  v.literal("update_teams"),
  v.literal("recompute_standings"),
  v.literal("create_groups_for_next_tournament"),
);

type CronJobName =
  | "datagolf_live_sync"
  | "update_teams"
  | "recompute_standings"
  | "create_groups_for_next_tournament";

type CronRunOk = {
  ok: true;
  job: CronJobName;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  result: unknown;
};

type CronRunErr = {
  ok: false;
  job: CronJobName;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  error: {
    message: string;
    stack?: string;
  };
};

export const adminRunCronJob = action({
  args: {
    job: CronJobNameValidator,
    tournamentId: v.optional(v.id("tournaments")),
    confirm: v.boolean(),
  },
  handler: async (ctx, args): Promise<CronRunOk | CronRunErr> => {
    const startedAt = Date.now();

    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Unauthorized: You must be signed in");
      }

      const member = await ctx.runQuery(api.functions.members.getMembers, {
        options: { clerkId: identity.subject },
      });

      const role =
        member &&
        typeof member === "object" &&
        !Array.isArray(member) &&
        "role" in member
          ? (member as { role?: unknown }).role
          : undefined;

      const normalizedRole =
        typeof role === "string" ? role.trim().toLowerCase() : "";

      if (normalizedRole !== "admin" && normalizedRole !== "moderator") {
        throw new Error("Forbidden: Moderator or admin access required");
      }

      if (!args.confirm && args.job !== "create_groups_for_next_tournament") {
        throw new Error(
          "Confirmation required: set confirm=true to run a mutating cron job",
        );
      }

      let result: unknown;
      const tournamentId = args.tournamentId as Id<"tournaments"> | undefined;

      switch (args.job) {
        case "datagolf_live_sync": {
          result = await ctx.runAction(
            internal.functions.cronJobs.runDataGolfLiveSync,
            {
              tournamentId,
            },
          );
          break;
        }
        case "update_teams": {
          result = await ctx.runAction(
            internal.functions.cronJobs.runUpdateTeamsForActiveTournament,
            { tournamentId },
          );
          break;
        }
        case "create_groups_for_next_tournament": {
          if (!args.confirm) {
            const target = await ctx.runQuery(
              internal.functions.cronJobs.getCreateGroupsTarget,
              { tournamentId },
            );

            const [fieldUpdates, rankings] = await Promise.all([
              ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
                options: { tour: "pga" },
              }),
              ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
            ]);

            console.log(
              "[adminRunCronJob:preview] DataGolf field-updates payload",
              fieldUpdates,
            );

            const dataGolfEventName =
              typeof (fieldUpdates as { event_name?: unknown }).event_name ===
              "string"
                ? (fieldUpdates as { event_name: string }).event_name
                : "";

            const field = Array.isArray(
              (fieldUpdates as { field?: unknown }).field,
            )
              ? ((fieldUpdates as { field: unknown[] }).field as FieldPlayer[])
              : [];

            const rankingsList = Array.isArray(
              (rankings as { rankings?: unknown }).rankings,
            )
              ? ((rankings as { rankings: unknown[] })
                  .rankings as RankedPlayer[])
              : [];

            const byDgId = new Map<number, RankedPlayer>();
            for (const r of rankingsList) byDgId.set(r.dg_id, r);

            const plannedGroups = await (async () => {
              if (
                target &&
                typeof target === "object" &&
                "skipped" in target &&
                (target as { skipped?: unknown }).skipped === true
              ) {
                return target;
              }

              if (!dataGolfEventName.trim()) {
                return {
                  ok: true,
                  skipped: true,
                  reason: "missing_datagolf_event_name",
                  dataGolfEventName,
                } as const;
              }

              const tournamentName =
                target &&
                typeof target === "object" &&
                "tournamentName" in target &&
                typeof (target as { tournamentName?: unknown })
                  .tournamentName === "string"
                  ? (target as { tournamentName: string }).tournamentName
                  : "";

              const compatible = eventNameLooksCompatible(
                tournamentName,
                dataGolfEventName,
              );

              if (!compatible.ok) {
                return {
                  ok: true,
                  skipped: true,
                  reason: "event_name_mismatch",
                  tournamentName,
                  dataGolfEventName,
                  score: compatible.score,
                  intersection: compatible.intersection,
                  expectedTokens: compatible.expectedTokens,
                  actualTokens: compatible.actualTokens,
                } as const;
              }

              const processed: EnhancedGolfer[] = field
                .filter((g) => !EXCLUDED_GOLFER_IDS.has(g.dg_id))
                .map((g) => ({ ...g, ranking: byDgId.get(g.dg_id) }))
                .sort(
                  (a, b) =>
                    (b.ranking?.dg_skill_estimate ?? -50) -
                    (a.ranking?.dg_skill_estimate ?? -50),
                );

              const groups: EnhancedGolfer[][] = [[], [], [], [], []];
              processed.forEach((g, index) => {
                const gi = determineGroupIndex(index, processed.length, groups);
                groups[gi]!.push(g);
              });

              const payload = groups.map((group, idx) => ({
                groupNumber: idx + 1,
                golfers: group.map((g) => ({
                  dgId: g.dg_id,
                  playerName: normalizePlayerNameFromDataGolf(g.player_name),
                  country: g.country,
                  worldRank: g.ranking?.owgr_rank,
                  rating: normalizeDgSkillEstimateToPgcRating(
                    g.ranking?.dg_skill_estimate ?? -1.875,
                  ),
                  ...(typeof g.r1_teetime === "string" &&
                  g.r1_teetime.trim().length
                    ? {
                        r1TeeTime: g.r1_teetime,
                        ...(typeof g.r2_teetime === "string" &&
                        g.r2_teetime.trim().length
                          ? { r2TeeTime: g.r2_teetime }
                          : {}),
                      }
                    : {}),
                  skillEstimate: g.ranking?.dg_skill_estimate,
                })),
              }));

              const resolvedTournamentId =
                target &&
                typeof target === "object" &&
                "tournamentId" in target &&
                typeof (target as { tournamentId?: unknown }).tournamentId ===
                  "string"
                  ? (target as { tournamentId: string }).tournamentId
                  : null;

              const tournamentGolfers = payload.flatMap((group) =>
                group.golfers.map((g) => ({
                  golferApiId: g.dgId,
                  group: group.groupNumber,
                  worldRank: g.worldRank ?? 501,
                  rating: g.rating,
                  ...(typeof g.r1TeeTime === "string"
                    ? { roundOneTeeTime: g.r1TeeTime }
                    : {}),
                  ...(typeof g.r2TeeTime === "string"
                    ? { roundTwoTeeTime: g.r2TeeTime }
                    : {}),
                })),
              );

              const apiIds = tournamentGolfers.map((g) => g.golferApiId);
              const lookups = await ctx.runQuery(
                internal.functions.cronJobs.getGolferIdsByApiIds,
                { apiIds },
              );

              const apiIdToGolferId = new Map<number, string>();
              for (const row of lookups) {
                if (row.golferId) apiIdToGolferId.set(row.apiId, row.golferId);
              }

              const missingGolferApiIds = tournamentGolfers
                .map((g) => g.golferApiId)
                .filter((apiId) => !apiIdToGolferId.has(apiId));

              const golfersToInsert = (() => {
                const byApiId = new Map<
                  number,
                  { apiId: number; playerName: string; country?: string }
                >();
                for (const group of payload) {
                  for (const g of group.golfers) {
                    if (!missingGolferApiIds.includes(g.dgId)) continue;
                    if (byApiId.has(g.dgId)) continue;
                    byApiId.set(g.dgId, {
                      apiId: g.dgId,
                      playerName: g.playerName,
                      ...(typeof g.country === "string" && g.country.trim()
                        ? { country: g.country }
                        : {}),
                    });
                  }
                }
                return Array.from(byApiId.values());
              })();

              const tournamentGolferInserts = tournamentGolfers.map((g) => ({
                tournamentId: resolvedTournamentId,
                golferId: apiIdToGolferId.get(g.golferApiId) ?? null,
                group: g.group,
                rating: g.rating,
                ...(typeof g.roundOneTeeTime === "string"
                  ? { roundOneTeeTime: g.roundOneTeeTime }
                  : {}),
                ...(typeof g.roundTwoTeeTime === "string"
                  ? { roundTwoTeeTime: g.roundTwoTeeTime }
                  : {}),
                worldRank: g.worldRank,
              }));

              return {
                ok: true,
                skipped: false,
                dataGolfEventName,
                totalGolfers: processed.length,
                tournamentId: resolvedTournamentId,
                groups: payload,
                tournamentGolfers: tournamentGolferInserts,
                missingGolferApiIds,
                golfersToInsert,
                groupSizes: payload.map((g) => ({
                  groupNumber: g.groupNumber,
                  golfers: g.golfers.length,
                })),
              } as const;
            })();

            result = {
              mode: "preview" as const,
              job: "create_groups_for_next_tournament" as const,
              target,
              cronOutput: plannedGroups,
              incoming: {
                fieldUpdates,
                rankings,
              },
            };
          } else {
            result = await ctx.runAction(
              internal.functions.cronJobs.runCreateGroupsForNextTournament,
              { tournamentId },
            );
          }
          break;
        }
        case "recompute_standings": {
          result = await ctx.runMutation(
            internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
            {},
          );
          break;
        }
        default: {
          const exhaustiveCheck: never = args.job;
          throw new Error(`Unsupported job: ${exhaustiveCheck}`);
        }
      }

      const finishedAt = Date.now();
      return {
        ok: true,
        job: args.job,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        result,
      };
    } catch (err) {
      const finishedAt = Date.now();
      const message = err instanceof Error ? err.message : "Unknown error";
      const stack = err instanceof Error ? err.stack : undefined;
      return {
        ok: false,
        job: args.job,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error: { message, stack },
      };
    }
  },
});
