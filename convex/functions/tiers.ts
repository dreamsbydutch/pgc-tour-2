import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireAdmin } from "./auth";

type TierReturnType = { ok: true; tier: Doc<"tiers"> };
type TiersReturnType = { ok: true; tiers: Doc<"tiers">[] };
type CreateTierReturnType = { ok: true; tier: Doc<"tiers"> };
type UpdateTierReturnType = { ok: true; tier: Doc<"tiers"> };
type DeleteTierReturnType = { ok: true };

function validateTierValues(
  payouts: number[],
  points: number[],
): string | null {
  if (payouts.length === 0 || points.length === 0) {
    return "Payouts and points must both contain at least one value.";
  }
  if (payouts.length !== points.length) {
    return "Payouts and points must have the same number of positions.";
  }
  if (payouts.some((value) => !Number.isInteger(value) || value < 0)) {
    return "Payouts must be non-negative integers.";
  }
  if (points.some((value) => !Number.isInteger(value) || value < 0)) {
    return "Points must be non-negative integers.";
  }

  return null;
}

// GENERAL FETCH FUNCTIONS
export const getTierById = query({
  args: {
    id: v.id("tiers"),
  },
  handler: async (ctx, args): Promise<TierReturnType> => {
    const tier = await ctx.db.get(args.id);
    if (!tier) {
      throw new Error("Tier not found");
    }
    return {
      ok: true,
      tier,
    };
  },
});
export const getTiersBySeasonId = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<TiersReturnType> => {
    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    if (!tiers || tiers.length === 0) {
      throw new Error("No tiers found for this season");
    }
    return { ok: true, tiers };
  },
});
export const getTiersByName = query({
  args: {
    name: v.string(),
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<TiersReturnType> => {
    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_name_season", (q) =>
        q.eq("name", args.name).eq("seasonId", args.seasonId),
      )
      .collect();
    if (!tiers || tiers.length === 0) {
      throw new Error("No tiers found with this name");
    }
    return { ok: true, tiers };
  },
});

// ADMIN CRUD FUNCTIONS
export const createTier = internalMutation({
  args: {
    name: v.string(),
    seasonId: v.id("seasons"),
    payouts: v.array(v.number()),
    points: v.array(v.number()),
  },
  handler: async (ctx, args): Promise<CreateTierReturnType> => {
    await requireAdmin(ctx);
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found.");
    }
    const validationError = validateTierValues(args.payouts, args.points);
    if (validationError) {
      throw new Error(validationError);
    }
    const newTierId = await ctx.db.insert("tiers", {
      name: args.name,
      seasonId: args.seasonId,
      payouts: args.payouts,
      points: args.points,
      updatedAt: Date.now(),
    });
    const newTier = await ctx.db.get(newTierId);
    if (!newTier) {
      throw new Error("Error fetching newly created tier");
    }
    return { ok: true, tier: newTier };
  },
});
export const updateTier = internalMutation({
  args: {
    id: v.id("tiers"),
    name: v.optional(v.string()),
    seasonId: v.optional(v.id("seasons")),
    payouts: v.optional(v.array(v.number())),
    points: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args): Promise<UpdateTierReturnType> => {
    await requireAdmin(ctx);
    const tier = await ctx.db.get(args.id);
    if (!tier) {
      throw new Error("Tier not found.");
    }
    if (args.seasonId) {
      const season = await ctx.db.get(args.seasonId);
      if (!season) {
        throw new Error("Season not found.");
      }
    }
    const payouts = args.payouts ?? tier.payouts;
    const points = args.points ?? tier.points;
    const validationError = validateTierValues(payouts, points);
    if (validationError) {
      throw new Error(validationError);
    }
    await ctx.db.patch(args.id, {
      name: args.name ?? tier.name,
      seasonId: args.seasonId ?? tier.seasonId,
      payouts,
      points,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw new Error("Error fetching updated tier");
    }
    return { ok: true, tier: updated };
  },
});
export const deleteTier = internalMutation({
  args: {
    id: v.id("tiers"),
  },
  handler: async (ctx, args): Promise<DeleteTierReturnType> => {
    await requireAdmin(ctx);
    const tier = await ctx.db.get(args.id);
    if (!tier) {
      throw new Error("Tier not found.");
    }
    const existingTournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tier", (q) => q.eq("tierId", args.id))
      .first();
    if (existingTournament) {
      throw new Error("Cannot delete tier with existing tournaments.");
    }
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});
