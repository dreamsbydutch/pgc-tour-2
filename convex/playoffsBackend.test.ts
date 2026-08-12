/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("playoff roster enforcement", () => {
  it("uses overall standings, persists starting strokes, locks later legs, and removes accidental teams", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const fixture = await t.run(async (ctx) => {
      const seasonId = await ctx.db.insert("seasons", {
        year: new Date().getFullYear(),
        number: 1,
      });
      const tourId = await ctx.db.insert("tours", {
        name: "Playoff Tour",
        shortForm: "PO",
        logoUrl: "https://example.com/tour.png",
        seasonId,
        buyIn: 10_000,
        playoffSpots: [2, 1],
      });
      const tierId = await ctx.db.insert("tiers", {
        name: "Playoff",
        seasonId,
        payouts: [],
        points: [],
      });
      const courseId = await ctx.db.insert("courses", {
        apiId: "playoff-course",
        name: "Playoff Course",
        location: "Test",
        par: 72,
        front: 36,
        back: 36,
        timeZoneOffset: 0,
      });
      const tournamentIds = [];
      for (const [index, name] of [
        "FedEx St. Jude Championship",
        "BMW Championship",
        "TOUR Championship",
      ].entries()) {
        tournamentIds.push(
          await ctx.db.insert("tournaments", {
            name,
            startDate: now + (index + 1) * 86_400_000,
            endDate: now + (index + 2) * 86_400_000,
            tierId,
            courseId,
            seasonId,
            status: "upcoming",
          }),
        );
      }
      const cards = [];
      for (const [index, points] of [100, 50, 25, 0].entries()) {
        const clerkId = `playoff-member-${index}`;
        const memberId = await ctx.db.insert("members", {
          clerkId,
          email: `${clerkId}@example.com`,
          role: "regular",
          account: 0,
          friends: [],
        });
        const cardId = await ctx.db.insert("tourCards", {
          displayName: `Player ${index}`,
          memberId,
          seasonId,
          tourId,
          earnings: 0,
          points,
          topTen: 0,
          madeCut: 0,
          appearances: 0,
          // Deliberately stale: the backend must derive eligibility from points.
          playoff: index === 3 ? 1 : 0,
        });
        cards.push({ cardId, memberId, clerkId });
      }
      const golferApiIds = [];
      for (let index = 0; index < 10; index += 1) {
        const apiId = index + 1;
        golferApiIds.push(apiId);
        const golferId = await ctx.db.insert("golfers", {
          apiId,
          playerName: `Golfer ${apiId}`,
        });
        await ctx.db.insert("tournamentGolfers", {
          golferId,
          tournamentId: tournamentIds[0],
          golferApiId: apiId,
          group: Math.floor(index / 2) + 1,
        });
      }
      return { seasonId, tourId, tournamentIds, cards, golferApiIds };
    });

    const leader = t.withIdentity({ subject: fixture.cards[0].clerkId });
    const leaderTeam = await leader.mutation(
      api.functions.teams.saveMyTournamentTeam,
      {
        tournamentId: fixture.tournamentIds[0],
        tourCardId: fixture.cards[0].cardId,
        golferIds: fixture.golferApiIds,
      },
    );
    expect(leaderTeam).toMatchObject({
      playoff: 1,
      playoffCarryoverScore: -10,
      score: -10,
    });

    const outside = t.withIdentity({ subject: fixture.cards[3].clerkId });
    await expect(
      outside.mutation(api.functions.teams.saveMyTournamentTeam, {
        tournamentId: fixture.tournamentIds[0],
        tourCardId: fixture.cards[3].cardId,
        golferIds: fixture.golferApiIds,
      }),
    ).rejects.toThrow("not eligible");

    await expect(
      leader.mutation(api.functions.teams.saveMyTournamentTeam, {
        tournamentId: fixture.tournamentIds[1],
        tourCardId: fixture.cards[0].cardId,
        golferIds: fixture.golferApiIds,
      }),
    ).rejects.toThrow("carry over");

    const accidentalTeamId = await t.run((ctx) =>
      ctx.db.insert("teams", {
        tournamentId: fixture.tournamentIds[0],
        tourCardId: fixture.cards[3].cardId,
        golferIds: fixture.golferApiIds,
        seasonId: fixture.seasonId,
        tourId: fixture.tourId,
        memberId: fixture.cards[3].memberId,
        playoff: 1,
      }),
    );
    const result = await t.mutation(
      internal.functions.teams.reconcilePlayoffTeamsForSeason,
      { seasonId: fixture.seasonId },
    );
    expect(result.removed).toBe(1);
    const state = await t.run(async (ctx) => ({
      accidental: await ctx.db.get(accidentalTeamId),
      leaderCard: await ctx.db.get(fixture.cards[0].cardId),
      outsideCard: await ctx.db.get(fixture.cards[3].cardId),
      audits: await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "team").eq("entityId", String(accidentalTeamId)),
        )
        .collect(),
    }));
    expect(state.accidental).toBeNull();
    expect(state.leaderCard?.playoff).toBe(1);
    expect(state.outsideCard?.playoff).toBe(0);
    expect(state.audits[0]?.changes).toMatchObject({
      reason: "tour_card_not_qualified_for_playoffs",
    });

    await t.run((ctx) => ctx.db.patch(leaderTeam!._id, { score: -15 }));
    const copied = await t.mutation(
      internal.functions.tournaments.duplicateFromPreviousPlayoff,
      {
        currentTournamentId: fixture.tournamentIds[1],
        previousPlayoffTournamentId: fixture.tournamentIds[0],
      },
    );
    expect(copied).toMatchObject({ teamsCopied: 1, teamsRemoved: 0 });
    const bmwTeam = await t.run((ctx) =>
      ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", fixture.tournamentIds[1])
            .eq("tourCardId", fixture.cards[0].cardId),
        )
        .unique(),
    );
    expect(bmwTeam).toMatchObject({
      golferIds: fixture.golferApiIds,
      playoff: 1,
      playoffCarryoverScore: -15,
      score: -15,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(leaderTeam!._id, { score: -17 });
      await ctx.db.patch(bmwTeam!._id, {
        score: -13,
        playoffCarryoverScore: -15,
        roundOne: 74,
      });
    });
    const recopied = await t.mutation(
      internal.functions.tournaments.duplicateFromPreviousPlayoff,
      {
        currentTournamentId: fixture.tournamentIds[1],
        previousPlayoffTournamentId: fixture.tournamentIds[0],
      },
    );
    expect(recopied.teamsUpdated).toBe(1);
    const repairedBmwTeam = await t.run((ctx) => ctx.db.get(bmwTeam!._id));
    expect(repairedBmwTeam).toMatchObject({
      playoffCarryoverScore: -17,
      // The current leg remains +2 while the prior score changes by -2.
      score: -15,
      roundOne: 74,
    });
  }, 20_000);
});
