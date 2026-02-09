/**
 * Tour Cards Management - Comprehensive CRUD Functions
 *
 * Functions for managing tour card registrations.
 */

import { query, mutation } from "../_generated/server";
import { requireAdmin, getCurrentMember } from "../utils/auth";
import type { Id } from "../_generated/dataModel";
import { tourCardsValidators } from "../validators/tourCards";
import {
  hasTourCardFeeForSeason,
  isCompletedTourCardFee,
  requireTourCardOwner,
} from "../utils/tourCards";
import { DEFAULT_MAX_PARTICIPANTS } from "./_constants";

export const createTourCards = mutation({
  args: tourCardsValidators.args.createTourCards,
  handler: async (ctx, args) => {
    const currentMember = await getCurrentMember(ctx);
    const memberId = args.data.memberId ?? currentMember._id;

    const skipValidation = args.options?.skipValidation ?? false;

    if (!skipValidation) {
      const validation = tourCardsValidators.validateTourCardData({
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
  args: tourCardsValidators.args.getTourCards,
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

export const getActiveMembersMissingTourCards = query({
  args: tourCardsValidators.args.getActiveMembersMissingTourCards,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const members = await ctx.db.query("members").collect();
    const activeMembers = members.filter((m) => m.isActive === true);

    const currentSeasonCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const currentCountsByMember = new Map<Id<"members">, number>();
    for (const card of currentSeasonCards) {
      currentCountsByMember.set(
        card.memberId,
        (currentCountsByMember.get(card.memberId) ?? 0) + 1,
      );
    }

    const previousCountsByMember = new Map<Id<"members">, number>();
    if (args.previousSeasonId) {
      const previousSeasonCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", args.previousSeasonId!))
        .collect();

      for (const card of previousSeasonCards) {
        previousCountsByMember.set(
          card.memberId,
          (previousCountsByMember.get(card.memberId) ?? 0) + 1,
        );
      }
    }

    const missingMembers = activeMembers.filter((m) => {
      const currentCount = currentCountsByMember.get(m._id) ?? 0;
      return currentCount === 0;
    });

    const rows = missingMembers
      .map((m) => {
        const previousSeasonTourCardsCount =
          previousCountsByMember.get(m._id) ?? 0;

        return {
          memberId: m._id,
          email: m.email,
          firstname: m.firstname ?? null,
          lastname: m.lastname ?? null,
          lastLoginAt: m.lastLoginAt ?? null,
          previousSeasonTourCardsCount,
        };
      })
      .sort((a, b) => {
        if (a.previousSeasonTourCardsCount !== b.previousSeasonTourCardsCount) {
          return (
            b.previousSeasonTourCardsCount - a.previousSeasonTourCardsCount
          );
        }
        const aName = `${a.lastname ?? ""} ${a.firstname ?? ""}`.trim();
        const bName = `${b.lastname ?? ""} ${b.firstname ?? ""}`.trim();
        if (aName !== bName) return aName.localeCompare(bName);
        return a.email.localeCompare(b.email);
      });

    const returningMissingCount = rows.filter(
      (r) => r.previousSeasonTourCardsCount > 0,
    ).length;

    return {
      activeMembersCount: activeMembers.length,
      missingCount: rows.length,
      returningMissingCount,
      members: rows,
    };
  },
});

export const getCurrentYearTourCard = query({
  args: tourCardsValidators.args.getCurrentYearTourCard,
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.options.clerkId))
      .first();

    if (!member) return null;

    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", args.options.year))
      .collect();

    if (seasons.length === 0) return null;

    const selectedSeason = seasons.reduce((best, candidate) => {
      const bestNumber = best.number ?? 0;
      const candidateNumber = candidate.number ?? 0;
      if (candidateNumber !== bestNumber) {
        return candidateNumber > bestNumber ? candidate : best;
      }

      const bestStart = best.startDate ?? 0;
      const candidateStart = candidate.startDate ?? 0;
      if (candidateStart !== bestStart) {
        return candidateStart > bestStart ? candidate : best;
      }

      return candidate._creationTime > best._creationTime ? candidate : best;
    }, seasons[0]);

    const docs = await ctx.db
      .query("tourCards")
      .withIndex("by_member_season", (q) =>
        q.eq("memberId", member._id).eq("seasonId", selectedSeason._id),
      )
      .collect();

    return docs[0] ?? null;
  },
});

export const updateTourCards = mutation({
  args: tourCardsValidators.args.updateTourCards,
  handler: async (ctx, args) => {
    const tourCard = await ctx.db.get(args.id);
    if (!tourCard) {
      throw new Error("Tour card not found");
    }

    await requireTourCardOwner(ctx, tourCard);

    const skipValidation = args.options?.skipValidation ?? false;

    if (!skipValidation) {
      const validation = tourCardsValidators.validateTourCardData(args.data);
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

export const deleteTourCards = mutation({
  args: tourCardsValidators.args.deleteTourCards,
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

export const recomputeTourCardsForSeasonAsAdmin = mutation({
  args: tourCardsValidators.args.recomputeTourCardsForSeasonAsAdmin,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const completedTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season_status", (q) =>
        q.eq("seasonId", args.seasonId).eq("status", "completed"),
      )
      .collect();

    const totalsByTourCard = new Map<
      Id<"tourCards">,
      {
        points: number;
        earnings: number;
        appearances: number;
        madeCut: number;
        wins: number;
        topTen: number;
        topFive: number;
      }
    >();

    for (const tournament of completedTournaments) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect();

      for (const team of teams) {
        const prev = totalsByTourCard.get(team.tourCardId) ?? {
          points: 0,
          earnings: 0,
          appearances: 0,
          madeCut: 0,
          wins: 0,
          topTen: 0,
          topFive: 0,
        };

        totalsByTourCard.set(team.tourCardId, {
          points: prev.points + (team.points ?? 0),
          earnings: prev.earnings + (team.earnings ?? 0),
          appearances: prev.appearances + 1,
          madeCut: prev.madeCut + (team.makeCut ?? 0),
          wins: prev.wins + (team.win ?? 0),
          topTen: prev.topTen + (team.topTen ?? 0),
          topFive: prev.topFive + (team.topFive ?? 0),
        });
      }
    }

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const updatedAt = Date.now();
    for (const card of tourCards) {
      const totals = totalsByTourCard.get(card._id) ?? {
        points: 0,
        earnings: 0,
        appearances: 0,
        madeCut: 0,
        wins: 0,
        topTen: 0,
        topFive: 0,
      };

      await ctx.db.patch(card._id, {
        points: totals.points,
        earnings: totals.earnings,
        appearances: totals.appearances,
        madeCut: totals.madeCut,
        wins: totals.wins,
        topTen: totals.topTen,
        topFive: totals.topFive,
        updatedAt,
      });
    }

    return {
      tourCardsUpdated: tourCards.length,
      completedTournamentCount: completedTournaments.length,
    };
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
