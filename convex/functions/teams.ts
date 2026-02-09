/**
 * Teams CRUD
 *
 * Public functions in this module follow a consistent CRUD shape:
 * - `createTeams`: inserts one team document.
 * - `getTeams`: returns a list of teams (optionally enhanced) based on filters/sort/pagination.
 * - `updateTeams`: patches a team document.
 * - `deleteTeams`: hard-deletes a team document.
 *
 * Cron/job wiring relies on the `*_Internal` exports and `runTeamsUpdateForTournament`.
 */

import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
} from "../_generated/server";
import { requireAdmin } from "../utils/auth";
import { processData } from "../utils/batchProcess";
import {
  applyFilters,
  enhanceTeam,
  getOptimizedTeams,
  getSortFunction,
  hashStringToUint32,
  pickUniqueRandomNumbers,
  resolveTournamentForSeeding,
  resolveTourForTournamentSeason,
} from "../utils/teams";
import { requireTourCardOwner } from "../utils/tourCards";
import { teamsValidators } from "../validators/teams";
import type { Id } from "../_generated/dataModel";
import type {
  DeleteResponse,
  TeamDoc,
  GolferDoc,
  EnhancedTournamentDoc,
  EnhancedTournamentTeamDoc,
} from "../types/types";
import { v } from "convex/values";
import {
  avgArray,
  awardTeamEarnings,
  awardTeamPlayoffPoints,
  categorizeTeamGolfersForRound,
  earliestTimeStr,
  insertReplacementGolfers,
  updateScoreForRound,
} from "../utils/misc";
import { api, internal } from "../_generated/api";

/**
 * Create a team.
 *
 * Behavior:
 * - Validates input by default (can be skipped via `options.skipValidation`).
 * - Enforces that the calling user owns the provided `tourCardId`.
 * - Prevents creating a duplicate team for the same `{ tournamentId, tourCardId }`.
 *
 * Return shape:
 * - Returns the inserted `teams` document.
 * - When `options.returnEnhanced` is true, returns an enhanced team (see `enhanceTeam`).
 */
export const createTeams = mutation({
  args: teamsValidators.args.createTeams,
  handler: async (ctx, args) => {
    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = teamsValidators.validateTeamData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const existing = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", data.tournamentId)
            .eq("tourCardId", data.tourCardId),
        )
        .first();

      if (existing) {
        throw new Error(
          "Team already exists for this tournament and tour card",
        );
      }

      const tournament = await ctx.db.get(data.tournamentId);
      if (!tournament) {
        throw new Error("Tournament not found");
      }

      const tourCard = await ctx.db.get(data.tourCardId);
      if (!tourCard) {
        throw new Error("Tour card not found");
      }

      await requireTourCardOwner(ctx, tourCard);
    }

    const teamId = await ctx.db.insert("teams", {
      ...data,
      updatedAt: Date.now(),
    });

    const team = await ctx.db.get(teamId);
    if (!team) throw new Error("Failed to retrieve created team");

    if (options.returnEnhanced) {
      return await enhanceTeam(ctx, team, {
        includeTournament: options.includeTournament,
        includeStatistics: options.includeStatistics,
        includeMember: options.includeMember,
        includeGolfers: options.includeGolfers,
      });
    }

    return team;
  },
});

/**
 * List teams.
 *
 * Supports index-friendly filtering (tournamentId / tourCardId), in-memory filtering
 * (min/max points/earnings/score, flags, etc.), sorting, and offset pagination.
 *
 * Return shape:
 * - Always returns an array.
 * - When any `options.enhance.*` flag is true, returns enhanced team docs.
 * - Otherwise returns raw `teams` documents.
 */
export const getTeams = query({
  args: teamsValidators.args.getTeams,
  handler: async (ctx, args) => {
    const options = args.options || {};

    let teams = await getOptimizedTeams(ctx, options);

    teams = applyFilters(teams, options.filter || {});

    const processedTeams = processData(teams, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });

    const enhance = options.enhance || {};
    const shouldEnhance = Object.values(enhance).some(Boolean);
    if (!shouldEnhance) return processedTeams;

    return await Promise.all(
      processedTeams.map((team) => enhanceTeam(ctx, team, enhance)),
    );
  },
});
export const getTeam_Internal = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    return team;
  },
});
export const getTeamByTournamentAndTourCard_Internal = internalQuery({
  args: { tournamentId: v.id("tournaments"), tourCardId: v.id("tourCards") },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_tournament_tour_card", (q) =>
        q
          .eq("tournamentId", args.tournamentId)
          .eq("tourCardId", args.tourCardId),
      )
      .first();
    if (!team) return null;
    return team;
  },
});

/**
 * Frontend convenience: get all teams for a tournament.
 */
export const getTournamentTeams = query({
  args: teamsValidators.args.getTournamentTeams,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
  },
});

/**
 * Paginated (cursor) version of getTournamentTeams.
 * Returns a single page of results and a continueCursor.
 */
export const getTournamentTeamsPage = query({
  args: teamsValidators.args.getTournamentTeamsPage,
  handler: async (ctx, args) => {
    const numItems = args.limit ?? 100;
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems,
      });
  },
});

/**
 * Admin utility: seed a tournament with "fake" teams based on tour cards.
 *
 * Creates up to one team per tour card (skipping ones that already have a team)
 * and assigns each team a random set of golfers from the tournament’s golfer pool.
 */
export const adminSeedTeamsForTournamentFromTourCards = mutation({
  args: teamsValidators.args.adminSeedTeamsForTournamentFromTourCards,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const tournament = await resolveTournamentForSeeding(ctx, {
      tournamentId: args.tournamentId,
      tournamentName: args.tournamentName,
      seasonId: args.seasonId,
    });

    const tour = await resolveTourForTournamentSeason(ctx, {
      seasonId: tournament.seasonId,
      tourId: args.tourId,
    });

    const golferCount = args.golferCount ?? 6;
    if (!Number.isInteger(golferCount) || golferCount <= 0) {
      throw new Error("golferCount must be a positive integer");
    }

    const maxTeams = args.maxTeams;
    if (
      maxTeams !== undefined &&
      (!Number.isInteger(maxTeams) || maxTeams <= 0)
    ) {
      throw new Error("maxTeams must be a positive integer");
    }

    const dryRun = args.dryRun ?? false;
    const skipExisting = args.skipExisting ?? true;
    const allowFallbackToAllGolfers = args.allowFallbackToAllGolfers ?? true;

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_tour_season", (q) =>
        q.eq("tourId", tour._id).eq("seasonId", tournament.seasonId),
      )
      .collect();

    if (tourCards.length === 0) {
      throw new Error(
        `No tour cards found for tour ${tour.shortForm} in this tournament’s season`,
      );
    }

    const existingTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    const existingTeamTourCardIds = new Set(
      existingTeams.map((t) => t.tourCardId),
    );

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    let golferApiIds: number[] = [];
    let golferPoolSource: "tournamentGolfers" | "allGolfers" =
      "tournamentGolfers";

    if (tournamentGolfers.length > 0) {
      const uniqueGolferDocIds = Array.from(
        new Set(tournamentGolfers.map((tg) => tg.golferId)),
      );
      const golferDocs = await Promise.all(
        uniqueGolferDocIds.map((id) => ctx.db.get(id)),
      );

      golferApiIds = golferDocs
        .filter((g): g is GolferDoc => Boolean(g))
        .map((g) => g.apiId)
        .filter((apiId) => Number.isInteger(apiId) && apiId > 0);
    } else if (allowFallbackToAllGolfers) {
      const golfers = await ctx.db.query("golfers").collect();
      golferApiIds = golfers
        .map((g) => g.apiId)
        .filter((apiId) => Number.isInteger(apiId) && apiId > 0);
      golferPoolSource = "allGolfers";
    } else {
      throw new Error(
        "No tournament golfers found for this tournament. Sync golfers first.",
      );
    }

    if (golferApiIds.length < golferCount) {
      throw new Error(
        `Not enough golfers in pool (${golferApiIds.length}) to select ${golferCount} unique golfers`,
      );
    }

    const createdTeamIds: Id<"teams">[] = [];
    let created = 0;
    let skipped = 0;

    const baseSeed = Number.isFinite(args.seed) ? (args.seed as number) : 1;
    const targetTourCards =
      maxTeams === undefined ? tourCards : tourCards.slice(0, maxTeams);

    for (const tourCard of targetTourCards) {
      if (existingTeamTourCardIds.has(tourCard._id)) {
        if (!skipExisting) {
          throw new Error(
            `Team already exists for tourCardId ${tourCard._id} in tournament ${tournament._id}`,
          );
        }
        skipped++;
        continue;
      }

      const teamGolferIds = pickUniqueRandomNumbers(
        golferApiIds,
        golferCount,
        hashStringToUint32(`${tournament._id}:${tourCard._id}`) + baseSeed,
      );

      if (!dryRun) {
        const teamId = await ctx.db.insert("teams", {
          tournamentId: tournament._id,
          tourCardId: tourCard._id,
          golferIds: teamGolferIds,
          updatedAt: Date.now(),
        });
        createdTeamIds.push(teamId);
      }

      created++;
    }

    return {
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      seasonId: tournament.seasonId,
      tourId: tour._id,
      tourShortForm: tour.shortForm,
      golferPoolSource,
      golferPoolSize: golferApiIds.length,
      totalTourCards: tourCards.length,
      created,
      skipped,
      dryRun,
      createdTeamIds,
    };
  },
});

/**
 * Paginated (cursor) teams query using only indexable filters.
 * This avoids unbounded collects for large tables.
 */
export const getTeamsPage = query({
  args: teamsValidators.args.getTeamsPage,
  handler: async (ctx, args) => {
    const numItems = args.limit ?? 100;
    const { tournamentId, tourCardId } = args.filter;

    if (tournamentId && tourCardId) {
      return await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q.eq("tournamentId", tournamentId).eq("tourCardId", tourCardId),
        )
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    if (tournamentId) {
      return await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    if (tourCardId) {
      return await ctx.db
        .query("teams")
        .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCardId))
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    throw new Error(
      "getTeamsPage requires filter.tournamentId and/or filter.tourCardId",
    );
  },
});

/**
 * Frontend convenience: return TourCards sorted for standings.
 */
export const getSeasonStandings = query({
  args: teamsValidators.args.getSeasonStandings,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tourCards")
      .withIndex("by_season_points", (q) => q.eq("seasonId", args.seasonId))
      .order("desc")
      .collect();
  },
});

export const getChampionshipWinsForMember = query({
  args: teamsValidators.args.getChampionshipWinsForMember,
  handler: async (ctx, args) => {
    const tourCards = args.seasonId
      ? await ctx.db
          .query("tourCards")
          .withIndex("by_member_season", (q) =>
            q.eq("memberId", args.memberId).eq("seasonId", args.seasonId!),
          )
          .collect()
      : await ctx.db
          .query("tourCards")
          .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
          .collect();

    if (tourCards.length === 0) return [];

    const tourCardIds = new Set(tourCards.map((tc) => tc._id));
    const seasonIds = args.seasonId
      ? [args.seasonId]
      : Array.from(new Set(tourCards.map((tc) => tc.seasonId)));

    const majorNames = new Set([
      "The Masters",
      "PGA Championship",
      "U.S. Open",
      "The Open Championship",
    ]);

    const playoffEventNames = [
      "FedEx-St. Jude Championship",
      "BMW Championship",
      "TOUR Championship",
    ];

    const now = Date.now();
    const winsByTournamentId = new Map<
      Id<"tournaments">,
      {
        tournamentId: Id<"tournaments">;
        name: string;
        logoUrl: string | null;
        startDate: number;
        seasonId: Id<"seasons">;
        tierName: string | null;
      }
    >();

    for (const seasonId of seasonIds) {
      const [tiers, tournaments] = await Promise.all([
        ctx.db
          .query("tiers")
          .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
          .collect(),
        ctx.db
          .query("tournaments")
          .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
          .collect(),
      ]);

      const tierNameById = new Map(tiers.map((t) => [t._id, t.name] as const));
      const playoffTierIds = new Set(
        tiers
          .filter((t) => t.name.toLowerCase().includes("playoff"))
          .map((t) => t._id),
      );

      const relevantTournaments = tournaments.filter((t) => {
        const lowerName = t.name.toLowerCase();
        const isCanadianOpen = lowerName.includes("canadian open");
        const isMajor = majorNames.has(t.name);
        const isPlayoffByTier = playoffTierIds.has(t.tierId);
        const isPlayoffByName = playoffEventNames.some((n) => n === t.name);
        const isFinished = t.status === "completed" || t.endDate <= now;
        return (
          (isCanadianOpen || isMajor || isPlayoffByTier || isPlayoffByName) &&
          isFinished
        );
      });

      for (const tournament of relevantTournaments) {
        const [pos1, posT1] = await Promise.all([
          ctx.db
            .query("teams")
            .withIndex("by_tournament_position", (q) =>
              q.eq("tournamentId", tournament._id).eq("position", "1"),
            )
            .collect(),
          ctx.db
            .query("teams")
            .withIndex("by_tournament_position", (q) =>
              q.eq("tournamentId", tournament._id).eq("position", "T1"),
            )
            .collect(),
        ]);

        const winners = [...pos1, ...posT1];
        const userWon = winners.some((team) =>
          tourCardIds.has(team.tourCardId),
        );
        if (!userWon) continue;

        winsByTournamentId.set(tournament._id, {
          tournamentId: tournament._id,
          name: tournament.name,
          logoUrl: tournament.logoUrl ?? null,
          startDate: tournament.startDate,
          seasonId: tournament.seasonId,
          tierName: tierNameById.get(tournament.tierId) ?? null,
        });
      }
    }

    return Array.from(winsByTournamentId.values()).sort(
      (a, b) => b.startDate - a.startDate,
    );
  },
});

/**
 * Update a team.
 *
 * Behavior:
 * - Enforces that the calling user owns the team’s tour card.
 * - Validates input by default (can be skipped via `options.skipValidation`).
 * - Updates `updatedAt` by default (can be disabled via `options.updateTimestamp`).
 *
 * Return shape:
 * - Returns the patched `teams` document.
 * - When `options.returnEnhanced` is true, returns an enhanced team.
 */
export const updateTeams = mutation({
  args: teamsValidators.args.updateTeams,
  handler: async (ctx, args) => {
    const options = args.options || {};
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const tourCard = await ctx.db.get(team.tourCardId);
    if (!tourCard) throw new Error("Tour card not found");
    await requireTourCardOwner(ctx, tourCard);

    if (!options.skipValidation) {
      const validation = teamsValidators.validateTeamData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }

    const updateData: Partial<TeamDoc> = { ...args.data };
    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

    await ctx.db.patch(args.teamId, updateData);

    const updatedTeam = await ctx.db.get(args.teamId);
    if (!updatedTeam) throw new Error("Failed to retrieve updated team");

    if (options.returnEnhanced) {
      return await enhanceTeam(ctx, updatedTeam, {
        includeTournament: options.includeTournament,
        includeStatistics: options.includeStatistics,
        includeMember: options.includeMember,
        includeGolfers: options.includeGolfers,
      });
    }

    return updatedTeam;
  },
});

/**
 * Internal helper used by cron-driven tournament scoring updates.
 *
 * Applies a batch of partial patches for teams that belong to `tournamentId`.
 * Returns a simple `{ updated }` count.
 */
export const updateTeams_Internal = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    updates: v.array(
      v.object({
        teamId: v.id("teams"),
        round: v.optional(v.number()),
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
        makeCut: v.optional(v.number()),
        topTen: v.optional(v.number()),
        win: v.optional(v.number()),
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
        makeCut: u.makeCut,
        topTen: u.topTen,
        win: u.win,
        roundOneTeeTime: u.roundOneTeeTime,
        roundTwoTeeTime: u.roundTwoTeeTime,
        roundThreeTeeTime: u.roundThreeTeeTime,
        roundFourTeeTime: u.roundFourTeeTime,
        updatedAt: Date.now(),
      });

      updated += 1;
    }

    return { updated };
  },
});

/**
 * Delete a team (hard delete).
 *
 * Behavior:
 * - Enforces that the calling user owns the team’s tour card.
 * - Always performs a hard delete; `options.softDelete` is ignored (kept for compatibility).
 *
 * Return shape:
 * - Returns a standard `DeleteResponse<TeamDoc>`.
 * - When `options.returnDeletedData` is true, includes the pre-delete team document.
 */
export const deleteTeams = mutation({
  args: teamsValidators.args.deleteTeams,
  handler: async (ctx, args): Promise<DeleteResponse<TeamDoc>> => {
    const options = args.options || {};
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const tourCard = await ctx.db.get(team.tourCardId);
    if (!tourCard) throw new Error("Tour card not found");
    await requireTourCardOwner(ctx, tourCard);

    let deletedTeamData: TeamDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedTeamData = team;
    }

    await ctx.db.delete(args.teamId);
    return {
      success: true,
      deleted: true,
      deactivated: false,
      deletedData: deletedTeamData,
    };
  },
});

/**
 * Recomputes all team scores/positions for a tournament based on its current round state.
 *
 * Inputs:
 * - Optional `tournamentId` (defaults to the active tournament).
 *
 * What it updates:
 * - Round component scores (`roundOne`..`roundFour`) only once the round is completed.
 * - Live round metrics (`today`, `thru`) while a round is active.
 * - Total team score (including playoff carry-in / starting strokes logic).
 * - Team position strings (`1`, `T1`, `T2`, ...), points, earnings, and win/top-ten flags.
 *
 * Tie handling:
 * - If the tournament is finished and there is a T1 tie, attempts to break the tie by highest
 *   total team earnings from DataGolf event stats; if the fetch fails, the tie is left as-is.
 */
export const runTeamsUpdateForTournament: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    handler: async (ctx, args) => {
      const tournament = args.tournamentId
        ? ((await ctx.runQuery(
            internal.functions.tournaments.getTournaments_Internal,
            {
              tournamentId: args.tournamentId,
              includeTeams: true,
              includeTourCards: true,
              includePlayoffs: true,
              includeGolfers: true,
              includeCourse: true,
            },
          )) as EnhancedTournamentDoc | undefined)
        : ((await ctx.runQuery(
            internal.functions.tournaments.getTournaments_Internal,
            {
              tournamentType: "active",
              includeTeams: true,
              includeTourCards: true,
              includePlayoffs: true,
              includeGolfers: true,
              includeCourse: true,
            },
          )) as EnhancedTournamentDoc | undefined);

      if (!tournament) {
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }
      if (!tournament.teams || tournament.teams.length === 0) {
        return {
          ok: true,
          skipped: true,
          reason: "no_teams",
          tournamentId: tournament._id,
        } as const;
      }

      const updates: (EnhancedTournamentTeamDoc & { teamId: Id<"teams"> })[] = [];
      for (const team of tournament.teams) {
        const updatedTeam: EnhancedTournamentTeamDoc & { teamId: Id<"teams"> } =
          {
            teamId: team._id,
            ...team,
          };
        let teamGolfers =
          tournament.golfers?.filter((g) =>
            team.golferIds.includes(g.apiId ?? -1),
          ) ?? [];

        while (teamGolfers.length < 10) {
          teamGolfers = insertReplacementGolfers(
            teamGolfers,
            tournament.golfers ?? [],
          );
        }

        const r0Golfers = categorizeTeamGolfersForRound(
          teamGolfers,
          0,
          (tournament.eventIndex ?? 0) as 0 | 1 | 2 | 3,
          false,
          tournament.currentRound ?? 0,
          tournament.course?.par ?? 72,
        );
        const r1Golfers = categorizeTeamGolfersForRound(
          teamGolfers,
          1,
          (tournament.eventIndex ?? 0) as 0 | 1 | 2 | 3,
          tournament.livePlay ?? false,
          tournament.currentRound ?? 0,
          tournament.course?.par ?? 72,
        );
        const r2Golfers = categorizeTeamGolfersForRound(
          teamGolfers,
          2,
          (tournament.eventIndex ?? 0) as 0 | 1 | 2 | 3,
          tournament.livePlay ?? false,
          tournament.currentRound ?? 0,
          tournament.course?.par ?? 72,
        );
        const r3Golfers = categorizeTeamGolfersForRound(
          teamGolfers,
          3,
          (tournament.eventIndex ?? 0) as 0 | 1 | 2 | 3,
          tournament.livePlay ?? false,
          tournament.currentRound ?? 0,
          tournament.course?.par ?? 72,
        );
        const r4Golfers = categorizeTeamGolfersForRound(
          teamGolfers,
          4,
          (tournament.eventIndex ?? 0) as 0 | 1 | 2 | 3,
          tournament.livePlay ?? false,
          tournament.currentRound ?? 0,
          tournament.course?.par ?? 72,
        );
        const r1Times = r1Golfers.active
          .map((g) => g.roundOneTeeTime)
          .filter((t) => (t?.trim().length ?? 0) > 0);
        updatedTeam.roundOneTeeTime =
          r1Times.length > 0 ? earliestTimeStr(r1Times) : undefined;
        const r2Times = r2Golfers.active
          .map((g) => g.roundTwoTeeTime)
          .filter((t) => (t?.trim().length ?? 0) > 0);
        updatedTeam.roundTwoTeeTime =
          r2Times.length > 0 ? earliestTimeStr(r2Times) : undefined;
        const r3Times = r3Golfers.active
          .map((g) => g.roundThreeTeeTime)
          .filter((t) => (t?.trim().length ?? 0) > 0);
        updatedTeam.roundThreeTeeTime =
          r3Times.length > 0 ? earliestTimeStr(r3Times) : undefined;
        const r4Times = r4Golfers.active
          .map((g) => g.roundFourTeeTime)
          .filter((t) => (t?.trim().length ?? 0) > 0);
        updatedTeam.roundFourTeeTime =
          r4Times.length > 0 ? earliestTimeStr(r4Times) : undefined;

        const activeGolferSet = [
          r0Golfers,
          r1Golfers,
          r2Golfers,
          r3Golfers,
          r4Golfers,
        ].filter((s) => s.roundState === "active");
        const completedGolferSet = [
          r0Golfers,
          r1Golfers,
          r2Golfers,
          r3Golfers,
          r4Golfers,
        ].filter((s) => s.roundState === "completed");

        const activeGolfers =
          activeGolferSet.length > 0
            ? activeGolferSet[0]
            : completedGolferSet[0];

        updatedTeam.round = activeGolfers.teamRound;
        if (activeGolfers.roundState === "active") {
          updatedTeam.today =
            avgArray(activeGolfers.active.map((g) => g.today)) ?? 0;
          updatedTeam.thru =
            avgArray(activeGolfers.active.map((g) => g.thru)) ?? 0;
        } else if (
          activeGolfers.roundState === "cut" ||
          activeGolfers.roundState === "upcoming"
        ) {
          updatedTeam.today = undefined;
          updatedTeam.thru = undefined;
        } else {
          updatedTeam.today =
            activeGolfers.teamRound === 0
              ? undefined
              : activeGolfers.teamRound === 1
                ? (avgArray(r1Golfers.active.map((g) => g.roundOne)) ?? 0) -
                  (tournament.course?.par ?? 72)
                : activeGolfers.teamRound === 2
                  ? (avgArray(r2Golfers.active.map((g) => g.roundTwo)) ?? 0) -
                    (tournament.course?.par ?? 72)
                  : activeGolfers.teamRound === 3
                    ? (avgArray(r3Golfers.active.map((g) => g.roundThree)) ??
                        0) - (tournament.course?.par ?? 72)
                    : (avgArray(r4Golfers.active.map((g) => g.roundFour)) ??
                        0) - (tournament.course?.par ?? 72);
          updatedTeam.thru = 18;
        }

        updatedTeam.roundOne =
          activeGolfers.teamRound > 1 ||
          (activeGolfers.roundState === "completed" &&
            activeGolfers.teamRound === 1)
            ? updateScoreForRound(
                {
                  currentRound: 1,
                  livePlay: activeGolfers.roundState === "active",
                  eventIndex: tournament.eventIndex,
                },
                r1Golfers.active,
                1,
              )
            : undefined;
        updatedTeam.roundTwo =
          activeGolfers.teamRound > 2 ||
          (activeGolfers.roundState === "completed" &&
            activeGolfers.teamRound === 2)
            ? updateScoreForRound(
                {
                  currentRound: 2,
                  livePlay: activeGolfers.roundState === "active",
                  eventIndex: tournament.eventIndex,
                },
                r2Golfers.active,
                2,
              )
            : undefined;
        updatedTeam.roundThree =
          activeGolfers.roundState === "cut"
            ? undefined
            : activeGolfers.teamRound > 3 ||
                (activeGolfers.roundState === "completed" &&
                  activeGolfers.teamRound === 3)
              ? updateScoreForRound(
                  {
                    currentRound: 3,
                    livePlay: activeGolfers.roundState === "active",
                    eventIndex: tournament.eventIndex,
                  },
                  r3Golfers.active,
                  3,
                )
              : undefined;
        updatedTeam.roundFour =
          activeGolfers.roundState === "cut"
            ? undefined
            : activeGolfers.teamRound > 4 ||
                (activeGolfers.roundState === "completed" &&
                  activeGolfers.teamRound === 4)
              ? updateScoreForRound(
                  {
                    currentRound: 4,
                    livePlay: activeGolfers.roundState === "active",
                    eventIndex: tournament.eventIndex,
                  },
                  r4Golfers.active,
                  4,
                )
              : undefined;

        let bonusStrokes = 0;
        if (tournament.isPlayoff && (updatedTeam.playoff ?? 0) > 0) {
          if (tournament.eventIndex === 1) {
            const playoffTeams =
              tournament.teams
                ?.filter((t) => t.playoff === updatedTeam.playoff)
                .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0)) ||
              [];
            const teamPoints = updatedTeam.totalPoints ?? 0;
            const lastPoints =
              playoffTeams[Math.min(34, playoffTeams.length - 1)]
                ?.totalPoints ?? 0;
            const firstPoints = playoffTeams[0]?.totalPoints ?? 0;
            bonusStrokes =
              firstPoints !== lastPoints
                ? ((teamPoints - lastPoints) / (firstPoints - lastPoints)) * -10
                : 0;
          } else if (tournament.eventIndex && tournament.eventIndex > 1) {
            const priorPlayoffTeam = await ctx.runQuery(
              internal.functions.teams.getTeamByTournamentAndTourCard_Internal,
              {
                tournamentId: tournament.playoffEvents?.[
                  tournament.eventIndex - 2
                ] as Id<"tournaments">,
                tourCardId: team.tourCardId,
              },
            );
            bonusStrokes = priorPlayoffTeam?.score ?? 0;
          }
        }
        const scoreParts = [
          updatedTeam.roundOne,
          updatedTeam.roundTwo,
          updatedTeam.roundThree,
          updatedTeam.roundFour,
          updatedTeam.today,
          bonusStrokes,
        ].map((score) => score ?? 0);
        updatedTeam.score = scoreParts.reduce((sum, score) => sum + score, 0);

        updates.push(updatedTeam);
      }

      for (const team of updates) {
        const sameScoreCount = tournament.isPlayoff
          ? updates.filter(
              (t) =>
                (t.score ?? 500) === (team.score ?? 500) &&
                t.playoff === team.playoff,
            ).length
          : updates.filter(
              (t) =>
                (t.score ?? 500) === (team.score ?? 500) &&
                t.tourId === team.tourId,
            ).length;
        const betterScoreCount = tournament.isPlayoff
          ? updates.filter(
              (t) =>
                (t.score ?? 500) < (team.score ?? 500) &&
                t.playoff === team.playoff,
            ).length
          : updates.filter(
              (t) =>
                (t.score ?? 500) < (team.score ?? 500) &&
                t.tourId === team.tourId,
            ).length;

        team.position = `${sameScoreCount > 1 ? "T" : ""}${betterScoreCount + 1}`;
        team.points = awardTeamPlayoffPoints(tournament, team);
        team.earnings = awardTeamEarnings(tournament, team);
        team.win = tournament.isPlayoff
          ? updates.filter(
              (t) =>
                (t.score ?? 500) < (team.score ?? 500) &&
                t.playoff === team.playoff,
            ).length === 0
            ? 1
            : 0
          : updates.filter(
                (t) =>
                  (t.score ?? 500) < (team.score ?? 500) &&
                  t.tourId === team.tourId,
              ).length === 0
            ? 1
            : 0;
        team.topTen = tournament.isPlayoff
          ? updates.filter(
              (t) =>
                (t.score ?? 500) < (team.score ?? 500) &&
                t.playoff === team.playoff,
            ).length < 10
            ? 1
            : 0
          : updates.filter(
                (t) =>
                  (t.score ?? 500) < (team.score ?? 500) &&
                  t.tourId === team.tourId,
              ).length < 10
            ? 1
            : 0;
      }

      if (
        updates.filter((u) => u.position === "T1").length > 1 &&
        tournament.currentRound &&
        tournament.currentRound >= 4 &&
        !tournament.livePlay
      ) {
        const tiedTeams = updates.filter((u) => u.position === "T1");
        const eventId = Number.parseInt(
          String(tournament.apiId ?? "").trim(),
          10,
        );
        if (Number.isFinite(eventId)) {
          let dataGolfEventData: unknown;
          try {
            dataGolfEventData = await ctx.runAction(
              api.functions.datagolf.fetchHistoricalEventDataEvents,
              {
                options: {
                  tour: "pga",
                  eventId,
                  year: new Date(tournament.startDate).getFullYear(),
                },
              },
            );
          } catch {
            dataGolfEventData = null;
          }

          const tiedEarnings = tiedTeams.map((team) => {
            return {
              id: team._id,
              earnings: team.golferIds.reduce((sum, golferId) => {
                const golfer = (
                  dataGolfEventData as { event_stats?: unknown[] } | null
                )?.event_stats?.find(
                  (g) => (g as { dg_id?: unknown }).dg_id === golferId,
                ) as { earnings?: number } | undefined;
                return sum + (golfer?.earnings ?? 0);
              }, 0),
            };
          });

          for (const outputTeam of updates) {
            if (outputTeam.position === "T1") {
              const tiedTeamEarnings = tiedEarnings.find(
                (t) => t.id === outputTeam._id,
              );
              outputTeam.position =
                tiedEarnings.filter(
                  (t) => (t.earnings ?? 0) > (tiedTeamEarnings?.earnings ?? 0),
                ).length === 0
                  ? "1"
                  : "T2";
            }
          }
        }
      }

      await ctx.runMutation(internal.functions.teams.updateTeams_Internal, {
        tournamentId: tournament._id,
        updates,
      });
    },
  });
