import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

type CurrentSeasonResult = { ok: true; season: Doc<"seasons"> } | { ok: false };

type TourCardStandingsTotals = {
  tourCardId: Id<"tourCards">;
  tourId: Id<"tours">;
  points: number;
  earnings: number;
  wins: number;
  topTen: number;
  topFive: number;
  madeCut: number;
  appearances: number;
};

function parsePositionNumber(position?: string | null): number | null {
  if (!position) {
    return null;
  }

  const stripped = position.trim().replace(/^T/i, "");
  const parsed = Number.parseInt(stripped, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function createEmptyTotals(
  tourCard: Doc<"tourCards">,
): TourCardStandingsTotals {
  return {
    tourCardId: tourCard._id,
    tourId: tourCard.tourId,
    points: 0,
    earnings: 0,
    wins: 0,
    topTen: 0,
    topFive: 0,
    madeCut: 0,
    appearances: 0,
  };
}

function resolvePlayoffBucket(
  betterPointsCount: number,
  playoffSpots: number[],
): number {
  const firstRoundSpots = playoffSpots[0] ?? 0;
  const secondRoundSpots = playoffSpots[1] ?? 0;

  if (betterPointsCount < firstRoundSpots) {
    return 1;
  }

  if (betterPointsCount < firstRoundSpots + secondRoundSpots) {
    return 2;
  }

  return 0;
}

function buildPosition(rank: number, tiedCount: number): string {
  return `${tiedCount > 1 ? "T" : ""}${rank}`;
}

export const getCurrentSeasonForStandings = internalQuery({
  handler: async (ctx): Promise<CurrentSeasonResult> => {
    const currentYear = new Date().getFullYear();
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();

    if (!season) {
      return { ok: false };
    }

    return {
      ok: true,
      season,
    };
  },
});

export const recomputeSeasonStandings = internalMutation({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    const [completedTournaments, tourCards, tours] = await Promise.all([
      ctx.db
        .query("tournaments")
        .withIndex("by_season_status", (q) =>
          q.eq("seasonId", args.seasonId).eq("status", "completed"),
        )
        .collect(),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
    ]);

    if (tourCards.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_tour_cards",
        seasonId: args.seasonId,
      } as const;
    }

    const completedTeamsByTournament = await Promise.all(
      completedTournaments.map((tournament) =>
        ctx.db
          .query("teams")
          .withIndex("by_tournament", (q) =>
            q.eq("tournamentId", tournament._id),
          )
          .collect(),
      ),
    );

    const standingsByTourCard = new Map<
      Id<"tourCards">,
      TourCardStandingsTotals
    >(tourCards.map((tourCard) => [tourCard._id, createEmptyTotals(tourCard)]));

    for (const teams of completedTeamsByTournament) {
      for (const team of teams) {
        const totals = standingsByTourCard.get(team.tourCardId);

        if (!totals) {
          continue;
        }

        const positionNumber = parsePositionNumber(team.position ?? null);
        const points = Math.round(team.points ?? 0);
        const earnings = Math.round(team.earnings ?? 0);
        const madeCut =
          team.makeCut !== undefined
            ? Number(team.makeCut > 0)
            : Number(team.position !== "CUT");

        totals.points += points;
        totals.earnings += earnings;
        totals.appearances += 1;
        totals.madeCut += madeCut;

        if (positionNumber === 1) {
          totals.wins += 1;
        }

        if (positionNumber !== null && positionNumber <= 10) {
          totals.topTen += 1;
        }

        if (positionNumber !== null && positionNumber <= 5) {
          totals.topFive += 1;
        }
      }
    }

    const tourById = new Map(tours.map((tour) => [tour._id, tour] as const));
    const tourCardsByTour = new Map<Id<"tours">, Doc<"tourCards">[]>();

    for (const tourCard of tourCards) {
      const existing = tourCardsByTour.get(tourCard.tourId) ?? [];
      existing.push(tourCard);
      tourCardsByTour.set(tourCard.tourId, existing);
    }

    const now = Date.now();
    let updated = 0;
    let unchanged = 0;

    for (const [tourId, cards] of tourCardsByTour) {
      const tour = tourById.get(tourId);

      if (!tour) {
        continue;
      }

      const rankedCards = cards
        .map((tourCard) => ({
          tourCard,
          totals:
            standingsByTourCard.get(tourCard._id) ??
            createEmptyTotals(tourCard),
        }))
        .sort((left, right) => {
          if (right.totals.points !== left.totals.points) {
            return right.totals.points - left.totals.points;
          }

          if (right.totals.earnings !== left.totals.earnings) {
            return right.totals.earnings - left.totals.earnings;
          }

          return left.tourCard.displayName.localeCompare(
            right.tourCard.displayName,
          );
        });

      for (let index = 0; index < rankedCards.length; ) {
        let groupEnd = index + 1;

        while (
          groupEnd < rankedCards.length &&
          rankedCards[groupEnd]?.totals.points ===
            rankedCards[index]?.totals.points
        ) {
          groupEnd += 1;
        }

        const rank = index + 1;
        const tiedCount = groupEnd - index;
        const position = buildPosition(rank, tiedCount);
        const playoff = resolvePlayoffBucket(index, tour.playoffSpots);

        for (let groupIndex = index; groupIndex < groupEnd; groupIndex += 1) {
          const rankedCard = rankedCards[groupIndex];

          if (!rankedCard) {
            continue;
          }

          const nextValues = {
            points: rankedCard.totals.points,
            earnings: rankedCard.totals.earnings,
            wins: rankedCard.totals.wins,
            topTen: rankedCard.totals.topTen,
            topFive: rankedCard.totals.topFive,
            madeCut: rankedCard.totals.madeCut,
            appearances: rankedCard.totals.appearances,
            currentPosition: position,
            playoff,
          };

          const hasChanged =
            rankedCard.tourCard.points !== nextValues.points ||
            rankedCard.tourCard.earnings !== nextValues.earnings ||
            rankedCard.tourCard.wins !== nextValues.wins ||
            rankedCard.tourCard.topTen !== nextValues.topTen ||
            rankedCard.tourCard.topFive !== nextValues.topFive ||
            rankedCard.tourCard.madeCut !== nextValues.madeCut ||
            rankedCard.tourCard.appearances !== nextValues.appearances ||
            rankedCard.tourCard.currentPosition !==
              nextValues.currentPosition ||
            rankedCard.tourCard.playoff !== nextValues.playoff;

          if (!hasChanged) {
            unchanged += 1;
            continue;
          }

          await ctx.db.patch(rankedCard.tourCard._id, {
            ...nextValues,
            updatedAt: now,
          });
          updated += 1;
        }

        index = groupEnd;
      }
    }

    return {
      ok: true,
      skipped: false,
      seasonId: args.seasonId,
      completedTournamentCount: completedTournaments.length,
      tourCardsEvaluated: tourCards.length,
      tourCardsUpdated: updated,
      tourCardsUnchanged: unchanged,
    } as const;
  },
});

export const recomputeStandings: ReturnType<typeof internalMutation> =
  internalMutation({
    handler: async (ctx) => {
      const currentSeason = await ctx.runQuery(
        internal.crons.standings.getCurrentSeasonForStandings,
      );

      if (!currentSeason.ok) {
        return {
          ok: true,
          skipped: true,
          reason: "no_current_season",
        } as const;
      }

      return await ctx.runMutation(
        internal.crons.standings.recomputeSeasonStandings,
        {
          seasonId: currentSeason.season._id,
        },
      );
    },
  });
