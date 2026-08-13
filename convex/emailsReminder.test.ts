/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function seedReminderFixture(playoff: boolean) {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { year: 2026, number: 1 });
    const tourId = await ctx.db.insert("tours", {
      name: "PGC Tour",
      shortForm: "PGC",
      logoUrl: "https://example.com/tour.png",
      seasonId,
      buyIn: 10_000,
      playoffSpots: [1, 1],
    });
    const tierId = await ctx.db.insert("tiers", {
      name: playoff ? "Playoff" : "Standard",
      seasonId,
      payouts: [],
      points: [],
    });
    const courseId = await ctx.db.insert("courses", {
      apiId: "reminder-course",
      name: "Reminder Course",
      location: "Test",
      par: 72,
      front: 36,
      back: 36,
      timeZoneOffset: 0,
    });
    const firstTournamentId = await ctx.db.insert("tournaments", {
      name: playoff ? "First Playoff" : "Regular Event",
      startDate: Date.now() + 86_400_000,
      endDate: Date.now() + 2 * 86_400_000,
      tierId,
      courseId,
      seasonId,
      status: "upcoming",
    });
    const secondTournamentId = playoff
      ? await ctx.db.insert("tournaments", {
          name: "Second Playoff",
          startDate: Date.now() + 8 * 86_400_000,
          endDate: Date.now() + 9 * 86_400_000,
          tierId,
          courseId,
          seasonId,
          status: "upcoming",
        })
      : undefined;

    const cards = [];
    for (const [index, points] of [100, 50, 0].entries()) {
      const memberId = await ctx.db.insert("members", {
        email: `player-${index}@example.com`,
        firstname: `Player ${index}`,
        isActive: true,
        role: "regular",
        account: 0,
        friends: [],
      });
      const cardId = await ctx.db.insert("tourCards", {
        displayName: `Player ${index}`,
        tourId,
        seasonId,
        memberId,
        earnings: 0,
        points,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
        playoff: index === 2 ? 1 : 0,
      });
      cards.push({ memberId, cardId });
    }
    const inactiveMemberId = await ctx.db.insert("members", {
      email: "inactive@example.com",
      isActive: false,
      role: "regular",
      account: 0,
      friends: [],
    });
    await ctx.db.insert("tourCards", {
      displayName: "Inactive",
      tourId,
      seasonId,
      memberId: inactiveMemberId,
      earnings: 0,
      points: -10,
      topTen: 0,
      madeCut: 0,
      appearances: 0,
    });
    await ctx.db.insert("members", {
      email: "no-card@example.com",
      isActive: true,
      role: "regular",
      account: 0,
      friends: [],
    });
    return { firstTournamentId, secondTournamentId, cards };
  });
  return { t, fixture };
}

describe("missing-team reminder recipients", () => {
  it("targets active regular-season card holders without a team", async () => {
    const { t, fixture } = await seedReminderFixture(false);
    await t.run((ctx) =>
      ctx.db.insert("teams", {
        tournamentId: fixture.firstTournamentId,
        tourCardId: fixture.cards[0]!.cardId,
        golferIds: [],
      }),
    );

    const result = await t.query(
      internal.functions.emails
        .getMissingTeamReminderRecipientsForUpcomingTournament,
      { tournamentId: fixture.firstTournamentId },
    );

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("Expected reminder context");
    expect(result.recipients.map((recipient) => recipient.email)).toEqual([
      "player-1@example.com",
      "player-2@example.com",
    ]);
    expect(result.eligibleTourCardCount).toBe(4);
    expect(result.missingTourCardCount).toBe(3);
  });

  it("derives first-playoff eligibility from points and excludes submitted teams", async () => {
    const { t, fixture } = await seedReminderFixture(true);
    await t.run((ctx) =>
      ctx.db.insert("teams", {
        tournamentId: fixture.firstTournamentId,
        tourCardId: fixture.cards[0]!.cardId,
        golferIds: [],
      }),
    );

    const result = await t.query(
      internal.functions.emails
        .getMissingTeamReminderRecipientsForUpcomingTournament,
      { tournamentId: fixture.firstTournamentId },
    );

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("Expected reminder context");
    expect(result.recipients.map((recipient) => recipient.email)).toEqual([
      "player-1@example.com",
    ]);
    expect(result.eligibleTourCardCount).toBe(2);
    expect(result.isPlayoff).toBe(true);
  });

  it("does not remind members for inherited playoff legs", async () => {
    const { t, fixture } = await seedReminderFixture(true);
    const result = await t.query(
      internal.functions.emails
        .getMissingTeamReminderRecipientsForUpcomingTournament,
      { tournamentId: fixture.secondTournamentId! },
    );

    expect(result).toMatchObject({
      skipped: true,
      reason: "playoff_roster_inherited",
    });
  });
});
