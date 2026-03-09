import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireAdmin } from "./auth";

type TourReturnType = { ok: true; tour: Doc<"tours"> };
type ToursReturnType = { ok: true; tours: Doc<"tours">[] };
type CreateTourReturnType = { ok: true; tour: Doc<"tours"> };
type UpdateTourReturnType = { ok: true; tour: Doc<"tours"> };
type DeleteTourReturnType = { ok: true };

function validateTourValues(
  buyIn: number,
  playoffSpots: number[],
  maxParticipants: number | undefined,
): string | null {
  if (!Number.isInteger(buyIn) || buyIn < 0) {
    return "Buy-in must be a non-negative integer.";
  }
  if (maxParticipants !== undefined) {
    if (!Number.isInteger(maxParticipants) || maxParticipants <= 0) {
      return "Max participants must be a positive integer.";
    }
  }
  if (playoffSpots.length === 0) {
    return "Playoff spots must contain at least one position.";
  }
  if (playoffSpots.some((value) => !Number.isInteger(value) || value <= 0)) {
    return "Playoff spots must be positive integers.";
  }

  const uniquePlayoffSpots = new Set(playoffSpots);
  if (uniquePlayoffSpots.size !== playoffSpots.length) {
    return "Playoff spots must not contain duplicates.";
  }
  for (let index = 1; index < playoffSpots.length; index += 1) {
    if (playoffSpots[index]! <= playoffSpots[index - 1]!) {
      return "Playoff spots must be in strictly increasing order.";
    }
  }
  if (
    maxParticipants !== undefined &&
    playoffSpots[playoffSpots.length - 1]! > maxParticipants
  ) {
    return "Playoff spots cannot exceed max participants.";
  }

  return null;
}

// GENERAL FETCH FUNCTIONS
export const getTourById = query({
  args: {
    id: v.id("tours"),
  },
  handler: async (ctx, args): Promise<TourReturnType> => {
    const tour = await ctx.db.get(args.id);
    if (!tour) {
      throw new Error("Tour not found");
    }
    return {
      ok: true,
      tour,
    };
  },
});
export const getToursBySeasonId = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<ToursReturnType> => {
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    if (!tours || tours.length === 0) {
      throw new Error("No tours found for this season");
    }
    return { ok: true, tours };
  },
});
export const getToursByName = query({
  args: {
    name: v.string(),
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<ToursReturnType> => {
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_name_season", (q) =>
        q.eq("name", args.name).eq("seasonId", args.seasonId),
      )
      .collect();
    if (!tours || tours.length === 0) {
      throw new Error("No tours found with this name");
    }
    return { ok: true, tours };
  },
});

// ADMIN CRUD FUNCTIONS
export const createTour = internalMutation({
  args: {
    name: v.string(),
    seasonId: v.id("seasons"),
    shortForm: v.string(),
    logoUrl: v.string(),
    buyIn: v.number(),
    playoffSpots: v.array(v.number()),
    maxParticipants: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CreateTourReturnType> => {
    await requireAdmin(ctx);
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found.");
    }
    const validationError = validateTourValues(
      args.buyIn,
      args.playoffSpots,
      args.maxParticipants,
    );
    if (validationError) {
      throw new Error(validationError);
    }
    const newTourId = await ctx.db.insert("tours", {
      name: args.name,
      seasonId: args.seasonId,
      shortForm: args.shortForm,
      logoUrl: args.logoUrl,
      buyIn: args.buyIn,
      playoffSpots: args.playoffSpots,
      maxParticipants: args.maxParticipants,
      updatedAt: Date.now(),
    });
    const newTour = await ctx.db.get(newTourId);
    if (!newTour) {
      throw new Error("Error fetching newly created tour");
    }
    return { ok: true, tour: newTour };
  },
});
export const updateTour = internalMutation({
  args: {
    id: v.id("tours"),
    name: v.optional(v.string()),
    seasonId: v.optional(v.id("seasons")),
    shortForm: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    buyIn: v.optional(v.number()),
    playoffSpots: v.optional(v.array(v.number())),
    maxParticipants: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<UpdateTourReturnType> => {
    await requireAdmin(ctx);
    const tour = await ctx.db.get(args.id);
    if (!tour) {
      throw new Error("Tour not found.");
    }
    if (args.seasonId) {
      const season = await ctx.db.get(args.seasonId);
      if (!season) {
        throw new Error("Season not found.");
      }
    }
    const buyIn = args.buyIn ?? tour.buyIn;
    const playoffSpots = args.playoffSpots ?? tour.playoffSpots;
    const maxParticipants = args.maxParticipants ?? tour.maxParticipants;
    const validationError = validateTourValues(
      buyIn,
      playoffSpots,
      maxParticipants,
    );
    if (validationError) {
      throw new Error(validationError);
    }
    await ctx.db.patch(args.id, {
      name: args.name ?? tour.name,
      seasonId: args.seasonId ?? tour.seasonId,
      shortForm: args.shortForm ?? tour.shortForm,
      logoUrl: args.logoUrl ?? tour.logoUrl,
      buyIn,
      playoffSpots,
      maxParticipants,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw new Error("Error fetching updated tour");
    }
    return { ok: true, tour: updated };
  },
});
export const deleteTour = internalMutation({
  args: {
    id: v.id("tours"),
  },
  handler: async (ctx, args): Promise<DeleteTourReturnType> => {
    await requireAdmin(ctx);
    const tour = await ctx.db.get(args.id);
    if (!tour) {
      throw new Error("Tour not found.");
    }
    const existingTourCard = await ctx.db
      .query("tourCards")
      .withIndex("by_tour", (q) => q.eq("tourId", args.id))
      .first();
    if (existingTourCard) {
      throw new Error("Cannot delete tour with existing tour cards.");
    }
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});
