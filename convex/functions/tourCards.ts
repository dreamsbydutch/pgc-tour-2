/**
 * Tour Cards Management - Comprehensive CRUD Functions
 *
 * Functions for managing tour card registrations.
 */

import { mutation, query } from "../_generated/server";
import { tourCardsValidators } from "../validators/common";
import {
  hasTourCardFeeForSeason,
  isCompletedTourCardFee,
  requireTourCardOwner,
} from "../utils/tourCards";
import { DEFAULT_MAX_PARTICIPANTS } from "./_constants";
import { getCurrentMember } from "../utils/auth";
import { writeAuditLog } from "../utils/audit";
import { v } from "convex/values";

export const createMyTourCard = mutation({
  args: {
    displayName: v.string(),
    tourId: v.id("tours"),
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    const [tour, season] = await Promise.all([
      ctx.db.get(args.tourId),
      ctx.db.get(args.seasonId),
    ]);
    if (!tour || !season) {
      throw new Error("Tour or season not found");
    }
    if (tour.seasonId !== season._id) {
      throw new Error("Tour does not belong to the selected season");
    }
    if (
      typeof season.registrationDeadline === "number" &&
      Date.now() >= season.registrationDeadline
    ) {
      throw new Error("Registration is closed for this season");
    }

    const memberCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member_season", (q) =>
        q.eq("memberId", member._id).eq("seasonId", season._id),
      )
      .collect();
    if (memberCards.some((card) => card.tourId === tour._id)) {
      throw new Error("You are already registered for this tour");
    }

    const capacity =
      typeof tour.maxParticipants === "number" && tour.maxParticipants > 0
        ? tour.maxParticipants
        : DEFAULT_MAX_PARTICIPANTS;
    const registeredCount =
      tour.registeredCount ??
      (
        await ctx.db
          .query("tourCards")
          .withIndex("by_tour_season", (q) =>
            q.eq("tourId", tour._id).eq("seasonId", season._id),
          )
          .take(capacity)
      ).length;
    if (registeredCount >= capacity) {
      throw new Error("Selected tour is full");
    }

    const now = Date.now();
    const tourCardId = await ctx.db.insert("tourCards", {
      displayName: args.displayName.trim() || member.email,
      tourId: tour._id,
      seasonId: season._id,
      memberId: member._id,
      earnings: 0,
      points: 0,
      wins: 0,
      topTen: 0,
      topFive: 0,
      madeCut: 0,
      appearances: 0,
      updatedAt: now,
    });
    await ctx.db.patch(tour._id, {
      registeredCount: registeredCount + 1,
      updatedAt: now,
    });

    if (
      !(await hasTourCardFeeForSeason(ctx, { member, seasonId: season._id }))
    ) {
      const fee = -Math.abs(tour.buyIn);
      await ctx.db.insert("transactions", {
        memberId: member._id,
        seasonId: season._id,
        amount: fee,
        transactionType: "TourCardFee",
        status: "completed",
        processedAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(member._id, {
        account: member.account + fee,
        updatedAt: now,
      });
    }

    await writeAuditLog(ctx, {
      memberId: member._id,
      entityType: "tourCard",
      entityId: String(tourCardId),
      action: "created",
      changes: { tourId: String(tour._id), seasonId: String(season._id) },
    });
    return await ctx.db.get(tourCardId);
  },
});

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

    const destinationCount =
      tour.registeredCount ??
      (
        await ctx.db
          .query("tourCards")
          .withIndex("by_tour_season", (q) =>
            q.eq("tourId", args.tourId).eq("seasonId", tourCard.seasonId),
          )
          .take(maxParticipants)
      ).length;
    if (destinationCount >= maxParticipants) {
      throw new Error("Selected tour is full");
    }

    const previousTour = await ctx.db.get(tourCard.tourId);
    const previousCount = previousTour
      ? (previousTour.registeredCount ??
        (
          await ctx.db
            .query("tourCards")
            .withIndex("by_tour", (q) => q.eq("tourId", previousTour._id))
            .take(
              (previousTour.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS) + 1,
            )
        ).length)
      : 0;
    await ctx.db.patch(args.id, {
      tourId: args.tourId,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(tour._id, {
      registeredCount: destinationCount + 1,
      updatedAt: Date.now(),
    });
    if (previousTour) {
      await ctx.db.patch(previousTour._id, {
        registeredCount: Math.max(previousCount - 1, 0),
        updatedAt: Date.now(),
      });
    }
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
      .take(100);
    for (const team of teams) {
      await ctx.db.patch(team._id, { tourId: args.tourId });
    }

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
    const tour = await ctx.db.get(tourCard.tourId);
    if (tour) {
      const remainingCount =
        tour.registeredCount !== undefined
          ? Math.max(tour.registeredCount - 1, 0)
          : (
              await ctx.db
                .query("tourCards")
                .withIndex("by_tour", (q) => q.eq("tourId", tour._id))
                .take((tour.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS) + 1)
            ).length;
      await ctx.db.patch(tour._id, {
        registeredCount: remainingCount,
        updatedAt: Date.now(),
      });
    }

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
