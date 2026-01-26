import { v } from "convex/values";

import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";

import type { FieldPlayer, RankedPlayer } from "../types/datagolf";
import type { Doc, Id } from "../_generated/dataModel";

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
    function normalizePlayerNameFromDataGolf(raw: string): string {
      const trimmed = raw.trim();
      if (!trimmed.includes(",")) return trimmed;
      const parts = trimmed
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === 2) {
        const [last, first] = parts;
        return `${first} ${last}`.replace(/\s+/g, " ").trim();
      }
      const last = parts[0] ?? trimmed;
      const first = parts[parts.length - 1] ?? "";
      const suffix = parts.slice(1, parts.length - 1).join(" ");
      return `${first} ${last}${suffix ? ` ${suffix}` : ""}`
        .replace(/\s+/g, " ")
        .trim();
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

        const rating =
          Math.round((((g.skillEstimate ?? -1.875) + 2) / 0.04) * 100) / 100;

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
      internal.functions.cronGroups.getCreateGroupsTarget,
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
        internal.functions.cronGroups.copyFromFirstPlayoff,
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

    const dataGolfEventName =
      typeof (fieldUpdates as { event_name?: unknown }).event_name === "string"
        ? (fieldUpdates as { event_name: string }).event_name
        : "";

    if (dataGolfEventName) {
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
    }

    const field = Array.isArray(fieldUpdates.field)
      ? (fieldUpdates.field as FieldPlayer[])
      : [];

    const rankingsList = Array.isArray(rankings.rankings)
      ? (rankings.rankings as RankedPlayer[])
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
      internal.functions.cronGroups.applyCreateGroups,
      {
        tournamentId,
        groups: groups.map((group, idx) => ({
          groupNumber: idx + 1,
          golfers: group.map((g) => ({
            dgId: g.dg_id,
            playerName: g.player_name,
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

    return {
      ok: true,
      tournamentId,
      createGroups: createResult,
    };
  },
});
