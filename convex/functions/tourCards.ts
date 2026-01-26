/**
 * Tour Cards Management - Comprehensive CRUD Functions
 *
 * Functions for managing tour card registrations.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireOwnResource, getCurrentMember } from "../auth";
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

export const getActiveMembersMissingTourCards = query({
  args: {
    seasonId: v.id("seasons"),
    previousSeasonId: v.optional(v.id("seasons")),
  },
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

    const duplicateNameGroups = (() => {
      function normalizeNamePart(value: string | null | undefined) {
        return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
      }

      const groups = new Map<
        string,
        {
          firstname: string;
          lastname: string;
          members: Array<{
            memberId: Id<"members">;
            email: string;
            firstname: string | null;
            lastname: string | null;
            lastLoginAt: number | null;
            currentSeasonTourCardsCount: number;
            previousSeasonTourCardsCount: number;
            isMissingThisSeason: boolean;
          }>;
        }
      >();

      for (const m of activeMembers) {
        const first = normalizeNamePart(m.firstname);
        const last = normalizeNamePart(m.lastname);
        if (!first || !last) continue;

        const key = `${first}|${last}`;

        const currentSeasonTourCardsCount =
          currentCountsByMember.get(m._id) ?? 0;
        const previousSeasonTourCardsCount =
          previousCountsByMember.get(m._id) ?? 0;

        const group =
          groups.get(key) ??
          ({
            firstname: (m.firstname ?? "").trim(),
            lastname: (m.lastname ?? "").trim(),
            members: [],
          } satisfies {
            firstname: string;
            lastname: string;
            members: Array<{
              memberId: Id<"members">;
              email: string;
              firstname: string | null;
              lastname: string | null;
              lastLoginAt: number | null;
              currentSeasonTourCardsCount: number;
              previousSeasonTourCardsCount: number;
              isMissingThisSeason: boolean;
            }>;
          });

        group.members.push({
          memberId: m._id,
          email: m.email,
          firstname: m.firstname ?? null,
          lastname: m.lastname ?? null,
          lastLoginAt: m.lastLoginAt ?? null,
          currentSeasonTourCardsCount,
          previousSeasonTourCardsCount,
          isMissingThisSeason: currentSeasonTourCardsCount === 0,
        });

        groups.set(key, group);
      }

      return [...groups.values()]
        .filter(
          (g) =>
            g.members.length >= 2 &&
            g.members.some((m) => m.isMissingThisSeason),
        )
        .map((g) => ({
          firstname: g.firstname,
          lastname: g.lastname,
          members: [...g.members].sort((a, b) => a.email.localeCompare(b.email)),
        }))
        .sort((a, b) => {
          const aName = `${a.lastname} ${a.firstname}`.trim();
          const bName = `${b.lastname} ${b.firstname}`.trim();
          if (aName !== bName) return aName.localeCompare(bName);
          return b.members.length - a.members.length;
        });
    })();

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
      duplicateNameGroups,
    };
  },
});

export const getCurrentYearTourCard = query({
  args: {
    options: v.object({
      clerkId: v.string(),
      year: v.number(),
    }),
  },
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

/**
 * getReservedTourSpotsForSeason
 *
 * Returns a per-tour count of reserved spots for a given season.
 *
 * A reserved spot is counted for each member who has paid the Tour Card Fee for the given season
 * but does not yet have a tour card in that season; that reservation is assigned to the member's
 * tour from the previous calendar year.
 */
export const getReservedTourSpotsForSeason = query({
  args: {
    options: v.object({
      seasonId: v.id("seasons"),
    }),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.options.seasonId);
    if (!season) {
      throw new Error("Season not found");
    }

    const previousYear = season.year - 1;

    const previousSeasons = (await ctx.db.query("seasons").collect()).filter(
      (s) => s.year === previousYear,
    );

    const reservedByTourId: Record<string, number> = {};

    if (previousSeasons.length === 0) {
      return { reservedByTourId };
    }

    const previousSeason = previousSeasons.reduce((best, candidate) => {
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
    }, previousSeasons[0]);

    const currentSeasonTours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const currentTourIdByShortForm = new Map<string, Id<"tours">>();
    const currentTourIdByName = new Map<string, Id<"tours">>();
    for (const tour of currentSeasonTours) {
      currentTourIdByShortForm.set(tour.shortForm, tour._id);
      currentTourIdByName.set(tour.name, tour._id);
    }

    const previousSeasonTours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", previousSeason._id))
      .collect();

    const previousTourMetaById = new Map<
      Id<"tours">,
      { shortForm: string; name: string }
    >();
    for (const tour of previousSeasonTours) {
      previousTourMetaById.set(tour._id, {
        shortForm: tour.shortForm,
        name: tour.name,
      });
    }

    const currentSeasonTourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const membersWithCurrentTourCard = new Set(
      currentSeasonTourCards.map((card) => card.memberId),
    );

    const previousSeasonTourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", previousSeason._id))
      .collect();

    const previousTourByMemberId = new Map<Id<"members">, Id<"tours">>();
    for (const card of previousSeasonTourCards) {
      if (!previousTourByMemberId.has(card.memberId)) {
        previousTourByMemberId.set(card.memberId, card.tourId);
      }
    }

    const seasonTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const prepaidMemberIds = new Set<Id<"members">>();
    for (const tx of seasonTransactions) {
      if (tx.transactionType !== "TourCardFee") continue;
      if (!isCompletedTourCardFee(tx)) continue;
      if (!tx.memberId) continue;
      prepaidMemberIds.add(tx.memberId);
    }

    for (const memberId of prepaidMemberIds) {
      if (membersWithCurrentTourCard.has(memberId)) continue;

      const previousTourId = previousTourByMemberId.get(memberId);
      if (!previousTourId) continue;

      const previousTourMeta = previousTourMetaById.get(previousTourId);
      if (!previousTourMeta) continue;

      const mappedCurrentTourId =
        currentTourIdByShortForm.get(previousTourMeta.shortForm) ??
        currentTourIdByName.get(previousTourMeta.name);
      if (!mappedCurrentTourId) continue;

      reservedByTourId[mappedCurrentTourId] =
        (reservedByTourId[mappedCurrentTourId] ?? 0) + 1;
    }

    return { reservedByTourId };
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

export const recomputeTourCardsForSeasonAsAdmin = mutation({
  args: {
    seasonId: v.id("seasons"),
  },
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

export const deleteTourCardAndFee = mutation({
  args: {
    id: v.id("tourCards"),
  },
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
