/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { buildTourCardStandingsTotals } from "./utils/standings";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  return convexTest(schema, modules);
}

async function seedStandingsFixture(t: ReturnType<typeof createTestBackend>) {
  return await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { year: 2026, number: 1 });
    const memberId = await ctx.db.insert("members", {
      email: "standing@example.com",
      role: "regular",
      account: 0,
      friends: [],
      isActive: true,
    });
    const tourId = await ctx.db.insert("tours", {
      name: "Parity Tour",
      shortForm: "PTY",
      logoUrl: "https://example.com/tour.png",
      seasonId,
      buyIn: 10_000,
      playoffSpots: [1, 1],
    });
    const regularTierId = await ctx.db.insert("tiers", {
      name: "Standard",
      seasonId,
      payouts: [],
      points: [],
    });
    const playoffTierId = await ctx.db.insert("tiers", {
      name: "Playoff",
      seasonId,
      payouts: [],
      points: [],
    });
    const courseId = await ctx.db.insert("courses", {
      apiId: "parity-course",
      name: "Parity Course",
      location: "Test",
      par: 72,
      front: 36,
      back: 36,
      timeZoneOffset: 0,
    });
    const now = Date.now();
    const tournamentIds = [];
    for (const [index, fixture] of [
      { name: "Regular One", tierId: regularTierId },
      { name: "Regular Two", tierId: regularTierId },
      { name: "Gold Playoff", tierId: playoffTierId },
    ].entries()) {
      tournamentIds.push(
        await ctx.db.insert("tournaments", {
          name: fixture.name,
          startDate: now - (10 - index) * 86_400_000,
          endDate: now - (9 - index) * 86_400_000,
          tierId: fixture.tierId,
          courseId,
          seasonId,
          status: "completed",
        }),
      );
    }
    const tourCardId = await ctx.db.insert("tourCards", {
      displayName: "Parity Player",
      memberId,
      seasonId,
      tourId,
      earnings: 0,
      points: 0,
      topTen: 0,
      madeCut: 0,
      appearances: 0,
    });
    const teamIds = [];
    for (const tournamentId of tournamentIds) {
      teamIds.push(
        await ctx.db.insert("teams", {
          tournamentId,
          tourCardId,
          golferIds: [1, 2, 3, 4, 5, 6],
          seasonId,
          tourId,
          memberId,
        }),
      );
    }
    return {
      seasonId,
      tourId,
      regularTierId,
      playoffTierId,
      tournamentIds,
      tourCardId,
      teamIds,
    };
  });
}

describe("standings read model", () => {
  it("keeps the materialized aggregate in parity with the canonical formula", async () => {
    const t = createTestBackend();
    const fixture = await seedStandingsFixture(t);
    await t.mutation(internal.functions.teams.applyTeamUpdatesBatch, {
      updates: [
        {
          _id: fixture.teamIds[0],
          points: 100,
          earnings: 20_000,
          position: "1",
        },
        {
          _id: fixture.teamIds[1],
          points: 30,
          earnings: 5_000,
          position: "CUT",
        },
        {
          _id: fixture.teamIds[2],
          points: 500,
          earnings: 80_000,
          position: "1",
        },
      ],
    });

    const snapshot = await t.run(async (ctx) => ({
      contributions: await ctx.db
        .query("standingsContributions")
        .withIndex("by_tour_card_season", (q) =>
          q
            .eq("tourCardId", fixture.tourCardId)
            .eq("seasonId", fixture.seasonId),
        )
        .collect(),
      row: await ctx.db
        .query("standingsRows")
        .withIndex("by_card_season_variant", (q) =>
          q
            .eq("tourCardId", fixture.tourCardId)
            .eq("seasonId", fixture.seasonId)
            .eq("variant", "regular"),
        )
        .unique(),
      teams: await Promise.all(fixture.teamIds.map((id) => ctx.db.get(id))),
      tournaments: await Promise.all(
        fixture.tournamentIds.map((id) => ctx.db.get(id)),
      ),
      tiers: await Promise.all(
        [fixture.regularTierId, fixture.playoffTierId].map((id) =>
          ctx.db.get(id),
        ),
      ),
    }));
    const expected = buildTourCardStandingsTotals({
      teams: snapshot.teams.filter((item) => item !== null),
      tournaments: snapshot.tournaments.filter((item) => item !== null),
      tiers: snapshot.tiers.filter((item) => item !== null),
    });

    expect(snapshot.contributions).toHaveLength(3);
    expect(snapshot.row).toMatchObject({
      points: expected.points,
      earnings: expected.earnings,
      wins: expected.wins,
      topFive: expected.topFive,
      topTen: expected.topTen,
      madeCut: expected.madeCut,
      appearances: expected.appearances,
      pastPoints: 100,
    });
  });

  it("returns only lean standings rows and bounded lean history", async () => {
    const t = createTestBackend();
    const fixture = await seedStandingsFixture(t);
    await t.mutation(internal.functions.teams.applyTeamUpdatesBatch, {
      updates: fixture.teamIds.map((_id, index) => ({
        _id,
        points: 100 - index,
        position: String(index + 1),
      })),
    });
    await t.run(async (ctx) => {
      const card = await ctx.db.get(fixture.tourCardId);
      if (!card) throw new Error("Expected tour card");
      const tournament = await ctx.db.get(fixture.tournamentIds[0]);
      if (!tournament) throw new Error("Expected tournament");
      for (let index = 0; index < 55; index += 1) {
        const tournamentId = await ctx.db.insert("tournaments", {
          name: `History ${index}`,
          startDate: Date.now() - (100 + index) * 86_400_000,
          endDate: Date.now() - (99 + index) * 86_400_000,
          tierId: fixture.regularTierId,
          courseId: tournament.courseId,
          seasonId: fixture.seasonId,
          status: "completed",
        });
        await ctx.db.insert("standingsContributions", {
          seasonId: fixture.seasonId,
          tourId: fixture.tourId,
          tourCardId: fixture.tourCardId,
          tournamentId,
          memberId: card.memberId,
          displayName: card.displayName,
          tournamentName: `History ${index}`,
          tournamentStartDate: Date.now() - (100 + index) * 86_400_000,
          tournamentEndDate: Date.now() - (99 + index) * 86_400_000,
          tournamentStatus: "completed",
          tierId: fixture.regularTierId,
          tierName: "Standard",
          isPlayoff: false,
          points: 1,
          position: "20",
          updatedAt: Date.now(),
        });
      }
      await ctx.db.insert("tournaments", {
        name: "Did Not Play",
        startDate: Date.now() - 2 * 86_400_000,
        endDate: Date.now() - 86_400_000,
        tierId: fixture.regularTierId,
        courseId: tournament.courseId,
        seasonId: fixture.seasonId,
        status: "completed",
      });
    });

    const index = await t.query(api.functions.seasons.getStandingsIndex, {
      seasonId: fixture.seasonId,
    });
    const history = await t.query(
      api.functions.seasons.getTourCardTournamentHistory,
      { tourCardId: fixture.tourCardId, limit: 100 },
    );

    expect(index.standingsRows).toHaveLength(1);
    expect(index.standingsRows[0]).not.toHaveProperty("clerkId");
    expect(index.standingsRows[0]).not.toHaveProperty("golferIds");
    expect(history.page).toHaveLength(50);
    expect(history.page[0]).not.toHaveProperty("golferIds");
    expect(history.page[0]).not.toHaveProperty("memberId");
    expect(history.page[0].tournament).not.toHaveProperty("courseId");
    expect(
      history.tournaments.some((item) => item.name === "Did Not Play"),
    ).toBe(true);
    expect(
      history.page.some((item) => item.tournament.name === "Did Not Play"),
    ).toBe(false);
    expect(
      history.tournaments.some((item) => item.name === "Gold Playoff"),
    ).toBe(false);
  });

  it("keeps a representative 500-row response below 250 KiB", async () => {
    const t = createTestBackend();
    const fixture = await seedStandingsFixture(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 500; index += 1) {
        const memberId = await ctx.db.insert("members", {
          email: `member-${index}@example.com`,
          role: "regular",
          account: 0,
          friends: [],
          isActive: true,
        });
        const cardId = await ctx.db.insert("tourCards", {
          displayName: `Representative Player ${index}`,
          memberId,
          seasonId: fixture.seasonId,
          tourId: fixture.tourId,
          earnings: index * 100,
          points: index,
          topTen: 0,
          madeCut: 0,
          appearances: 0,
        });
        await ctx.db.insert("standingsRows", {
          seasonId: fixture.seasonId,
          tourId: fixture.tourId,
          tourCardId: cardId,
          memberId,
          displayName: `Representative Player ${index}`,
          variant: "regular",
          points: index,
          earnings: index * 100,
          wins: 0,
          topFive: 0,
          topTen: 0,
          madeCut: 0,
          appearances: 0,
          pastPoints: Math.max(0, index - 10),
          rank: 500 - index,
          currentPosition: String(500 - index),
          playoff: 0,
          posChange: 0,
          posChangePO: 0,
          updatedAt: Date.now(),
        });
      }
    });
    const response = await t.query(api.functions.seasons.getStandingsIndex, {
      seasonId: fixture.seasonId,
    });
    const bytes = new TextEncoder().encode(JSON.stringify(response)).length;
    expect(bytes).toBeLessThanOrEqual(250 * 1024);
  });
});
