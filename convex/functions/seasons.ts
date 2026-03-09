import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireAdmin } from "./auth";

type SeasonReturnType = { ok: false } | { ok: true; season: Doc<"seasons"> };
type SeasonsReturnType =
  | { ok: false }
  | { ok: true; seasons: Doc<"seasons">[] };
type CreateSeasonReturnType = { ok: true; season: Doc<"seasons"> };
type UpdateSeasonReturnType = { ok: true; season: Doc<"seasons"> };
type DeleteSeasonReturnType = { ok: true };
type StandingsViewDataReturnType = {
  tours: Doc<"tours">[];
  tiers: Doc<"tiers">[];
  tournaments: Doc<"tournaments">[];
  tourCards: Doc<"tourCards">[];
  teams: Doc<"teams">[];
};

function validateSeasonDates(
  startDate: number,
  registrationDeadline: number,
  endDate: number,
): string | null {
  if (
    !Number.isInteger(startDate) ||
    !Number.isInteger(registrationDeadline) ||
    !Number.isInteger(endDate)
  ) {
    return "Season dates must be integer timestamps.";
  }
  if (startDate > registrationDeadline) {
    return "Registration deadline must be on or after the season start date.";
  }
  if (registrationDeadline > endDate) {
    return "Registration deadline must be on or before the season end date.";
  }

  const startYear = new Date(startDate).getFullYear();
  const registrationYear = new Date(registrationDeadline).getFullYear();
  const endYear = new Date(endDate).getFullYear();

  if (startYear !== registrationYear || registrationYear !== endYear) {
    return "Season dates must all fall within the same calendar year.";
  }

  return null;
}

// GENERAL FETCH FUNCTIONS
export const getCurrentSeason = query({
  handler: async (ctx): Promise<SeasonReturnType> => {
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
export const getSeasonByYear = query({
  args: {
    year: v.number(),
  },
  handler: async (ctx, args): Promise<SeasonReturnType> => {
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    if (!currentSeason) {
      return { ok: false };
    }
    return { ok: true, season: currentSeason };
  },
});
export const getSeasonById = query({
  args: {
    id: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<SeasonReturnType> => {
    const currentSeason = await ctx.db.get(args.id);
    if (!currentSeason) {
      return { ok: false };
    }
    return { ok: true, season: currentSeason };
  },
});
export const getSeasons = query({
  args: {
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args): Promise<SeasonsReturnType> => {
    const seasons = await ctx.db.query("seasons").collect();
    const sortOrder = args.sortOrder === "asc" ? 1 : -1;
    if (!seasons || seasons.length === 0) {
      return { ok: false };
    }
    return {
      ok: true,
      seasons: [...seasons].sort((a, b) => {
        return (a.year - b.year) * sortOrder;
      }),
    };
  },
});

// ADMIN CRUD FUNCTIONS
export const createSeason = internalMutation({
  args: {
    year: v.number(),
  },
  handler: async (ctx, args): Promise<CreateSeasonReturnType> => {
    await requireAdmin(ctx);
    if (!Number.isInteger(args.year)) {
      throw new Error("Season year must be an integer.");
    }
    const existingSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    if (existingSeason) {
      throw new Error(`Season for year ${args.year} already exists.`);
    }
    const startDate = new Date(args.year, 0, 1).getTime();
    const endDate = new Date(args.year, 11, 31).getTime();
    const registrationDeadline = new Date(args.year, 2, 1).getTime();
    const dateValidationError = validateSeasonDates(
      startDate,
      registrationDeadline,
      endDate,
    );
    if (dateValidationError) {
      throw new Error(dateValidationError);
    }
    const newSeason = await ctx.db.insert("seasons", {
      year: args.year,
      startDate,
      endDate,
      registrationDeadline,
      updatedAt: Date.now(),
    });
    const season = await ctx.db.get(newSeason);
    if (!season) {
      throw new Error("Error fetching newly created season");
    }
    return { ok: true, season };
  },
});
export const updateSeason = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    registrationDeadline: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<UpdateSeasonReturnType> => {
    await requireAdmin(ctx);
    const existingSeason = await ctx.db.get(args.seasonId);
    if (!existingSeason) {
      throw new Error("Season not found.");
    }
    const startDate = args.startDate ?? existingSeason.startDate;
    const endDate = args.endDate ?? existingSeason.endDate;
    const registrationDeadline =
      args.registrationDeadline ?? existingSeason.registrationDeadline;
    const dateValidationError = validateSeasonDates(
      startDate,
      registrationDeadline,
      endDate,
    );
    if (dateValidationError) {
      throw new Error(dateValidationError);
    }
    const year = new Date(startDate).getFullYear();
    const seasonWithSameYear = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", year))
      .first();
    if (seasonWithSameYear && seasonWithSameYear._id !== args.seasonId) {
      throw new Error(`Season for year ${year} already exists.`);
    }
    await ctx.db.patch(args.seasonId, {
      startDate,
      endDate,
      registrationDeadline,
      year,
      updatedAt: Date.now(),
    });
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Error fetching updated season");
    }
    return { ok: true, season };
  },
});
export const deleteSeason = internalMutation({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<DeleteSeasonReturnType> => {
    await requireAdmin(ctx);
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found.");
    }
    const [tour, tier, tournament, tourCard, transaction] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .first(),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .first(),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .first(),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .first(),
      ctx.db
        .query("transactions")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .first(),
    ]);
    if (tour || tier || tournament || tourCard || transaction) {
      const relatedRecords = [
        tour ? "tours" : null,
        tier ? "tiers" : null,
        tournament ? "tournaments" : null,
        tourCard ? "tour cards" : null,
        transaction ? "transactions" : null,
      ].filter((value): value is string => value !== null);
      throw new Error(
        `Cannot delete season with existing ${relatedRecords.join(", ")}.`,
      );
    }
    await ctx.db.delete(args.seasonId);
    return { ok: true };
  },
});

// TODO: Delete this function. Ideally make it un needed
export const getStandingsViewData = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<StandingsViewDataReturnType> => {
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const teamsByTournamentId = new Map<Id<"tournaments">, Doc<"teams">[]>();
    for (const tournament of tournaments) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect();
      teamsByTournamentId.set(tournament._id, teams);
    }

    const teams = tournaments.flatMap((tournament) => {
      const tableTeams = teamsByTournamentId.get(tournament._id);
      return Array.isArray(tableTeams) ? tableTeams : [];
    });

    return {
      tours,
      tiers,
      tournaments,
      tourCards,
      teams,
    };
  },
});
