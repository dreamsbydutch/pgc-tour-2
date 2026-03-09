/**
 * Tournament management queries, mutations, and tournament data composition.
 */

import { api, internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  DataGolfFieldPlayer,
  DataGolfFieldUpdatesResponse,
  DataGolfHistoricalEventDataResponse,
  DataGolfHistoricalEventDataStat,
  DataGolfHistoricalPlayer,
  DataGolfHistoricalRoundDataResponse,
  DataGolfLiveModelPlayer,
  DataGolfLiveModelPredictionsResponse,
  DataGolfRankedPlayer,
  DataGolfRankingsResponse,
} from "../types/datagolf";
import { v } from "convex/values";
import { requireAdmin } from "./auth";

type SeasonDoc = Doc<"seasons">;
type TournamentDoc = Doc<"tournaments">;
type TierDoc = Doc<"tiers">;
type TourDoc = Doc<"tours">;
type CourseDoc = Doc<"courses">;
type TourCardDoc = Doc<"tourCards">;
type TeamDoc = Doc<"teams">;
type TournamentGolferDoc = Doc<"tournamentGolfers">;
type GolferDoc = Doc<"golfers">;

type TournamentStatus = "active" | "completed" | "upcoming" | "past";
type ActiveTournamentType = "active" | "next" | "recent";
type PlayoffEventIndex = 0 | 1 | 2 | 3 | 4;

type TournamentReturnType = { ok: true; tournament: TournamentDoc };
type FocusTournamentReturnType =
  | { ok: false }
  | {
      ok: true;
      tournament: TournamentDoc;
      status: TournamentStatus;
    };
type TournamentsReturnType = { ok: true; tournaments: TournamentDoc[] };
type DeleteTournamentReturnType = { ok: true };
type ActiveTournamentDataResult = {
  ok: true;
  type: ActiveTournamentType;
  tournament: TournamentDoc;
  course: CourseDoc;
  tier: TierDoc;
  tours: TourDoc[];
  seasonTournaments: TournamentDoc[];
  playoffTournaments: TournamentDoc[];
  eventIndex: PlayoffEventIndex;
  isPlayoff: boolean;
};

type TournamentWriteArgs = {
  seasonId: Id<"seasons">;
  startDate: number;
  endDate: number;
  tierId: Id<"tiers">;
  courseId: Id<"courses">;
};

type TournamentCtx = {
  db: DatabaseReader | DatabaseWriter;
};

type TournamentWindowSelection = {
  active?: TournamentDoc;
  inRange?: TournamentDoc;
  next?: TournamentDoc;
  recent?: TournamentDoc;
};

type TournamentTeamWithRelations = TeamDoc & {
  tourCard?: TourCardDoc;
  tour?: TourDoc;
};

type TournamentGolferWithGolfer = {
  tournamentGolfer: TournamentGolferDoc;
  golfer?: GolferDoc;
};

type EnhancedGolfer = TournamentGolferWithGolfer & {
  field?: DataGolfFieldPlayer;
  ranking?: DataGolfRankedPlayer;
  live?: DataGolfLiveModelPlayer;
  historical?: DataGolfHistoricalPlayer;
  winnings?: DataGolfHistoricalEventDataStat;
};

type TournamentDataSkipReason =
  | "missing_tournament_api_id"
  | "missing_datagolf_event_name"
  | "event_name_mismatch"
  | "empty_data"
  | "empty_field";

type TournamentDataSkipResult = {
  ok: false;
  skipped: true;
  reason: TournamentDataSkipReason;
  tournamentId: Id<"tournaments">;
  tournamentName: string;
  dataGolfEventName?: string;
  score?: number;
  intersection?: string[];
  expectedTokens?: string[];
  actualTokens?: string[];
};

type RankingsSkipResult = {
  ok: false;
  skipped: true;
  reason: "empty_rankings";
};

const RECENTLY_COMPLETED_WINDOW_MS = 16 * 60 * 60 * 1000;

function isPlayoffTierName(name: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  return normalizedName === "playoff" || normalizedName === "playoffs";
}

function getPlayoffTierId(tiers: TierDoc[]): Id<"tiers"> | undefined {
  return tiers.find((tier) => isPlayoffTierName(tier.name))?._id;
}

function getSeasonTournaments(
  tournaments: TournamentDoc[],
  playoffTierId?: Id<"tiers">,
): TournamentDoc[] {
  return tournaments
    .filter((tournament) => tournament.tierId !== playoffTierId)
    .sort((a, b) => a.startDate - b.startDate);
}

function getPlayoffEventIndex(playoffIndex: number): PlayoffEventIndex {
  switch (playoffIndex) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    default:
      return 0;
  }
}

function selectTournamentWindow(
  tournaments: TournamentDoc[],
  now: number,
): TournamentWindowSelection {
  let active: TournamentDoc | undefined;
  let inRange: TournamentDoc | undefined;
  let next: TournamentDoc | undefined;
  let recent: TournamentDoc | undefined;

  for (const tournament of tournaments) {
    if (!active && tournament.status === "active") {
      active = tournament;
    }

    if (!inRange && tournament.startDate <= now && tournament.endDate >= now) {
      inRange = tournament;
    }

    if (
      tournament.startDate > now &&
      (!next || tournament.startDate < next.startDate)
    ) {
      next = tournament;
    }

    if (
      tournament.endDate < now &&
      (!recent || tournament.endDate > recent.endDate)
    ) {
      recent = tournament;
    }
  }

  return { active, inRange, next, recent };
}

async function findActiveTournament(
  ctx: TournamentCtx,
  now: number,
): Promise<TournamentDoc | null> {
  return ctx.db
    .query("tournaments")
    .withIndex("by_dates", (q) => q.lte("startDate", now))
    .filter((q) => q.gte(q.field("endDate"), now))
    .order("asc")
    .first();
}

async function findRecentlyFinishedTournament(
  ctx: TournamentCtx,
  now: number,
): Promise<TournamentDoc | null> {
  return ctx.db
    .query("tournaments")
    .withIndex("by_dates", (q) => q.lte("startDate", now))
    .filter((q) =>
      q.gte(q.field("endDate"), now - RECENTLY_COMPLETED_WINDOW_MS),
    )
    .order("desc")
    .first();
}

async function findUpcomingTournament(
  ctx: TournamentCtx,
  now: number,
): Promise<TournamentDoc | null> {
  return ctx.db
    .query("tournaments")
    .withIndex("by_dates", (q) => q.gte("startDate", now))
    .order("asc")
    .first();
}

async function findPastTournament(
  ctx: TournamentCtx,
  now: number,
): Promise<TournamentDoc | null> {
  return ctx.db
    .query("tournaments")
    .withIndex("by_dates", (q) => q.lte("startDate", now))
    .filter((q) => q.lte(q.field("endDate"), now))
    .order("desc")
    .first();
}

function validateTournamentDates(
  startDate: number,
  endDate: number,
  season: SeasonDoc,
): string | null {
  if (!Number.isInteger(startDate) || !Number.isInteger(endDate)) {
    return "Tournament dates must be integer timestamps.";
  }
  if (startDate > endDate) {
    return "Tournament start date must be on or before the end date.";
  }
  if (startDate < season.startDate || endDate > season.endDate) {
    return `Tournament dates must fall within the ${season.year} season.`;
  }
  return null;
}

export async function requireTournament(
  ctx: TournamentCtx,
  tournamentId: Id<"tournaments">,
): Promise<TournamentDoc> {
  const tournament = await ctx.db.get(tournamentId);
  if (!tournament) {
    throw new Error("Tournament not found.");
  }
  return tournament;
}

export async function requireSeason(
  ctx: TournamentCtx,
  seasonId: Id<"seasons">,
): Promise<SeasonDoc> {
  const season = await ctx.db.get(seasonId);
  if (!season) {
    throw new Error("Season not found.");
  }
  return season;
}

export async function requireTier(
  ctx: TournamentCtx,
  tierId: Id<"tiers">,
): Promise<TierDoc> {
  const tier = await ctx.db.get(tierId);
  if (!tier) {
    throw new Error("Tier not found.");
  }
  return tier;
}

export async function requireCourse(
  ctx: TournamentCtx,
  courseId: Id<"courses">,
): Promise<CourseDoc> {
  const course = await ctx.db.get(courseId);
  if (!course) {
    throw new Error("Course not found.");
  }
  return course;
}

export async function validateTournamentReferences(
  ctx: TournamentCtx,
  args: TournamentWriteArgs,
): Promise<{ season: SeasonDoc; tier: TierDoc }> {
  const [season, tier] = await Promise.all([
    requireSeason(ctx, args.seasonId),
    requireTier(ctx, args.tierId),
    requireCourse(ctx, args.courseId),
  ]);
  if (tier.seasonId !== season._id) {
    throw new Error("Tier must belong to the selected season.");
  }
  const dateValidationError = validateTournamentDates(
    args.startDate,
    args.endDate,
    season,
  );
  if (dateValidationError) {
    throw new Error(dateValidationError);
  }
  return { season, tier };
}

export async function getPlayoffTierForSeason(
  ctx: TournamentCtx,
  seasonId: Id<"seasons">,
): Promise<TierDoc | null> {
  const tiers = await ctx.db
    .query("tiers")
    .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
    .collect();
  return tiers.find((tier) => isPlayoffTierName(tier.name)) ?? null;
}

// GENERAL FETCH FUNCTIONS
export const getTournamentById = query({
  args: {
    id: v.id("tournaments"),
  },
  handler: async (ctx, args): Promise<TournamentReturnType> => {
    const tournament = await requireTournament(ctx, args.id);
    return {
      ok: true,
      tournament,
    };
  },
});
export const getTournamentsBySeasonId = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<TournamentsReturnType> => {
    await requireSeason(ctx, args.seasonId);
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    return { ok: true, tournaments };
  },
});
export const getFocusTournament = query({
  handler: async (ctx): Promise<FocusTournamentReturnType> => {
    const now = Date.now();

    const tournament = await findActiveTournament(ctx, now);
    if (tournament) return { ok: true, tournament, status: "active" };

    const recentlyFinished = await findRecentlyFinishedTournament(ctx, now);
    if (recentlyFinished)
      return { ok: true, tournament: recentlyFinished, status: "completed" };

    const nextTournament = await findUpcomingTournament(ctx, now);
    if (nextTournament)
      return { ok: true, tournament: nextTournament, status: "upcoming" };

    const lastTournament = await findPastTournament(ctx, now);
    if (lastTournament)
      return { ok: true, tournament: lastTournament, status: "past" };

    return { ok: false };
  },
});
export const getNextTournament = query({
  handler: async (ctx): Promise<TournamentReturnType> => {
    const now = Date.now();
    const tournament = await findUpcomingTournament(ctx, now);
    if (!tournament) {
      throw new Error("No upcoming tournaments found.");
    }
    return { ok: true, tournament };
  },
});
export const getLastTournament = query({
  handler: async (ctx): Promise<TournamentReturnType> => {
    const now = Date.now();
    const tournament = await findPastTournament(ctx, now);
    if (!tournament) {
      throw new Error("No past tournaments found.");
    }
    return { ok: true, tournament };
  },
});
export const getPlayoffTournaments = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args): Promise<TournamentsReturnType> => {
    await requireSeason(ctx, args.seasonId);
    const playoffTier = await getPlayoffTierForSeason(ctx, args.seasonId);
    if (!playoffTier) {
      return { ok: true, tournaments: [] };
    }
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_tier", (q) => q.eq("tierId", playoffTier._id))
      .collect();
    return {
      ok: true,
      tournaments: tournaments.sort((a, b) => a.startDate - b.startDate),
    };
  },
});

// ADMIN CRUD FUNCTIONS
export const getNextTournament_Internal = internalQuery({
  handler: async (ctx): Promise<TournamentReturnType> => {
    const now = Date.now();
    const tournament = await findUpcomingTournament(ctx, now);
    if (!tournament) {
      throw new Error("No upcoming tournaments found.");
    }
    return { ok: true, tournament };
  },
});
export const createTournament = internalMutation({
  args: {
    name: v.string(),
    seasonId: v.id("seasons"),
    startDate: v.number(),
    endDate: v.number(),
    tierId: v.id("tiers"),
    courseId: v.id("courses"),
    logoUrl: v.optional(v.string()),
    apiId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TournamentReturnType> => {
    await requireAdmin(ctx);
    await validateTournamentReferences(ctx, args);
    const newTournamentId = await ctx.db.insert("tournaments", {
      name: args.name,
      seasonId: args.seasonId,
      startDate: args.startDate,
      endDate: args.endDate,
      tierId: args.tierId,
      courseId: args.courseId,
      logoUrl: args.logoUrl,
      apiId: args.apiId,
      status: "upcoming",
      currentRound: 0,
      livePlay: false,
      updatedAt: Date.now(),
    });
    const newTournament = await requireTournament(ctx, newTournamentId);
    return { ok: true, tournament: newTournament };
  },
});
export const updateTournament = internalMutation({
  args: {
    id: v.id("tournaments"),
    name: v.optional(v.string()),
    seasonId: v.optional(v.id("seasons")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    tierId: v.optional(v.id("tiers")),
    courseId: v.optional(v.id("courses")),
    logoUrl: v.optional(v.string()),
    apiId: v.optional(v.string()),
    groupsEmailSentAt: v.optional(v.number()),
    reminderEmailSentAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("upcoming"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    currentRound: v.optional(v.number()),
    livePlay: v.optional(v.boolean()),
    dataGolfInPlayLastUpdate: v.optional(v.union(v.string(), v.number())),
    leaderboardLastUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TournamentReturnType> => {
    await requireAdmin(ctx);
    const tournament = await requireTournament(ctx, args.id);
    const nextSeasonId = args.seasonId ?? tournament.seasonId;
    const nextTierId = args.tierId ?? tournament.tierId;
    const nextCourseId = args.courseId ?? tournament.courseId;
    const nextStartDate = args.startDate ?? tournament.startDate;
    const nextEndDate = args.endDate ?? tournament.endDate;

    await validateTournamentReferences(ctx, {
      seasonId: nextSeasonId,
      tierId: nextTierId,
      courseId: nextCourseId,
      startDate: nextStartDate,
      endDate: nextEndDate,
    });

    if (args.currentRound !== undefined && args.currentRound < 0) {
      throw new Error("Current round cannot be negative.");
    }

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.seasonId !== undefined ? { seasonId: args.seasonId } : {}),
      ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
      ...(args.endDate !== undefined ? { endDate: args.endDate } : {}),
      ...(args.tierId !== undefined ? { tierId: args.tierId } : {}),
      ...(args.courseId !== undefined ? { courseId: args.courseId } : {}),
      ...(args.logoUrl !== undefined ? { logoUrl: args.logoUrl } : {}),
      ...(args.apiId !== undefined ? { apiId: args.apiId } : {}),
      ...(args.groupsEmailSentAt !== undefined
        ? { groupsEmailSentAt: args.groupsEmailSentAt }
        : {}),
      ...(args.reminderEmailSentAt !== undefined
        ? { reminderEmailSentAt: args.reminderEmailSentAt }
        : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.currentRound !== undefined
        ? { currentRound: args.currentRound }
        : {}),
      ...(args.livePlay !== undefined ? { livePlay: args.livePlay } : {}),
      ...(args.dataGolfInPlayLastUpdate !== undefined
        ? { dataGolfInPlayLastUpdate: args.dataGolfInPlayLastUpdate }
        : {}),
      ...(args.leaderboardLastUpdatedAt !== undefined
        ? { leaderboardLastUpdatedAt: args.leaderboardLastUpdatedAt }
        : {}),
      updatedAt: Date.now(),
    });
    const updated = await requireTournament(ctx, args.id);
    return { ok: true, tournament: updated };
  },
});
export const deleteTournament = internalMutation({
  args: {
    id: v.id("tournaments"),
  },
  handler: async (ctx, args): Promise<DeleteTournamentReturnType> => {
    await requireAdmin(ctx);
    await requireTournament(ctx, args.id);
    const [team, tournamentGolfer] = await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", args.id))
        .first(),
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", args.id))
        .first(),
    ]);
    if (team || tournamentGolfer) {
      const relatedRecords = [
        team ? "teams" : null,
        tournamentGolfer ? "tournament golfers" : null,
      ].filter((value): value is string => value !== null);
      throw new Error(
        `Cannot delete tournament with existing ${relatedRecords.join(", ")}.`,
      );
    }
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

// TODO: REMOVE ANY NEED FOR THESE FUNCTION AS WE WILL USE THE NEW ONES ABOVE
export const getTournamentLeaderboardView = query({
  args: {
    tournamentId: v.optional(v.id("tournaments")),
    memberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const allTournaments = await ctx.db.query("tournaments").collect();
    const now = Date.now();

    const requestedTournament = args.tournamentId
      ? await ctx.db.get(args.tournamentId)
      : null;
    const selection = selectTournamentWindow(allTournaments, now);
    const tournament =
      requestedTournament ??
      selection.active ??
      selection.inRange ??
      selection.next ??
      selection.recent ??
      null;

    if (!tournament) {
      return {
        tournament: null,
        tours: [],
        teams: [],
        golfers: [],
        allTournaments: [],
        userTourCard: null,
      };
    }

    const seasonTournaments = allTournaments
      .filter((t) => t.seasonId === tournament.seasonId)
      .sort((a, b) => b.startDate - a.startDate);

    const [tours, teams, tournamentGolfers] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .collect(),
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
    ]);

    const teamTourCards = await Promise.all(
      teams.map((team) => ctx.db.get(team.tourCardId)),
    );

    const enhancedTeams = teams.map((team, index) => {
      const card = teamTourCards[index];
      return {
        ...team,
        tourId: card?.tourId,
        displayName: card?.displayName,
        memberId: card?.memberId,
        playoff: card?.playoff,
      };
    });

    const golferDocs = await Promise.all(
      tournamentGolfers.map((tg) => ctx.db.get(tg.golferId)),
    );

    const enhancedGolfers = tournamentGolfers.map((tg, index) => {
      const golfer = golferDocs[index];
      return {
        ...tg,
        apiId: golfer?.apiId,
        playerName: golfer?.playerName,
        country: golfer?.country,
        worldRank: tg.worldRank ?? golfer?.worldRank,
      };
    });

    let userTourCard = null;
    if (args.memberId) {
      const memberId: Id<"members"> = args.memberId;
      userTourCard = await ctx.db
        .query("tourCards")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", memberId).eq("seasonId", tournament.seasonId),
        )
        .first();
    }

    return {
      tournament,
      tours,
      teams: enhancedTeams,
      golfers: enhancedGolfers,
      allTournaments: seasonTournaments,
      userTourCard,
    };
  },
});

async function buildActiveTournamentDataResult(
  ctx: { db: DatabaseReader },
  args: {
    type: ActiveTournamentType;
    tournament: TournamentDoc;
    tiers: TierDoc[];
    tours: TourDoc[];
    tournaments: TournamentDoc[];
    playoffTournaments: TournamentDoc[];
    playoffTierId?: Id<"tiers">;
  },
): Promise<ActiveTournamentDataResult | { ok: false }> {
  const [course, tier] = await Promise.all([
    ctx.db.get(args.tournament.courseId),
    Promise.resolve(
      args.tiers.find((candidate) => candidate._id === args.tournament.tierId),
    ),
  ]);
  if (!course || !tier) {
    return { ok: false };
  }

  const playoffIndex = args.playoffTournaments.findIndex(
    (tournament) => tournament._id === args.tournament._id,
  );

  return {
    ok: true,
    type: args.type,
    tournament: args.tournament,
    course,
    tier,
    tours: args.tours,
    isPlayoff: playoffIndex !== -1,
    eventIndex: getPlayoffEventIndex(playoffIndex),
    playoffTournaments: args.playoffTournaments,
    seasonTournaments: getSeasonTournaments(
      args.tournaments,
      args.playoffTierId,
    ),
  };
}

export const getActiveTournamentData = internalQuery({
  handler: async (ctx): Promise<ActiveTournamentDataResult | { ok: false }> => {
    const currentYear = new Date().getFullYear();
    const now = Date.now();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();
    if (!currentSeason) {
      return { ok: false };
    }

    const tournaments: TournamentDoc[] = await ctx.db
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

    const playoffTierId = getPlayoffTierId(tiers);
    const playoffTournaments = tournaments
      .filter((tournament) => tournament.tierId === playoffTierId)
      .sort((a, b) => a.startDate - b.startDate);

    const selection = selectTournamentWindow(tournaments, now);

    if (selection.active) {
      return buildActiveTournamentDataResult(ctx, {
        type: "active",
        tournament: selection.active,
        tiers,
        tours,
        tournaments,
        playoffTournaments,
        playoffTierId,
      });
    }

    if (selection.inRange) {
      return buildActiveTournamentDataResult(ctx, {
        type: "active",
        tournament: selection.inRange,
        tiers,
        tours,
        tournaments,
        playoffTournaments,
        playoffTierId,
      });
    }

    if (selection.next) {
      return buildActiveTournamentDataResult(ctx, {
        type: "next",
        tournament: selection.next,
        tiers,
        tours,
        tournaments,
        playoffTournaments,
        playoffTierId,
      });
    }

    if (selection.recent) {
      return buildActiveTournamentDataResult(ctx, {
        type: "recent",
        tournament: selection.recent,
        tiers,
        tours,
        tournaments,
        playoffTournaments,
        playoffTierId,
      });
    }

    return { ok: false };
  },
});

export const isPlayoffTournament = internalQuery({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", new Date().getFullYear()))
      .first();
    if (!season) {
      return { ok: false, isPlayoff: false } as const;
    }

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();
    const playoffTierId = getPlayoffTierId(tiers);
    const tier = playoffTierId
      ? tiers.find((candidate) => candidate._id === playoffTierId)
      : undefined;
    if (!tier) {
      return { ok: false, isPlayoff: false } as const;
    }

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_tier", (q) => q.eq("tierId", tier._id))
      .collect();
    const sortedTournaments = tournaments.sort(
      (a, b) => a.startDate - b.startDate,
    );
    if (sortedTournaments.length === 0) {
      return { ok: false, isPlayoff: false } as const;
    }

    const playoffIndex = sortedTournaments.findIndex(
      (tournament) => tournament._id === args.tournamentId,
    );
    const isPlayoff = playoffIndex !== -1;

    return {
      ok: true,
      isPlayoff,
      eventIndex: getPlayoffEventIndex(playoffIndex),
      firstPlayoffEvent: sortedTournaments[0],
    } as const;
  },
});

function hasFieldData(
  value: DataGolfFieldUpdatesResponse | TournamentDataSkipResult,
): value is DataGolfFieldUpdatesResponse {
  return "field" in value;
}

function hasRankingData(
  value: DataGolfRankingsResponse | RankingsSkipResult,
): value is DataGolfRankingsResponse {
  return "rankings" in value;
}

function hasLiveData(
  value: DataGolfLiveModelPredictionsResponse | TournamentDataSkipResult,
): value is DataGolfLiveModelPredictionsResponse {
  return "data" in value;
}

function hasHistoricalData(
  value: DataGolfHistoricalRoundDataResponse | TournamentDataSkipResult,
): value is DataGolfHistoricalRoundDataResponse {
  return "scores" in value;
}

function hasWinningsData(
  value: DataGolfHistoricalEventDataResponse | TournamentDataSkipResult,
): value is DataGolfHistoricalEventDataResponse {
  return "event_stats" in value;
}

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
        teams: TournamentTeamWithRelations[];
        golfers: TournamentGolferWithGolfer[];
      }
    | { ok: false }
  > => {
    const [teams, tourCards, tours, tournamentGolfers] = await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", args.tournamentId),
        )
        .collect(),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", args.tournamentId),
        )
        .collect(),
    ]);

    const tourCardById = new Map(
      tourCards.map((tourCard) => [tourCard._id, tourCard] as const),
    );
    const tourById = new Map(tours.map((tour) => [tour._id, tour] as const));

    const golfers: TournamentGolferWithGolfer[] = await Promise.all(
      tournamentGolfers.map(async (tournamentGolfer) => ({
        tournamentGolfer,
        golfer: (await ctx.db.get(tournamentGolfer.golferId)) ?? undefined,
      })),
    );

    return {
      ok: true,
      teams: teams.map((team) => {
        const tourCard = tourCardById.get(team.tourCardId);
        return {
          ...team,
          tourCard,
          tour: tourCard ? tourById.get(tourCard.tourId) : undefined,
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
        historicalData: DataGolfHistoricalRoundDataResponse | undefined;
        winningsData: DataGolfHistoricalEventDataResponse | undefined;
      }
    | { ok: false }
  > => {
    const tournamentForDataGolf = {
      _id: args.tournament._id,
      name: args.tournament.name,
      apiId: args.tournament.apiId,
      seasonId: args.tournament.seasonId,
    };

    const [fieldData, rankingData, liveData] = await Promise.all([
      ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
        tournament: tournamentForDataGolf,
      }),
      ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
      ctx.runAction(api.functions.datagolf.fetchLiveModelPredictions, {
        tournament: tournamentForDataGolf,
      }),
    ]);

    const historicalData =
      args.tournament.endDate < Date.now()
        ? await ctx.runAction(api.functions.datagolf.fetchHistoricalRoundData, {
            tournament: tournamentForDataGolf,
            options: {
              tour: "pga",
              year: new Date().getFullYear(),
              tzOffset: args.tzOffset,
            },
          })
        : undefined;

    const winningsData =
      args.tournament.endDate < Date.now()
        ? await ctx.runAction(
            api.functions.datagolf.fetchHistoricalEventDataEvents,
            {
              tournament: tournamentForDataGolf,
              options: {
                tour: "pga",
                year: new Date().getFullYear(),
              },
            },
          )
        : undefined;

    const fieldSkipped = !hasFieldData(fieldData);
    const rankingSkipped = !hasRankingData(rankingData);
    const liveSkipped = !hasLiveData(liveData);
    const historicalSkipped =
      historicalData !== undefined && !hasHistoricalData(historicalData);
    const winningsSkipped =
      winningsData !== undefined && !hasWinningsData(winningsData);

    if (
      fieldSkipped ||
      rankingSkipped ||
      liveSkipped ||
      historicalSkipped ||
      winningsSkipped
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      fieldData,
      rankingData,
      liveData,
      historicalData,
      winningsData,
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
        teams: (TeamDoc & {
          golfers: EnhancedGolfer[];
          tourCard?: TourCardDoc;
          tour?: TourDoc;
        })[];
        fieldData: DataGolfFieldUpdatesResponse;
        rankingData: DataGolfRankingsResponse;
        liveData: DataGolfLiveModelPredictionsResponse;
        historicalData: DataGolfHistoricalRoundDataResponse | undefined;
        winningsData: DataGolfHistoricalEventDataResponse | undefined;
      }
    | { ok: false }
  > => {
    const [databaseData, externalData] = await Promise.all([
      ctx.runQuery(
        internal.functions.tournaments.getDatabaseDataForTournament,
        {
          tournamentId: args.tournament._id,
          seasonId: args.tournament.seasonId,
        },
      ),
      ctx.runAction(
        internal.functions.tournaments.getExternalDataForTournament,
        {
          tournament: args.tournament,
          tzOffset: args.tzOffset,
        },
      ),
    ]);
    if (!databaseData.ok || !externalData.ok) {
      return { ok: false };
    }

    const fieldByGolferId = new Map(
      externalData.fieldData.field.map(
        (fieldGolfer) => [fieldGolfer.dg_id, fieldGolfer] as const,
      ),
    );
    const rankingByGolferId = new Map(
      externalData.rankingData.rankings.map(
        (rankedGolfer) => [rankedGolfer.dg_id, rankedGolfer] as const,
      ),
    );
    const liveByGolferId = new Map(
      externalData.liveData.data.map(
        (liveGolfer) => [liveGolfer.dg_id, liveGolfer] as const,
      ),
    );
    const historicalByGolferId = new Map(
      (externalData.historicalData?.scores ?? []).map(
        (historicalGolfer) =>
          [historicalGolfer.dg_id, historicalGolfer] as const,
      ),
    );
    const winningsByGolferId = new Map(
      (externalData.winningsData?.event_stats ?? []).map(
        (winningsGolfer) => [winningsGolfer.dg_id, winningsGolfer] as const,
      ),
    );

    const outputGolfers: EnhancedGolfer[] = databaseData.golfers.map(
      (golfer) => {
        const golferApiId = golfer.golfer?.apiId;
        return {
          ...golfer,
          field:
            golferApiId === undefined
              ? undefined
              : fieldByGolferId.get(golferApiId),
          ranking:
            golferApiId === undefined
              ? undefined
              : rankingByGolferId.get(golferApiId),
          live:
            golferApiId === undefined
              ? undefined
              : liveByGolferId.get(golferApiId),
          historical:
            golferApiId === undefined
              ? undefined
              : historicalByGolferId.get(golferApiId),
          winnings:
            golferApiId === undefined
              ? undefined
              : winningsByGolferId.get(golferApiId),
        };
      },
    );

    const selectableGolfersByApiId = new Map(
      outputGolfers
        .filter((golfer) => (golfer.tournamentGolfer.group ?? 0) > 0)
        .flatMap((golfer) =>
          golfer.golfer?.apiId === undefined
            ? []
            : ([[golfer.golfer.apiId, golfer]] as const),
        ),
    );

    return {
      ok: true,
      golfers: outputGolfers,
      teams: databaseData.teams.map((team) => ({
        ...team,
        golfers: team.golferIds
          .map((golferId) => selectableGolfersByApiId.get(golferId))
          .filter((golfer): golfer is EnhancedGolfer => golfer !== undefined),
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
export const duplicateFromPreviousPlayoff = internalMutation({
  args: {
    currentTournamentId: v.id("tournaments"),
    previousPlayoffTournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const previousTournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();

    const previousTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();

    let golfersCopied = 0;
    let teamsCopied = 0;
    const groupSet = new Set<number>();

    for (const tournamentGolfer of previousTournamentGolfers) {
      if (tournamentGolfer.group) {
        groupSet.add(tournamentGolfer.group);
      }

      const currentTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q
            .eq("golferId", tournamentGolfer.golferId)
            .eq("tournamentId", args.currentTournamentId),
        )
        .first();
      if (currentTournamentGolfer) {
        continue;
      }

      await ctx.db.insert("tournamentGolfers", {
        golferId: tournamentGolfer.golferId,
        tournamentId: args.currentTournamentId,
        group: tournamentGolfer.group,
        rating: tournamentGolfer.rating,
        worldRank: tournamentGolfer.worldRank,
        updatedAt: Date.now(),
      });
      golfersCopied += 1;
    }

    for (const team of previousTeams) {
      const currentTeam = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", args.currentTournamentId)
            .eq("tourCardId", team.tourCardId),
        )
        .first();
      if (currentTeam) {
        continue;
      }

      await ctx.db.insert("teams", {
        tournamentId: args.currentTournamentId,
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
      tournamentId: args.currentTournamentId,
      copiedFromTournamentId: args.previousPlayoffTournamentId,
      golfersCopied,
      teamsCopied,
      groupsCreated: groupSet.size,
    } as const;
  },
});
export const getTournamentPickPool = query({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const pickPool = await Promise.all(
      tournamentGolfers.map(async (tournamentGolfer) => {
        const golfer = await ctx.db.get(tournamentGolfer.golferId);
        if (!golfer) {
          return null;
        }

        return {
          golferApiId: golfer.apiId,
          playerName: golfer.playerName,
          group: tournamentGolfer.group ?? null,
          worldRank: tournamentGolfer.worldRank ?? golfer.worldRank ?? null,
          rating: tournamentGolfer.rating ?? null,
        };
      }),
    );

    return pickPool
      .filter((row) => row !== null)
      .sort((a, b) => {
        const groupA = a.group ?? Number.MAX_SAFE_INTEGER;
        const groupB = b.group ?? Number.MAX_SAFE_INTEGER;
        if (groupA !== groupB) {
          return groupA - groupB;
        }

        const rankA = a.worldRank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.worldRank ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return a.playerName.localeCompare(b.playerName);
      });
  },
});
