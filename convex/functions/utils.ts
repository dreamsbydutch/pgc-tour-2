import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { EnhancedGolfer } from "../types/types";
import { internal } from "../_generated/api";
import {
  DataGolfFieldUpdatesResponse,
  DataGolfRankingsResponse,
  DataGolfLiveModelPredictionsResponse,
  DataGolfHistoricalEventDataResponse,
  DataGolfHistoricalRoundDataResponse,
} from "../types/datagolf";
import { chunkArray } from "../utils/golfers";

type MissingTournamentGolferInput = {
  dg_id: number;
  player_name: string;
  country?: string;
  worldRank?: number;
  dg_skill_estimate?: number;
  r1_teetime?: number;
  r2_teetime?: number;
};

export function collectMissingTournamentGolfers(args: {
  existingApiIds: ReadonlySet<number>;
  fieldData: DataGolfFieldUpdatesResponse;
  rankingData: DataGolfRankingsResponse;
  liveData: DataGolfLiveModelPredictionsResponse;
  historicalData?: DataGolfHistoricalRoundDataResponse;
}): MissingTournamentGolferInput[] {
  const fieldById = new Map(
    (args.fieldData.field ?? []).map((player) => [player.dg_id, player]),
  );
  const rankingById = new Map(
    (args.rankingData.rankings ?? []).map((player) => [player.dg_id, player]),
  );
  const namesById = new Map<number, string>();
  for (const player of args.fieldData.field ?? []) {
    namesById.set(player.dg_id, player.player_name);
  }
  for (const player of args.liveData.data ?? []) {
    namesById.set(player.dg_id, player.player_name);
  }
  for (const player of args.historicalData?.scores ?? []) {
    namesById.set(player.dg_id, player.player_name);
  }

  const missing: MissingTournamentGolferInput[] = [];
  for (const [dgId, playerName] of namesById) {
    if (
      args.existingApiIds.has(dgId) ||
      !Number.isSafeInteger(dgId) ||
      dgId <= 0 ||
      !playerName.trim()
    ) {
      continue;
    }
    const field = fieldById.get(dgId);
    const ranking = rankingById.get(dgId);
    const fieldWorldRank = field?.owgr_rank;
    const rankingWorldRank = ranking?.owgr_rank;
    const worldRank =
      Number.isFinite(fieldWorldRank) && (fieldWorldRank ?? 0) > 0
        ? fieldWorldRank
        : Number.isFinite(rankingWorldRank) && (rankingWorldRank ?? 0) > 0
          ? rankingWorldRank
          : undefined;
    const skillEstimate = ranking?.dg_skill_estimate;
    const roundOneTeeTime = field?.teetimes.find(
      (time) => time.round_num === 1,
    )?.teetime;
    const roundTwoTeeTime = field?.teetimes.find(
      (time) => time.round_num === 2,
    )?.teetime;
    missing.push({
      dg_id: dgId,
      player_name: playerName,
      ...(field?.country ? { country: field.country } : {}),
      ...(worldRank !== undefined ? { worldRank } : {}),
      ...(Number.isFinite(skillEstimate)
        ? { dg_skill_estimate: skillEstimate }
        : {}),
      ...(typeof roundOneTeeTime === "number"
        ? { r1_teetime: roundOneTeeTime }
        : {}),
      ...(typeof roundTwoTeeTime === "number"
        ? { r2_teetime: roundTwoTeeTime }
        : {}),
    });
  }
  return missing;
}

export const getActiveTournamentData = internalQuery({
  handler: async (
    ctx,
  ): Promise<
    | {
        ok: true;
        type: "active" | "next" | "recent";
        tournament: Doc<"tournaments">;
        course: Doc<"courses">;
        tier: Doc<"tiers">;
        tours: Doc<"tours">[];
        seasonTournaments: Array<Doc<"tournaments">>;
        playoffTournaments: Array<Doc<"tournaments">>;
        eventIndex: 0 | 1 | 2 | 3;
        isPlayoff: boolean;
      }
    | {
        ok: false;
      }
  > => {
    const now = new Date().getFullYear();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", now))
      .first();
    if (!currentSeason) {
      return { ok: false };
    }
    const tournaments: Doc<"tournaments">[] = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .collect();
    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .collect();
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .collect();
    const playoffTournaments = tournaments
      .filter(
        (t) =>
          t.tierId ===
          tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
      )
      .sort((a, b) => a.startDate - b.startDate);
    let tournament = tournaments.find((t) => t.status === "active");
    if (tournament) {
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "active",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    tournament = tournaments.find(
      (t) => t.startDate < Date.now() && t.endDate > Date.now(),
    );
    if (tournament) {
      console.log(
        "No active tournament found, defaulting to next tournament:",
        tournament,
      );
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "active",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    tournament = tournaments
      .filter((t) => t.startDate > Date.now())
      .sort((a, b) => a.startDate - b.startDate)[0];
    console.log(
      "No active tournament found, defaulting to next tournament:",
      tournament,
    );
    if (tournament) {
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "next",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    tournament = tournaments
      .filter((t) => t.endDate < Date.now())
      .sort((a, b) => b.endDate - a.endDate)[0];
    if (tournament) {
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "recent",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoffs")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    return { ok: false };
  },
});
export const getTournamentDataById = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        ok: true;
        type: "active" | "next" | "recent";
        tournament: Doc<"tournaments">;
        course: Doc<"courses">;
        tier: Doc<"tiers">;
        tours: Doc<"tours">[];
        seasonTournaments: Array<Doc<"tournaments">>;
        playoffTournaments: Array<Doc<"tournaments">>;
        eventIndex: 0 | 1 | 2 | 3;
        isPlayoff: boolean;
      }
    | {
        ok: false;
      }
  > => {
    const now = new Date().getFullYear();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", now))
      .first();
    if (!currentSeason) {
      return { ok: false };
    }
    const tournaments: Doc<"tournaments">[] = await ctx.db
      .query("tournaments")
      .withIndex("by_id", (q) => q.eq("_id", args.tournamentId))
      .collect();
    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .collect();
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .collect();
    const playoffTournaments = tournaments
      .filter(
        (t) =>
          t.tierId ===
          tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
      )
      .sort((a, b) => a.startDate - b.startDate);
    let tournament = tournaments.find((t) => t.status === "active");
    if (tournament) {
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "active",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    tournament = tournaments.find(
      (t) => t.startDate < Date.now() && t.endDate > Date.now(),
    );
    if (tournament) {
      console.log(
        "No active tournament found, defaulting to next tournament:",
        tournament,
      );
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "active",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    tournament = tournaments
      .filter((t) => t.startDate > Date.now())
      .sort((a, b) => a.startDate - b.startDate)[0];
    console.log(
      "No active tournament found, defaulting to next tournament:",
      tournament,
    );
    if (tournament) {
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "next",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoff")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    tournament = tournaments
      .filter((t) => t.endDate < Date.now())
      .sort((a, b) => b.endDate - a.endDate)[0];
    if (tournament) {
      const playoffIndex = playoffTournaments.findIndex(
        (t) => t._id === tournament?._id,
      );
      const isPlayoff = playoffIndex !== -1;
      const course = await ctx.db.get(tournament.courseId);
      return {
        ok: true,
        type: "recent",
        tournament,
        course: course as Doc<"courses">,
        tier: tiers.find(
          (tier) => tier._id === tournament?.tierId,
        ) as Doc<"tiers">,
        tours,
        isPlayoff,
        eventIndex:
          playoffIndex !== -1 ? ((playoffIndex + 1) as 0 | 1 | 2 | 3) : 0,
        playoffTournaments,
        seasonTournaments: tournaments
          .filter(
            (t) =>
              t.tierId !==
              tiers.find((tier) => tier.name.toLowerCase() === "playoffs")?._id,
          )
          .sort((a, b) => a.startDate - b.startDate),
      };
    }
    return { ok: false };
  },
});

export const getCurrentSeason = internalQuery({
  handler: async (
    ctx,
  ): Promise<{ ok: true; season: Doc<"seasons"> } | { ok: false }> => {
    const now = new Date().getFullYear();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", now))
      .first();
    if (!currentSeason) {
      return { ok: false };
    }
    return { ok: true, season: currentSeason };
  },
});

export const getDatabaseDataForTournament = internalQuery({
  args: {
    tournamentId: v.id("tournaments"),
    seasonId: v.id("seasons"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        ok: true;
        teams: (Doc<"teams"> & {
          tourCard?: Doc<"tourCards">;
          tour?: Doc<"tours">;
        })[];
        golfers: EnhancedGolfer[];
      }
    | { ok: false }
  > => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    if (!teams || !tournamentGolfers) {
      return { ok: false };
    }
    const golfers = await Promise.all(
      tournamentGolfers.map(async (tg) => ({
        tournamentGolfer: tg,
        golfer: (await ctx.db.get(tg.golferId)) ?? undefined,
      })),
    );

    return {
      ok: true,
      teams: teams.map((team) => {
        const tc = tourCards.find((tc) => tc._id === team.tourCardId);
        return {
          ...team,
          tourCard: tc,
          tour: tours.find((t) => t._id === tc?.tourId),
        };
      }),
      golfers,
    };
  },
});
export const getExternalDataForTournament = internalAction({
  args: {
    tournament: v.object({
      _id: v.id("tournaments"),
      name: v.string(),
      apiId: v.optional(v.string()),
      endDate: v.number(),
      seasonId: v.id("seasons"),
    }),
    tzOffset: v.optional(v.number()),
    includeStatic: v.optional(v.boolean()),
    includeHistorical: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        ok: true;
        fieldData: DataGolfFieldUpdatesResponse;
        rankingData: DataGolfRankingsResponse;
        liveData: DataGolfLiveModelPredictionsResponse;
        historicalData: DataGolfHistoricalRoundDataResponse | undefined;
        historicalEventData: DataGolfHistoricalEventDataResponse | undefined;
      }
    | { ok: false }
  > => {
    const tournamentForDataGolf = {
      _id: args.tournament._id,
      name: args.tournament.name,
      apiId: args.tournament.apiId,
      seasonId: args.tournament.seasonId,
    };
    const includeStatic = args.includeStatic ?? true;
    const fieldData = includeStatic
      ? await ctx.runAction(internal.functions.datagolf.fetchFieldUpdates, {
          tournament: tournamentForDataGolf,
        })
      : ({ field: [] } as unknown as DataGolfFieldUpdatesResponse);
    const rankingData = includeStatic
      ? await ctx.runAction(
          internal.functions.datagolf.fetchDataGolfRankings,
          {},
        )
      : ({ rankings: [] } as unknown as DataGolfRankingsResponse);
    const liveData = await ctx.runAction(
      internal.functions.datagolf.fetchLiveModelPredictions,
      { tournament: tournamentForDataGolf },
    );
    console.log(
      Date.now() > args.tournament.endDate,
      Date.now(),
      args.tournament.endDate,
    );
    const includeHistorical =
      args.includeHistorical ?? args.tournament.endDate < Date.now();
    const historicalData = includeHistorical
      ? await ctx.runAction(
          internal.functions.datagolf.fetchHistoricalRoundData,
          {
            tournament: tournamentForDataGolf,
            options: {
              tour: "pga",
              year: new Date().getFullYear(),
              tzOffset: args.tzOffset,
            },
          },
        )
      : undefined;
    const historicalEventData = includeHistorical
      ? await ctx.runAction(
          internal.functions.datagolf.fetchHistoricalEventDataEvents,
          {
            tournament: tournamentForDataGolf,
            options: {
              tour: "pga",
              year: new Date().getFullYear(),
            },
          },
        )
      : undefined;
    if ("ok" in fieldData && !rankingData && "ok" in liveData) {
      return {
        ok: false,
      };
    }
    return {
      ok: true,
      fieldData: fieldData as unknown as DataGolfFieldUpdatesResponse,
      rankingData: rankingData as DataGolfRankingsResponse,
      liveData: liveData as unknown as DataGolfLiveModelPredictionsResponse,
      historicalData: historicalData as unknown as
        | DataGolfHistoricalRoundDataResponse
        | undefined,
      historicalEventData: historicalEventData as unknown as
        | DataGolfHistoricalEventDataResponse
        | undefined,
    };
  },
});

export const getAllDataForTournament = internalAction({
  args: {
    tournament: v.object({
      _id: v.id("tournaments"),
      name: v.string(),
      endDate: v.number(),
      apiId: v.optional(v.string()),
      seasonId: v.id("seasons"),
    }),
    tzOffset: v.optional(v.number()),
    includeStatic: v.optional(v.boolean()),
    includeHistorical: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        ok: true;
        golfers: EnhancedGolfer[];
        teams: (Doc<"teams"> & {
          golfers: EnhancedGolfer[];
          tourCard?: Doc<"tourCards">;
          tour?: Doc<"tours">;
        })[];
        fieldData: DataGolfFieldUpdatesResponse;
        rankingData: DataGolfRankingsResponse;
        liveData: DataGolfLiveModelPredictionsResponse;
        historicalData: DataGolfHistoricalRoundDataResponse | undefined;
        historicalEventData: DataGolfHistoricalEventDataResponse | undefined;
      }
    | { ok: false }
  > => {
    let databaseData = await ctx.runQuery(
      internal.functions.utils.getDatabaseDataForTournament,
      {
        tournamentId: args.tournament._id,
        seasonId: args.tournament.seasonId,
      },
    );
    const externalData = await ctx.runAction(
      internal.functions.utils.getExternalDataForTournament,
      {
        tournament: args.tournament,
        tzOffset: args.tzOffset,
        includeStatic: args.includeStatic,
        includeHistorical: args.includeHistorical,
      },
    );
    if (!databaseData.ok || !externalData.ok) {
      return {
        ok: false,
      };
    }
    const missingGolfers = collectMissingTournamentGolfers({
      existingApiIds: new Set(
        databaseData.golfers.flatMap((golfer) =>
          golfer.golfer?.apiId ? [golfer.golfer.apiId] : [],
        ),
      ),
      fieldData: externalData.fieldData,
      rankingData: externalData.rankingData,
      liveData: externalData.liveData,
      historicalData: externalData.historicalData,
    });
    for (const golferBatch of chunkArray(missingGolfers, 50)) {
      await ctx.runMutation(
        internal.functions.golfers.createMissingTournamentGolfers,
        {
          tournamentId: args.tournament._id,
          golfers: golferBatch,
        },
      );
    }
    if (missingGolfers.length > 0) {
      databaseData = await ctx.runQuery(
        internal.functions.utils.getDatabaseDataForTournament,
        {
          tournamentId: args.tournament._id,
          seasonId: args.tournament.seasonId,
        },
      );
      if (!databaseData.ok) return { ok: false };
    }
    const outputGolfers = databaseData.golfers.map((g) => ({
      ...g,
      field: externalData.fieldData.field
        ? externalData.fieldData.field.find(
            (fu) => fu.dg_id === g.golfer?.apiId,
          )
        : undefined,
      ranking: externalData.rankingData.rankings
        ? externalData.rankingData.rankings.find(
            (r) => r.dg_id === g.golfer?.apiId,
          )
        : undefined,
      live: externalData.liveData.data
        ? externalData.liveData.data.find((p) => p.dg_id === g.golfer?.apiId)
        : undefined,
      historical: externalData.historicalData?.scores
        ? externalData.historicalData?.scores.find(
            (e) => e.dg_id === g.golfer?.apiId,
          )
        : undefined,
      historicalEvent: externalData.historicalEventData?.event_stats
        ? externalData.historicalEventData?.event_stats.find(
            (e) => e.dg_id === g.golfer?.apiId,
          )
        : undefined,
    }));
    return {
      ok: true,
      golfers: outputGolfers,
      teams: databaseData.teams.map((t) => ({
        ...t,
        golfers: outputGolfers.filter(
          (g) =>
            t.golferIds.includes(g.golfer?.apiId ?? -1) &&
            (g.tournamentGolfer?.group ?? 0) > 0,
        ),
      })),
      fieldData: externalData.fieldData,
      rankingData: externalData.rankingData,
      liveData: externalData.liveData,
      historicalData: externalData.historicalData,
      historicalEventData: externalData.historicalEventData,
    };
  },
});
export const updateTournamentInfo = internalMutation({
  args: {
    tournament: v.object({
      _id: v.id("tournaments"),
      status: v.optional(
        v.union(
          v.literal("upcoming"),
          v.literal("active"),
          v.literal("completed"),
        ),
      ),
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      livePlay: v.optional(v.boolean()),
      currentRound: v.optional(v.number()),
      leaderboardLastUpdatedAt: v.optional(v.number()),
      dataGolfInPlayLastUpdate: v.optional(v.union(v.string(), v.number())),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.tournament._id);
    if (!existing) {
      return {
        ok: false,
        changed: false,
        tournamentId: args.tournament._id,
      } as const;
    }
    const { _id, ...candidate } = args.tournament;
    const changedEntries = Object.entries(candidate).filter(
      ([key, value]) => existing[key as keyof typeof existing] !== value,
    );
    if (changedEntries.length === 0) {
      return {
        ok: true,
        changed: false,
        tournamentId: _id,
      } as const;
    }
    const updateData: Partial<Doc<"tournaments">> = {
      ...Object.fromEntries(changedEntries),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(_id, updateData);

    return {
      ok: true,
      changed: true,
      tournamentId: _id,
    } as const;
  },
});

export const getIsAdminByClerkId_Internal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return {
      ok: true,
      isAdmin: Boolean(member && member.role === "admin"),
      memberId: member?._id,
    } as const;
  },
});
