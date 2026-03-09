/**
 * Tour Cards Management - Comprehensive CRUD Functions
 *
 * Functions for managing tour card registrations.
 */

import { internalMutation, query, type MutationCtx } from "../_generated/server";
import { isCompletedTourCardFee } from "../utils/tourCards";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin, requireAuth, requireTourCardOwner } from "./auth";
import { internal } from "../_generated/api";

type TourCardReturnType = { ok: true; tourCard: Doc<"tourCards"> };
type TourCardsReturnType = { ok: true; tourCards: Doc<"tourCards">[] };
type DeleteTourCardReturnType = { ok: true };

async function getExistingTourCardForMemberTourSeason(
  ctx: MutationCtx,
  memberId: Doc<"tourCards">["memberId"] | Doc<"members">["_id"],
  seasonId: Doc<"tourCards">["seasonId"],
  tourId: Doc<"tourCards">["tourId"],
  excludeTourCardId?: Doc<"tourCards">["_id"],
): Promise<Doc<"tourCards"> | null> {
  const memberSeasonTourCards = await ctx.db
    .query("tourCards")
    .withIndex("by_member_season", (q) =>
      q.eq("memberId", memberId).eq("seasonId", seasonId),
    )
    .collect();

  return (
    memberSeasonTourCards.find(
      (tourCard) =>
        tourCard.tourId === tourId &&
        (excludeTourCardId === undefined || tourCard._id !== excludeTourCardId),
    ) ?? null
  );
}

// GENERAL FETCH FUNCTIONS
export const getTourCardById = query({
  args: {
    id: v.id("tourCards"),
  },
  handler: async (ctx, args): Promise<TourCardReturnType> => {
    const tourCard = await ctx.db.get(args.id);
    if (!tourCard) {
      throw new Error("Tour Card not found");
    }
    return {
      ok: true,
      tourCard,
    };
  },
});
export const getTourCardsByTourSeason = query({
  args: {
    seasonId: v.id("seasons"),
    tourId: v.id("tours"),
  },
  handler: async (ctx, args): Promise<TourCardsReturnType> => {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_tour_season", (q) =>
        q.eq("tourId", args.tourId).eq("seasonId", args.seasonId),
      )
      .collect();
    if (!tourCards || tourCards.length === 0) {
      throw new Error("No tourCards found for this season");
    }
    return { ok: true, tourCards };
  },
});
export const getTourCardsBySeason = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<TourCardsReturnType> => {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    if (!tourCards || tourCards.length === 0) {
      throw new Error("No tourCards found for this season");
    }
    return { ok: true, tourCards };
  },
});
export const getTourCardsByMember = query({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args): Promise<TourCardsReturnType> => {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
    if (!tourCards || tourCards.length === 0) {
      throw new Error("No tourCards found for this member");
    }
    return { ok: true, tourCards };
  },
});
export const getTourCardsByMemberSeason = query({
  args: {
    memberId: v.id("members"),
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args): Promise<TourCardsReturnType> => {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member_season", (q) =>
        q.eq("memberId", args.memberId).eq("seasonId", args.seasonId),
      )
      .collect();
    if (!tourCards || tourCards.length === 0) {
      throw new Error("No tourCards found for this member in this season");
    }
    return { ok: true, tourCards };
  },
});

// ADMIN CRUD FUNCTIONS
export const createTourCard = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    tourId: v.id("tours"),
  },
  handler: async (ctx, args): Promise<TourCardReturnType> => {
    const member = await requireAuth(ctx);
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found");
    }
    const tour = await ctx.db.get(args.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }
    if (tour.seasonId !== args.seasonId) {
      throw new Error("Tour does not belong to the provided season");
    }
    const existingTourCard = await getExistingTourCardForMemberTourSeason(
      ctx,
      member.id,
      args.seasonId,
      args.tourId,
    );
    if (existingTourCard) {
      throw new Error("Tour card already exists for this member, tour, and season");
    }
    const newTourCardId = await ctx.db.insert("tourCards", {
      memberId: member.id,
      seasonId: args.seasonId,
      tourId: args.tourId,
      displayName: member.firstname[0] + ". " + member.lastname,
      appearances: 0,
      points: 0,
      earnings: 0,
      madeCut: 0,
      topTen: 0,
      topFive: 0,
      wins: 0,
    });
    const newTransactionId = await ctx.db.insert("transactions", {
      memberId: member.id,
      seasonId: args.seasonId,
      amount: tour.buyIn,
      transactionType: "TourCardFee",
      status: "completed",
      processedAt: Date.now(),
    });
    await ctx.db.patch(member.id, {
      account: member.account - tour.buyIn,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.functions.utils.captureEvent, {
      event: "tourCard.created",
      distinctId: "admin",
      properties: {
        tourCardId: String(newTourCardId),
        displayName: member.firstname[0] + ". " + member.lastname,
        seasonId: String(args.seasonId),
        tourId: String(args.tourId),
        transactionId: String(newTransactionId),
      },
    });
    const newTourCard = await ctx.db.get(newTourCardId);
    if (!newTourCard) {
      throw new Error("Error fetching newly created tourCard");
    }
    return { ok: true, tourCard: newTourCard };
  },
});
export const changeTourOnTourCard = internalMutation({
  args: {
    tourCardId: v.id("tourCards"),
    tourId: v.id("tours"),
  },
  handler: async (ctx, args): Promise<TourCardReturnType> => {
    const tourCard = await ctx.db.get(args.tourCardId);
    if (!tourCard) {
      throw new Error("TourCard not found");
    }
    await requireTourCardOwner(ctx, tourCard);

    const tour = await ctx.db.get(args.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }

    if (tour.seasonId !== tourCard.seasonId) {
      throw new Error("Tour does not belong to the tour card's season");
    }
    const existingTourCard = await getExistingTourCardForMemberTourSeason(
      ctx,
      tourCard.memberId,
      tourCard.seasonId,
      args.tourId,
      tourCard._id,
    );
    if (existingTourCard) {
      throw new Error("Member already has a tour card for this tour and season");
    }

    await ctx.db.patch(args.tourCardId, {
      tourId: args.tourId,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(args.tourCardId);
    if (!updated) {
      throw new Error("Error fetching updated tourCard");
    }
    return { ok: true, tourCard: updated };
  },
});
export const updateTourCards = internalMutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args): Promise<void> => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found");
    }
    const now = Date.now();
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .filter((q) => q.lte(q.field("endDate"), now))
      .collect();
    const tournamentIds = tournaments.map((t) => t._id);
    const tournamentIdSet = new Set(tournamentIds);
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    const updatedTourCards = [];
    for (const tourCard of tourCards) {
      const allTeams = await ctx.db
        .query("teams")
        .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
        .collect();
      const teams = allTeams.filter((team) =>
        tournamentIdSet.has(team.tournamentId),
      );
      const tour = await ctx.db.get(tourCard.tourId);
      if (!tour || !teams || teams.length === 0) {
        continue;
      }
      const appearances = teams.length;
      const points = teams.reduce((sum, team) => sum + (team.points || 0), 0);
      const earnings = teams.reduce(
        (sum, team) => sum + (team.earnings || 0),
        0,
      );
      const madeCut = teams.reduce((sum, team) => sum + (team.makeCut || 0), 0);
      const topTen = teams.reduce((sum, team) => sum + (team.topTen || 0), 0);
      const topFive = teams.reduce((sum, team) => sum + (team.topFive || 0), 0);
      const wins = teams.reduce((sum, team) => sum + (team.win || 0), 0);
      updatedTourCards.push({
        ...tourCard,
        appearances,
        points,
        earnings,
        madeCut,
        topTen,
        topFive,
        wins,
        updatedAt: Date.now(),
      });
    }
    for (const tourCard of updatedTourCards) {
      const tour = await ctx.db.get(tourCard.tourId);
      if (!tour) {
        continue;
      }
      const sameTourTourCards = updatedTourCards.filter(
        (tc) => tc.tourId === tourCard.tourId,
      );
      const position = sameTourTourCards.filter(
        (tc) => (tc.points ?? 0) < (tourCard.points ?? 0),
      ).length;
      const tiedTeams = sameTourTourCards.filter(
        (tc) => (tc.points ?? 0) === (tourCard.points ?? 0),
      ).length;
      const currentPosition =
        tiedTeams > 1 ? `T${position + 1}` : `${position + 1}`;
      const playoff =
        tour.playoffSpots.length > 0 && position < tour.playoffSpots[0]
          ? 1
          : tour.playoffSpots.length > 1 && position < tour.playoffSpots[1]
            ? 2
            : tour.playoffSpots.length > 2 && position < tour.playoffSpots[2]
              ? 3
              : 0;
      const sameLastName = updatedTourCards.some(
        (tc) => tourCard.displayName === tc.displayName && tourCard._id !== tc._id,
      );
      let displayName = tourCard.displayName
      if (sameLastName) {
        const tourCardMemberIds = updatedTourCards.map(tc => tc.memberId);
        const member = await ctx.db.get(tourCard.memberId);
        const familyMembers = await ctx.db
          .query("members")
          .withIndex("by_lastname", (q) =>
            q.eq("lastname", member?.lastname ?? ""),
          )
          .collect();
        const activeFamilyMembers = familyMembers.filter(fm => tourCardMemberIds.includes(fm._id))
        const numberOfLetters = activeFamilyMembers.filter(fm => fm.firstname?.[0] === member?.firstname?.[0]).length === 1 ? 1 : activeFamilyMembers.filter(fm => fm.firstname?.slice(0,2) === member?.firstname?.slice(0,2)).length === 1 ? 2 : member?.firstname?.length ?? 3;
        displayName = member?.firstname?.slice(0,numberOfLetters)+". "+member?.lastname || tourCard.displayName;
      }
      await ctx.db.patch(tourCard._id, {
        ...tourCard,
        currentPosition,
        playoff,
        displayName,
        updatedAt: Date.now(),
      });
    }
  },
});
export const deleteTourCard = internalMutation({
  args: {
    tourCardId: v.id("tourCards"),
  },
  handler: async (ctx, args): Promise<DeleteTourCardReturnType> => {
    const member = await requireAuth(ctx);
    const tourCard = await ctx.db.get(args.tourCardId);
    if (!tourCard) {
      throw new Error("TourCard not found");
    }
    if (tourCard.memberId !== member.id) {
      await requireAdmin(ctx);
    }
    const tour = await ctx.db.get(tourCard.tourId);
    if (!tour) {
      throw new Error("Associated tour not found");
    }
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", args.tourCardId))
      .first();
    if (existingTeam) {
      throw new Error("Cannot delete tour card with existing teams");
    }
    const feeTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_member_season_type", (q) =>
        q
          .eq("memberId", tourCard.memberId)
          .eq("seasonId", tourCard.seasonId)
          .eq("transactionType", "TourCardFee"),
      )
      .collect();
    const feeTransaction =
      feeTransactions
        .filter((tx) => isCompletedTourCardFee(tx) && tx.amount === tour.buyIn)
        .sort((left, right) => {
          const leftTime = left.processedAt ?? left.updatedAt ?? left._creationTime;
          const rightTime =
            right.processedAt ?? right.updatedAt ?? right._creationTime;
          return rightTime - leftTime;
        })[0] ?? null;
    if (!feeTransaction) {
      throw new Error("Associated tour card fee transaction not found");
    }
    await ctx.db.delete(feeTransaction._id);
    if (feeTransaction.amount !== 0) {
      const member = await ctx.db.get(tourCard.memberId);
      if (member) {
        await ctx.db.patch(member._id, {
          account: member.account + feeTransaction.amount,
          updatedAt: Date.now(),
        });
      }
    }
    await ctx.db.delete(args.tourCardId);
    await ctx.scheduler.runAfter(0, internal.functions.utils.captureEvent, {
      event: "tourCard.deleted",
      distinctId: "admin",
      properties: {
        tourCardId: String(args.tourCardId),
        displayName: tourCard.displayName,
        seasonId: String(tourCard.seasonId),
        tourId: String(tourCard.tourId),
        transactionId: String(feeTransaction._id),
        totalRefund: feeTransaction.amount,
      },
    });
    return { ok: true };
  },
});
