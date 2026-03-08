import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { EnhancedGolfer } from "../types/golfers";
import { api, internal } from "../_generated/api";
import {
  DataGolfFieldUpdatesResponse,
  DataGolfRankingsResponse,
  DataGolfLiveModelPredictionsResponse,
  DataGolfHistoricalEventDataResponse,
  DataGolfHistoricalRoundDataResponse,
} from "../types/datagolf";

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
        historicalData: DataGolfHistoricalRoundDataResponse|undefined;
        winningsData: DataGolfHistoricalEventDataResponse|undefined;
      }
    | { ok: false }
  > => {
    const tournamentForDataGolf = {
      _id: args.tournament._id,
      name: args.tournament.name,
      apiId: args.tournament.apiId,
      seasonId: args.tournament.seasonId,
    };
    const fieldData = await ctx.runAction(
      api.functions.datagolf.fetchFieldUpdates,
      { tournament: tournamentForDataGolf },
    );
    const rankingData = await ctx.runAction(
      api.functions.datagolf.fetchDataGolfRankings,
      {},
    );
    const liveData = await ctx.runAction(
      api.functions.datagolf.fetchLiveModelPredictions,
      { tournament: tournamentForDataGolf },
    );
    console.log(Date.now() > args.tournament.endDate, Date.now() , args.tournament.endDate);
    const historicalData = args.tournament.endDate < Date.now() ? await ctx.runAction(
      api.functions.datagolf.fetchHistoricalRoundData,
      {
        tournament: tournamentForDataGolf,
        options: {
          tour: "pga",
          year: new Date().getFullYear(),
          tzOffset: args.tzOffset,
        },
      },
    ) : undefined;
    const winningsData = args.tournament.endDate < Date.now() ? await ctx.runAction(
      api.functions.datagolf.fetchHistoricalEventDataEvents,
      {
        tournament: tournamentForDataGolf,
        options: {
          tour: "pga",
          year: new Date().getFullYear(),
        },
      },
    ):undefined;
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
      historicalData:
        historicalData as unknown as DataGolfHistoricalRoundDataResponse|undefined,
      winningsData:
        winningsData as unknown as DataGolfHistoricalEventDataResponse|undefined,
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
        historicalData: DataGolfHistoricalRoundDataResponse|undefined;
        winningsData: DataGolfHistoricalEventDataResponse|undefined;
      }
    | { ok: false }
  > => {
    const databaseData = await ctx.runQuery(
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
      },
    );
    if (!databaseData.ok || !externalData.ok) {
      return {
        ok: false,
      };
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
      winnings: externalData.winningsData?.event_stats
        ? externalData.winningsData?.event_stats.find(
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
      winningsData: externalData.winningsData,
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
      livePlay: v.optional(v.boolean()),
      currentRound: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const updateData: Partial<Doc<"tournaments">> = {
      ...args.tournament,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(args.tournament._id, updateData);

    return {
      ok: true,
      tournamentId: args.tournament._id,
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
    } as const;
  },
});
