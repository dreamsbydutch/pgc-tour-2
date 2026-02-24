/**
 * Tour Cards Management - Comprehensive CRUD Functions
 *
 * Functions for managing tour card registrations.
 */

import { mutation, query } from "../_generated/server";
import { tourCardsValidators } from "../validators/tourCards";
import {
  isCompletedTourCardFee,
  requireTourCardOwner,
} from "../utils/tourCards";
import { DEFAULT_MAX_PARTICIPANTS } from "./_constants";

export const getTourCards = query({
  args: tourCardsValidators.args.getTourCards,
  handler: async (ctx, args) => {
    const options = args.options ?? {};

    if (options.id) {
      const card = await ctx.db.get(options.id);
      return card ? [card] : [];
    }

    let memberId = options.memberId;

    if (!memberId && options.clerkId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", options.clerkId!))
        .first();
      memberId = member?._id;
    }

    if (memberId && options.seasonId) {
      return await ctx.db
        .query("tourCards")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", memberId!).eq("seasonId", options.seasonId!),
        )
        .collect();
    }

    if (memberId) {
      return await ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", memberId!))
        .collect();
    }

    if (options.tourId && options.seasonId) {
      return await ctx.db
        .query("tourCards")
        .withIndex("by_tour_season", (q) =>
          q.eq("tourId", options.tourId!).eq("seasonId", options.seasonId!),
        )
        .collect();
    }

    if (options.tourId) {
      return await ctx.db
        .query("tourCards")
        .withIndex("by_tour", (q) => q.eq("tourId", options.tourId!))
        .collect();
    }

    if (options.seasonId) {
      return await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", options.seasonId!))
        .collect();
    }

    return await ctx.db.query("tourCards").collect();
  },
});

// Used in TourCardForm to switch a tour card to a different tour within the same season, with validation and capacity checks.
export const switchTourCards = mutation({
  args: tourCardsValidators.args.switchTourCards,
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

// Used in TourCardChangeButton to delete old tour card and associated fee transactions when switching tours, if the user has no other tour cards in the season.
export const deleteTourCardAndFee = mutation({
  args: tourCardsValidators.args.deleteTourCardAndFee,
  handler: async (ctx, args) => {
    const tourCard = await ctx.db.get(args.id);
    if (!tourCard) {
      throw new Error("Tour card not found");
    }

    await requireTourCardOwner(ctx, tourCard);

    const member = await ctx.db.get(tourCard.memberId);
    if (!member) {
      throw new Error("Member not found");
    }

    const tourCardsInSeason = await ctx.db
      .query("tourCards")
      .withIndex("by_member_season", (q) =>
        q.eq("memberId", member._id).eq("seasonId", tourCard.seasonId),
      )
      .collect();

    const hasOtherTourCardsInSeason = tourCardsInSeason.some(
      (doc) => doc._id !== tourCard._id,
    );

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
      .collect();

    for (const team of teams) {
      await ctx.db.delete(team._id);
    }

    await ctx.db.delete(tourCard._id);

    if (!hasOtherTourCardsInSeason) {
      const feeTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_member_season_type", (q) =>
          q
            .eq("memberId", member._id)
            .eq("seasonId", tourCard.seasonId)
            .eq("transactionType", "TourCardFee"),
        )
        .collect();

      const completedFeeTotal = feeTransactions
        .filter(isCompletedTourCardFee)
        .reduce((sum, tx) => sum + tx.amount, 0);

      for (const tx of feeTransactions) {
        await ctx.db.delete(tx._id);
      }

      if (completedFeeTotal !== 0) {
        const updatedAt = Date.now();
        await ctx.db.patch(member._id, {
          account: member.account - completedFeeTotal,
          updatedAt,
        });
      }
    }

    return tourCard;
  },
});
