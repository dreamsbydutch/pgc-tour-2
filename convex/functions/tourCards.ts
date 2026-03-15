/**
 * Tour Cards Management - Comprehensive CRUD Functions
 *
 * Functions for managing tour card registrations.
 */

import type { Doc } from "../_generated/dataModel";
import type { TourCardWithMember } from "../types/tourCards";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { tourCardsValidators } from "../validators/tourCards";
import { listSeasons } from "../utils/seasons";
import { getCurrentMember, requireAuth } from "../utils/auth";
import {
  isCompletedTourCardFee,
  requireTourCardOwner,
} from "../utils/tourCards";
import { DEFAULT_MAX_PARTICIPANTS } from "./_constants";

// Level 1: read and access helpers

/** Returns the current-year season ids used for public read gating. */
async function getCurrentYearSeasonIds(ctx: QueryCtx) {
  const seasons = await listSeasons(ctx);
  const currentYear = new Date().getFullYear();

  return seasons
    .filter((season) => season.year === currentYear)
    .map((season) => season._id);
}

/** Returns whether the current caller is authenticated. */
async function isSignedIn(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return Boolean(identity?.subject);
}

/** Hydrates a list of tour cards with their linked member records. */
async function hydrateTourCards(
  ctx: QueryCtx,
  tourCards: Doc<"tourCards">[],
): Promise<TourCardWithMember[]> {
  return await Promise.all(
    tourCards.map(async (tourCard) => {
      const member = await ctx.db.get(tourCard.memberId);

      if (!member) {
        throw new Error("Member not found for tour card");
      }

      return {
        ...tourCard,
        member,
      };
    }),
  );
}

/** Hydrates one tour card with its linked member record. */
async function hydrateTourCard(
  ctx: QueryCtx,
  tourCard: Doc<"tourCards">,
): Promise<TourCardWithMember> {
  return (await hydrateTourCards(ctx, [tourCard]))[0];
}

/** Returns one tour card or throws when it does not exist. */
async function getTourCardOrThrow(
  ctx: MutationCtx,
  id: Doc<"tourCards">["_id"],
) {
  const tourCard = await ctx.db.get(id);

  if (!tourCard) {
    throw new Error("Tour card not found");
  }

  return tourCard;
}

/** Enforces owner-or-admin access for a tour card write. */
async function requireTourCardAccess(
  ctx: MutationCtx,
  tourCard: Doc<"tourCards">,
) {
  const actingMember = await getCurrentMember(ctx);

  if (actingMember.role !== "admin") {
    await requireTourCardOwner(ctx, tourCard);
  }

  return actingMember;
}

// Level 2: mutation validation and write helpers

/** Validates that a target tour belongs to the same season and still has capacity. */
async function validateTargetTourForSeason(
  ctx: MutationCtx,
  args: {
    tourId: Doc<"tours">["_id"];
    seasonId: Doc<"seasons">["_id"];
    excludeTourCardId?: Doc<"tourCards">["_id"];
  },
) {
  const tour = await ctx.db.get(args.tourId);

  if (!tour) {
    throw new Error("Tour not found");
  }

  if (tour.seasonId !== args.seasonId) {
    throw new Error("Tour does not belong to the tour card's season");
  }

  const maxParticipants =
    typeof tour.maxParticipants === "number" && tour.maxParticipants > 0
      ? tour.maxParticipants
      : DEFAULT_MAX_PARTICIPANTS;

  const existing = await ctx.db
    .query("tourCards")
    .withIndex("by_tour_season", (q) =>
      q.eq("tourId", args.tourId).eq("seasonId", args.seasonId),
    )
    .collect();

  const participantCount = existing.filter(
    (tourCard) => tourCard._id !== args.excludeTourCardId,
  ).length;

  if (participantCount >= maxParticipants) {
    throw new Error("Selected tour is full");
  }

  return tour;
}

/** Resolves which member a new tour card should be created for. */
async function resolveCreateMember(
  ctx: MutationCtx,
  requestedMemberId: Doc<"members">["_id"] | undefined,
) {
  const actingMember = await getCurrentMember(ctx);

  if (actingMember.role === "admin") {
    if (!requestedMemberId) {
      return actingMember;
    }

    const requestedMember = await ctx.db.get(requestedMemberId);
    if (!requestedMember) {
      throw new Error("Member not found");
    }

    return requestedMember;
  }

  if (requestedMemberId && requestedMemberId !== actingMember._id) {
    throw new Error("Forbidden: You can only create your own tour card");
  }

  return actingMember;
}

/** Ensures a member has at most one tour card per season. */
async function ensureNoExistingTourCardForSeason(
  ctx: MutationCtx,
  args: {
    memberId: Doc<"members">["_id"];
    seasonId: Doc<"seasons">["_id"];
    excludeTourCardId?: Doc<"tourCards">["_id"];
  },
) {
  const existing = await ctx.db
    .query("tourCards")
    .withIndex("by_member_season", (q) =>
      q.eq("memberId", args.memberId).eq("seasonId", args.seasonId),
    )
    .collect();

  const conflicting = existing.find(
    (tourCard) => tourCard._id !== args.excludeTourCardId,
  );

  if (conflicting) {
    throw new Error("Member already has a tour card for this season");
  }
}

/** Applies an owner-safe or admin-safe tour card update and returns the hydrated result. */
async function applyTourCardUpdate(
  ctx: MutationCtx,
  args: {
    id: Doc<"tourCards">["_id"];
    data: typeof tourCardsValidators.args.updateTourCards.data.type;
  },
) {
  const tourCard = await getTourCardOrThrow(ctx, args.id);
  const actingMember = await requireTourCardAccess(ctx, tourCard);

  if (
    actingMember.role !== "admin" &&
    (args.data.earnings !== undefined ||
      args.data.points !== undefined ||
      args.data.wins !== undefined ||
      args.data.topTen !== undefined ||
      args.data.topFive !== undefined ||
      args.data.madeCut !== undefined ||
      args.data.appearances !== undefined ||
      args.data.playoff !== undefined ||
      args.data.currentPosition !== undefined)
  ) {
    throw new Error("Forbidden: You can only change your own tour selection");
  }

  const patch: Partial<Doc<"tourCards">> = {
    updatedAt: Date.now(),
  };

  if (args.data.displayName !== undefined) {
    patch.displayName = args.data.displayName;
  }

  if (args.data.tourId !== undefined && args.data.tourId !== tourCard.tourId) {
    await validateTargetTourForSeason(ctx, {
      tourId: args.data.tourId,
      seasonId: tourCard.seasonId,
      excludeTourCardId: tourCard._id,
    });
    patch.tourId = args.data.tourId;
  }

  if (actingMember.role === "admin") {
    if (args.data.earnings !== undefined) {
      patch.earnings = args.data.earnings;
    }
    if (args.data.points !== undefined) {
      patch.points = args.data.points;
    }
    if (args.data.wins !== undefined) {
      patch.wins = args.data.wins;
    }
    if (args.data.topTen !== undefined) {
      patch.topTen = args.data.topTen;
    }
    if (args.data.topFive !== undefined) {
      patch.topFive = args.data.topFive;
    }
    if (args.data.madeCut !== undefined) {
      patch.madeCut = args.data.madeCut;
    }
    if (args.data.appearances !== undefined) {
      patch.appearances = args.data.appearances;
    }
    if (args.data.playoff !== undefined) {
      patch.playoff = args.data.playoff;
    }
    if (args.data.currentPosition !== undefined) {
      patch.currentPosition = args.data.currentPosition;
    }
  }

  await ctx.db.patch(tourCard._id, patch);

  return await hydrateTourCard(
    ctx,
    await getTourCardOrThrow(ctx, tourCard._id),
  );
}

// Level 3: public read queries

/** Returns tour cards filtered by the requested id, member, tour, or season options. */
export const getTourCards = query({
  args: tourCardsValidators.args.getTourCards,
  handler: async (ctx, args) => {
    const options = args.options ?? {};
    const signedIn = await isSignedIn(ctx);
    const currentYearSeasonIds = signedIn
      ? []
      : await getCurrentYearSeasonIds(ctx);
    const currentYearSeasonIdSet = new Set(currentYearSeasonIds);

    if (!signedIn && currentYearSeasonIds.length === 0) {
      return [];
    }

    const requestedSeasonId = options.seasonId;
    const effectiveSeasonId = signedIn ? requestedSeasonId : requestedSeasonId;

    if (
      !signedIn &&
      requestedSeasonId !== undefined &&
      !currentYearSeasonIdSet.has(requestedSeasonId)
    ) {
      return [];
    }

    if (options.id) {
      const card = await ctx.db.get(options.id);
      if (!card) {
        return [];
      }

      if (!signedIn && !currentYearSeasonIdSet.has(card.seasonId)) {
        return [];
      }

      return await hydrateTourCards(ctx, [card]);
    }

    let memberId = options.memberId;

    if (!memberId && options.clerkId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", options.clerkId!))
        .first();
      memberId = member?._id;
    }

    if (!memberId && options.clerkId) {
      return [];
    }

    let cards: Doc<"tourCards">[] = [];

    if (memberId && effectiveSeasonId) {
      cards = await ctx.db
        .query("tourCards")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", memberId!).eq("seasonId", effectiveSeasonId),
        )
        .collect();

      if (options.tourId) {
        cards = cards.filter((card) => card.tourId === options.tourId);
      }

      return await hydrateTourCards(ctx, cards);
    }

    if (memberId) {
      cards = await ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", memberId!))
        .collect();

      if (effectiveSeasonId) {
        cards = cards.filter((card) => card.seasonId === effectiveSeasonId);
      } else if (!signedIn) {
        cards = cards.filter((card) =>
          currentYearSeasonIdSet.has(card.seasonId),
        );
      }

      if (options.tourId) {
        cards = cards.filter((card) => card.tourId === options.tourId);
      }

      return await hydrateTourCards(ctx, cards);
    }

    if (options.tourId && effectiveSeasonId) {
      cards = await ctx.db
        .query("tourCards")
        .withIndex("by_tour_season", (q) =>
          q.eq("tourId", options.tourId!).eq("seasonId", effectiveSeasonId),
        )
        .collect();

      return await hydrateTourCards(ctx, cards);
    }

    if (options.tourId) {
      cards = await ctx.db
        .query("tourCards")
        .withIndex("by_tour", (q) => q.eq("tourId", options.tourId!))
        .collect();

      if (effectiveSeasonId) {
        cards = cards.filter((card) => card.seasonId === effectiveSeasonId);
      } else if (!signedIn) {
        cards = cards.filter((card) =>
          currentYearSeasonIdSet.has(card.seasonId),
        );
      }

      return await hydrateTourCards(ctx, cards);
    }

    if (effectiveSeasonId) {
      cards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", effectiveSeasonId))
        .collect();

      return await hydrateTourCards(ctx, cards);
    }

    if (!signedIn) {
      cards = (
        await Promise.all(
          currentYearSeasonIds.map((seasonId) =>
            ctx.db
              .query("tourCards")
              .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
              .collect(),
          ),
        )
      ).flat();

      return await hydrateTourCards(ctx, cards);
    }

    cards = await ctx.db.query("tourCards").collect();

    return await hydrateTourCards(ctx, cards);
  },
});

// Level 4: authenticated write mutations

/** Creates one tour card after resolving ownership, uniqueness, and tour capacity checks. */
export const createTourCards = mutation({
  args: tourCardsValidators.args.createTourCards,
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const member = await resolveCreateMember(ctx, args.data.memberId);
    await ensureNoExistingTourCardForSeason(ctx, {
      memberId: member._id,
      seasonId: args.data.seasonId,
    });
    await validateTargetTourForSeason(ctx, {
      tourId: args.data.tourId,
      seasonId: args.data.seasonId,
    });

    const tourCardId = await ctx.db.insert("tourCards", {
      ...args.data,
      memberId: member._id,
      updatedAt: Date.now(),
    });

    const tourCard = await getTourCardOrThrow(ctx, tourCardId);
    return await hydrateTourCard(ctx, tourCard);
  },
});

/** Updates one tour card and returns the hydrated result. */
export const updateTourCards = mutation({
  args: tourCardsValidators.args.updateTourCards,
  handler: async (ctx, args) => {
    return await applyTourCardUpdate(ctx, {
      id: args.id,
      data: args.data,
    });
  },
});

/** Switches one tour card to another tour within the same season. */
export const switchTourCards = mutation({
  args: tourCardsValidators.args.switchTourCards,
  handler: async (ctx, args) => {
    return await applyTourCardUpdate(ctx, {
      id: args.id,
      data: {
        tourId: args.tourId,
      },
    });
  },
});

/** Deletes one tour card and any linked team rows. */
export const deleteTourCards = mutation({
  args: tourCardsValidators.args.deleteTourCards,
  handler: async (ctx, args) => {
    const tourCard = await getTourCardOrThrow(ctx, args.id);
    await requireTourCardAccess(ctx, tourCard);

    const hydratedTourCard = await hydrateTourCard(ctx, tourCard);

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
      .collect();

    for (const team of teams) {
      await ctx.db.delete(team._id);
    }

    await ctx.db.delete(tourCard._id);

    return hydratedTourCard;
  },
});

/** Deletes one tour card and removes its season fee when no other season card remains. */
export const deleteTourCardAndFee = mutation({
  args: tourCardsValidators.args.deleteTourCardAndFee,
  handler: async (ctx, args) => {
    const tourCard = await getTourCardOrThrow(ctx, args.id);
    await requireTourCardAccess(ctx, tourCard);

    const hydratedTourCard = await hydrateTourCard(ctx, tourCard);

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

    return hydratedTourCard;
  },
});
