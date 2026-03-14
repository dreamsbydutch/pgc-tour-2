import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { parsePositionNumber } from "../utils";

export const recomputeStandings: ReturnType<typeof internalMutation> =
  internalMutation({
    handler: async (ctx) => {
      const currentSeason:
        | { ok: true; season: Doc<"seasons"> }
        | { ok: false } = await ctx.runQuery(
        internal.functions.utils.getCurrentSeason,
      );

      if (!currentSeason.ok) {
        return {
          ok: true,
          skipped: true,
          reason: "no_current_season",
        } as const;
      }
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) =>
          q.eq("seasonId", currentSeason.season._id),
        )
        .collect();
      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) =>
          q.eq("seasonId", currentSeason.season._id as Id<"seasons">),
        )
        .collect();
      if (tourCards.length === 0) {
        return {
          ok: true,
          skipped: true,
          reason: "no_tour_cards",
          seasonId: currentSeason.season._id,
        } as const;
      }
      const calculations = await Promise.all(
        tourCards.map(async (tc) => {
          const teams = await ctx.db
            .query("teams")
            .withIndex("by_tour_card", (q) => q.eq("tourCardId", tc._id))
            .collect();

          const completed = teams.filter(
            (t) =>
              tournaments.find((tr) => tr._id === t.tournamentId)?.status ===
              "completed",
          );
          const points = completed.reduce(
            (sum, t) => sum + Math.round(t.points ?? 0),
            0,
          );
          const earnings = completed.reduce(
            (sum, t) => sum + (t.earnings ?? 0),
            0,
          );

          return {
            tourCardId: tc._id,
            tourId: tc.tourId,
            win: completed.filter((t) => {
              const posNum = parsePositionNumber(t.position ?? null);
              return posNum !== null && posNum === 1;
            }).length,
            topTen: completed.filter((t) => {
              const posNum = parsePositionNumber(t.position ?? null);
              return posNum !== null && posNum <= 10;
            }).length,
            madeCut: completed.filter((t) => t.position !== "CUT").length,
            appearances: completed.length,
            points: Math.round(points),
            earnings: Math.round(earnings),
            pastPoints: Math.round(
              points - (completed[completed.length - 1]?.points ?? 0),
            ),
            pastEarnings: Math.round(
              earnings - (completed[completed.length - 1]?.earnings ?? 0),
            ),
            totalPoints: Math.round(
              teams.reduce((sum, t) => sum + (t.points ?? 0), 0),
            ),
            totalEarnings: Math.round(
              teams.reduce((sum, t) => sum + Math.round(t.earnings ?? 0), 0),
            ),
          };
        }),
      );

      const byTour = new Map<Id<"tours">, typeof calculations>();
      for (const calc of calculations) {
        const list = byTour.get(calc.tourId) ?? [];
        list.push(calc);
        byTour.set(calc.tourId, list);
      }

      let updated = 0;

      for (const list of byTour.values()) {
        const tour = await ctx.db.get(list[0].tourId);
        if (!tour) continue;
        for (const calc of list) {
          const samePointsCount = list.filter(
            (a) => a.points === calc.points,
          ).length;
          const betterPointsCount = list.filter(
            (a) => a.points > calc.points,
          ).length;
          const position = `${samePointsCount > 1 ? "T" : ""}${betterPointsCount + 1}`;

          const playoff =
            betterPointsCount < tour.playoffSpots[0]
              ? 1
              : betterPointsCount < tour.playoffSpots[1] + tour.playoffSpots[0]
                ? 2
                : 0;

          await ctx.db.patch(calc.tourCardId, {
            points: calc.points,
            earnings: calc.earnings,
            wins: calc.win,
            topTen: calc.topTen,
            madeCut: calc.madeCut,
            appearances: calc.appearances,
            currentPosition: position,
            playoff,
            updatedAt: Date.now(),
          });

          updated += 1;
        }
      }

      return {
        ok: true,
        skipped: false,
        seasonId: currentSeason.season._id,
        tourCardsUpdated: updated,
      } as const;
    },
  });