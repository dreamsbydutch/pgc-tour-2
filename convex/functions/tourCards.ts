/**
 * Tour Cards Management - Comprehensive CRUD Functions
 *
 * Functions for managing tour card registrations.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnResource, getCurrentMember } from "../auth";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ValidationResult } from "../types/types";

const DEFAULT_MAX_PARTICIPANTS = 75;

export const createTourCards = mutation({
  args: {
    data: v.object({
      memberId: v.optional(v.id("members")),

      displayName: v.string(),
      tourId: v.id("tours"),
      seasonId: v.id("seasons"),

      earnings: v.number(),
      points: v.number(),
      wins: v.optional(v.number()),
      topTen: v.number(),
      topFive: v.optional(v.number()),
      madeCut: v.number(),
      appearances: v.number(),
      playoff: v.optional(v.number()),
      currentPosition: v.optional(v.string()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        setActive: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const currentMember = await getCurrentMember(ctx);
    const memberId = args.data.memberId ?? currentMember._id;

    const skipValidation = args.options?.skipValidation ?? false;

    if (!skipValidation) {
      const validation = validateTourCardData({
        displayName: args.data.displayName,
        earnings: args.data.earnings,
        points: args.data.points,
        wins: args.data.wins,
        topTen: args.data.topTen,
        appearances: args.data.appearances,
        madeCut: args.data.madeCut,
      });
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }

    const tour = await ctx.db.get(args.data.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }

    if (tour.seasonId !== args.data.seasonId) {
      throw new Error("Tour does not belong to provided season");
    }

    const shouldChargeBuyIn = tour.buyIn > 0;
    const hasExistingTourCardFee = shouldChargeBuyIn
      ? await hasTourCardFeeForSeason(ctx, {
          member: currentMember,
          seasonId: args.data.seasonId,
        })
      : false;

    if (shouldChargeBuyIn && !hasExistingTourCardFee) {
      const processedAt = Date.now();
      const signedAmount = -Math.abs(Math.trunc(tour.buyIn));

      await ctx.db.insert("transactions", {
        memberId: currentMember._id,
        seasonId: args.data.seasonId,
        amount: signedAmount,
        transactionType: "TourCardFee",
        status: "completed",
        processedAt,
        updatedAt: processedAt,
      });

      await ctx.db.patch(currentMember._id, {
        account: currentMember.account + signedAmount,
        updatedAt: processedAt,
      });
    }

    const id = await ctx.db.insert("tourCards", {
      memberId,
      displayName: args.data.displayName,
      tourId: args.data.tourId,
      seasonId: args.data.seasonId,
      earnings: args.data.earnings,
      points: args.data.points,
      wins: args.data.wins,
      topTen: args.data.topTen,
      topFive: args.data.topFive,
      madeCut: args.data.madeCut,
      appearances: args.data.appearances,
      playoff: args.data.playoff,
      currentPosition: args.data.currentPosition,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

export const getTourCards = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tourCards")),
        memberId: v.optional(v.id("members")),
        clerkId: v.optional(v.string()),
        seasonId: v.optional(v.id("seasons")),
        tourId: v.optional(v.id("tours")),
        activeOnly: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options;

    if (options?.id) {
      const doc = await ctx.db.get(options.id);
      if (!doc) return [];
      return [doc];
    }

    if ((options?.memberId || options?.clerkId) && options?.seasonId) {
      const memberId =
        options?.memberId ??
        (
          await ctx.db
            .query("members")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", options!.clerkId!))
            .first()
        )?._id;
      if (!memberId) return [];

      const docs = await ctx.db
        .query("tourCards")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", memberId).eq("seasonId", options.seasonId!),
        )
        .collect();
      return docs;
    }

    if (options?.tourId && options?.seasonId) {
      const docs = await ctx.db
        .query("tourCards")
        .withIndex("by_tour_season", (q) =>
          q.eq("tourId", options.tourId!).eq("seasonId", options.seasonId!),
        )
        .collect();
      return docs;
    }

    if (options?.memberId || options?.clerkId) {
      const memberId =
        options?.memberId ??
        (
          await ctx.db
            .query("members")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", options!.clerkId!))
            .first()
        )?._id;
      if (!memberId) return [];

      const docs = await ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", memberId))
        .collect();
      return docs;
    }

    if (options?.seasonId) {
      const docs = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", options.seasonId!))
        .collect();
      return docs;
    }

    if (options?.tourId) {
      const docs = await ctx.db
        .query("tourCards")
        .withIndex("by_tour", (q) => q.eq("tourId", options.tourId!))
        .collect();
      return docs;
    }

    return await ctx.db.query("tourCards").collect();
  },
});

export const updateTourCards = mutation({
  args: {
    id: v.id("tourCards"),
    data: v.object({
      displayName: v.optional(v.string()),
      earnings: v.optional(v.number()),
      points: v.optional(v.number()),
      wins: v.optional(v.number()),
      topTen: v.optional(v.number()),
      topFive: v.optional(v.number()),
      madeCut: v.optional(v.number()),
      appearances: v.optional(v.number()),
      playoff: v.optional(v.number()),
      currentPosition: v.optional(v.string()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tourCard = await ctx.db.get(args.id);
    if (!tourCard) {
      throw new Error("Tour card not found");
    }

    await requireTourCardOwner(ctx, tourCard);

    const skipValidation = args.options?.skipValidation ?? false;

    if (!skipValidation) {
      const validation = validateTourCardData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }

    await ctx.db.patch(args.id, {
      ...args.data,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(args.id);
  },
});

export const switchTourCards = mutation({
  args: {
    id: v.id("tourCards"),
    tourId: v.id("tours"),
  },
  handler: async (ctx, args) => {
    const tourCard = await ctx.db.get(args.id);
    if (!tourCard) {
      throw new Error("Tour card not found");
    }

    await requireTourCardOwner(ctx, tourCard);

    if (tourCard.tourId === args.tourId) {
      return tourCard;
    }

    const tour = await ctx.db.get(args.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }

    if (tour.seasonId !== tourCard.seasonId) {
      throw new Error("Tour does not belong to the tour card's season");
    }

    const maxParticipants =
      typeof tour.maxParticipants === "number" && tour.maxParticipants > 0
        ? tour.maxParticipants
        : DEFAULT_MAX_PARTICIPANTS;

    const existing = await ctx.db
      .query("tourCards")
      .withIndex("by_tour_season", (q) =>
        q.eq("tourId", args.tourId).eq("seasonId", tourCard.seasonId),
      )
      .collect();

    if (existing.length >= maxParticipants) {
      throw new Error("Selected tour is full");
    }

    await ctx.db.patch(args.id, {
      tourId: args.tourId,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(args.id);
  },
});

export const deleteTourCards = mutation({
  args: {
    id: v.id("tourCards"),
    options: v.optional(
      v.object({
        softDelete: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tourCard = await ctx.db.get(args.id);
    if (!tourCard) {
      throw new Error("Tour card not found");
    }

    await requireTourCardOwner(ctx, tourCard);

    await ctx.db.delete(args.id);
    return tourCard;
  },
});

/**
 * Validate tour card data
 */
function validateTourCardData(data: {
  displayName?: string;
  earnings?: number;
  points?: number;
  wins?: number;
  topTen?: number;
  appearances?: number;
  madeCut?: number;
}): ValidationResult {
  const errors: string[] = [];

  if (data.displayName && data.displayName.trim().length === 0) {
    errors.push("Display name cannot be empty");
  }

  if (data.displayName && data.displayName.trim().length > 100) {
    errors.push("Display name cannot exceed 100 characters");
  }

  if (data.earnings !== undefined && data.earnings < 0) {
    errors.push("Earnings cannot be negative");
  }

  if (data.points !== undefined && data.points < 0) {
    errors.push("Points cannot be negative");
  }

  if (data.wins !== undefined && data.wins < 0) {
    errors.push("Wins cannot be negative");
  }

  if (data.topTen !== undefined && data.topTen < 0) {
    errors.push("Top ten finishes cannot be negative");
  }

  if (data.appearances !== undefined && data.appearances < 0) {
    errors.push("Appearances cannot be negative");
  }

  if (data.madeCut !== undefined && data.madeCut < 0) {
    errors.push("Made cuts cannot be negative");
  }

  return { isValid: errors.length === 0, errors };
}

function isCompletedTourCardFee(tx: Doc<"transactions"> | null): boolean {
  if (!tx) return false;
  return tx.status === undefined || tx.status === "completed";
}

async function requireTourCardOwner(
  ctx: MutationCtx,
  tourCard: Doc<"tourCards">,
) {
  const member = await ctx.db.get(tourCard.memberId);
  const clerkId = member?.clerkId;
  if (!clerkId) {
    throw new Error("Unauthorized: Tour card owner is not linked to Clerk");
  }
  await requireOwnResource(ctx, clerkId);
}

async function hasTourCardFeeForSeason(
  ctx: MutationCtx,
  args: {
    member: Doc<"members">;
    seasonId: Id<"seasons">;
  },
): Promise<boolean> {
  const { member, seasonId } = args;

  const existing = await ctx.db
    .query("transactions")
    .withIndex("by_member_season_type", (q) =>
      q
        .eq("memberId", member._id)
        .eq("seasonId", seasonId)
        .eq("transactionType", "TourCardFee"),
    )
    .first();

  return isCompletedTourCardFee(existing);
}
