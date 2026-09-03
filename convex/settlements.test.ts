/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
type CreditWinningsPage = FunctionReturnType<
  typeof api.functions.settlements.adminCreditCurrentSeasonWinnings
>;

function createTestBackend() {
  return convexTest(schema, modules);
}

async function ensureMember(
  t: ReturnType<typeof createTestBackend>,
  subject: string,
) {
  const authenticated = t.withIdentity({
    subject,
    email: `${subject}@example.com`,
    email_verified: true,
    given_name: "Test",
    family_name: "Member",
  });
  const member = await authenticated.mutation(
    api.functions.members.ensureCurrentMember,
    {},
  );
  if (!member) throw new Error("Expected member");
  return { authenticated, member };
}

async function seedCompletedSeason(
  t: ReturnType<typeof createTestBackend>,
  memberId: Id<"members">,
  earnings = 50_000,
) {
  return await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", {
      year: 2026,
      number: 1,
      startDate: Date.now() - 100_000,
      endDate: Date.now() - 1_000,
    });
    await ctx.db.insert("appState", {
      key: "primary",
      currentSeasonId: seasonId,
      seasonPhase: "completed",
      publicVersion: 1,
      updatedAt: Date.now(),
    });
    const tourId = await ctx.db.insert("tours", {
      name: "Settlement Tour",
      shortForm: "SET",
      logoUrl: "https://example.com/tour.png",
      seasonId,
      buyIn: 10_000,
      playoffSpots: [15, 20],
    });
    const cardId = await ctx.db.insert("tourCards", {
      displayName: "Settlement Player",
      memberId,
      seasonId,
      tourId,
      earnings,
      points: 250,
      wins: 1,
      topFive: 2,
      topTen: 3,
      madeCut: 4,
      appearances: 5,
      currentPosition: "2",
    });
    return { seasonId, tourId, cardId };
  });
}

describe("earnings settlements", () => {
  it("aggregates a private career overview and trophy case", async () => {
    const t = createTestBackend();
    const owner = await ensureMember(t, "overview-owner");
    const fixture = await seedCompletedSeason(t, owner.member._id);
    await t.run(async (ctx) => {
      const now = Date.now();
      const majorTierId = await ctx.db.insert("tiers", {
        name: "Major",
        seasonId: fixture.seasonId,
        points: [],
        payouts: [],
      });
      const playoffTierId = await ctx.db.insert("tiers", {
        name: "Playoff",
        seasonId: fixture.seasonId,
        points: [],
        payouts: [],
      });
      const courseId = await ctx.db.insert("courses", {
        apiId: "account-course",
        name: "Account Course",
        location: "Test",
        par: 72,
        front: 36,
        back: 36,
        timeZoneOffset: 0,
      });
      const tournamentId = await ctx.db.insert("tournaments", {
        name: "Account Major",
        seasonId: fixture.seasonId,
        tierId: majorTierId,
        courseId,
        logoUrl: "https://example.com/major.png",
        startDate: now - 100_000,
        endDate: now - 90_000,
        status: "completed",
      });
      await ctx.db.insert("standingsContributions", {
        seasonId: fixture.seasonId,
        tourId: fixture.tourId,
        tourCardId: fixture.cardId,
        tournamentId,
        memberId: owner.member._id,
        displayName: "Settlement Player",
        tournamentName: "Account Major",
        tournamentLogoUrl: "https://example.com/major.png",
        tournamentStartDate: now - 100_000,
        tournamentEndDate: now - 90_000,
        tournamentStatus: "completed",
        tierId: majorTierId,
        tierName: "Major",
        isPlayoff: false,
        position: "1",
        points: 100,
        earnings: 20_000,
        updatedAt: now,
      });

      for (const [index, tournamentName] of [
        "FedEx St. Jude Championship",
        "BMW Championship",
        "TOUR Championship",
      ].entries()) {
        const startDate = now - 80_000 + index * 20_000;
        const endDate = startDate + 10_000;
        const playoffTournamentId = await ctx.db.insert("tournaments", {
          name: tournamentName,
          seasonId: fixture.seasonId,
          tierId: playoffTierId,
          courseId,
          logoUrl: `https://example.com/playoff-${index + 1}.png`,
          startDate,
          endDate,
          status: "completed",
        });
        await ctx.db.insert("standingsContributions", {
          seasonId: fixture.seasonId,
          tourId: fixture.tourId,
          tourCardId: fixture.cardId,
          tournamentId: playoffTournamentId,
          memberId: owner.member._id,
          displayName: "Settlement Player",
          tournamentName,
          tournamentLogoUrl: `https://example.com/playoff-${index + 1}.png`,
          tournamentStartDate: startDate,
          tournamentEndDate: endDate,
          tournamentStatus: "completed",
          tierId: playoffTierId,
          tierName: "Playoff",
          // Historical contribution rows can have a stale playoff flag. The
          // scheduled tournament tier remains the source of truth.
          isPlayoff: false,
          position: "1",
          points: 0,
          earnings: 10_000,
          updatedAt: now,
        });
      }

      // Reproduce the legacy aggregate that counted all three playoff legs.
      // The account overview must use the canonical filtered results instead.
      await ctx.db.patch(fixture.cardId, { wins: 4 });
    });

    const overview = await owner.authenticated.query(
      api.functions.account.getMyOverview,
      {},
    );
    expect(overview.career).toMatchObject({
      earningsCents: 50_000,
      points: 250,
      wins: 2,
      topFive: 3,
      topTen: 4,
      madeCut: 5,
      appearances: 6,
    });
    expect(overview.achievements.map((item) => item.tournamentName)).toEqual([
      "TOUR Championship",
      "Account Major",
    ]);
    expect(overview.achievements[0]).toMatchObject({ year: 2026 });
    expect(overview.tourCards[0]).toMatchObject({
      wins: 2,
      topFive: 3,
      topTen: 4,
      madeCut: 5,
      appearances: 6,
    });
    expect(overview.currentSeasonFinancial?.seasonId).toBe(fixture.seasonId);
    expect(overview).not.toHaveProperty("seasonFinancials");
    expect(overview.member).not.toHaveProperty("clerkId");
  }, 15_000);

  it("processes each allocation once and preserves the card reserve", async () => {
    const t = createTestBackend();
    const owner = await ensureMember(t, "settlement-owner");
    const admin = await ensureMember(t, "settlement-admin");
    const fixture = await seedCompletedSeason(t, owner.member._id);
    await t.run(async (ctx) => {
      await ctx.db.patch(owner.member._id, { account: -10_000 });
      await ctx.db.patch(admin.member._id, { role: "admin" });
    });

    const request = await owner.authenticated.mutation(
      api.functions.settlements.submitMyRequest,
      {
        seasonId: fixture.seasonId,
        transferCents: 20_000,
        charityCents: 10_000,
        leagueCents: 0,
        nextSeasonCardCents: 10_000,
        payoutEmail: "payout@example.com",
      },
    );
    if (!request) throw new Error("Expected settlement request");
    expect(request).toMatchObject({
      earningsCents: 50_000,
      accountOffsetCents: 10_000,
      availableCents: 40_000,
      status: "pending",
    });

    for (const item of ["transfer", "charity", "nextSeasonCard"] as const) {
      await admin.authenticated.mutation(
        api.functions.settlements.adminCompleteItem,
        { requestId: request._id, item },
      );
    }
    await admin.authenticated.mutation(
      api.functions.settlements.adminCompleteItem,
      { requestId: request._id, item: "transfer" },
    );

    const result = await t.run(async (ctx) => ({
      request: await ctx.db.get(request._id),
      member: await ctx.db.get(owner.member._id),
      transactions: await ctx.db
        .query("transactions")
        .withIndex("by_settlement_request", (query) =>
          query.eq("settlementRequestId", request._id),
        )
        .collect(),
    }));
    expect(result.request?.status).toBe("completed");
    expect(result.member?.account).toBe(10_000);
    expect(result.transactions).toHaveLength(3);
    expect(
      result.transactions
        .map((transaction) => transaction.amount)
        .sort((a, b) => a - b),
    ).toEqual([-20_000, -10_000, 50_000]);
  }, 15_000);

  it("credits completed-season winnings for every member exactly once", async () => {
    const t = createTestBackend();
    const owner = await ensureMember(t, "credit-owner");
    const admin = await ensureMember(t, "credit-admin");
    const fixture = await seedCompletedSeason(t, owner.member._id);
    await t.run(async (ctx) => {
      await ctx.db.patch(owner.member._id, { account: -10_000 });
      await ctx.db.patch(admin.member._id, { role: "admin" });
    });

    for (let run = 0; run < 2; run += 1) {
      let cursor: string | null = null;
      do {
        const page: CreditWinningsPage = await admin.authenticated.mutation(
          api.functions.settlements.adminCreditCurrentSeasonWinnings,
          { cursor, limit: 1 },
        );
        cursor = page.isDone ? null : page.continueCursor;
      } while (cursor);
    }

    const result = await t.run(async (ctx) => ({
      member: await ctx.db.get(owner.member._id),
      winnings: await ctx.db
        .query("transactions")
        .withIndex("by_member_season_type", (query) =>
          query
            .eq("memberId", owner.member._id)
            .eq("seasonId", fixture.seasonId)
            .eq("transactionType", "TournamentWinnings"),
        )
        .collect(),
    }));
    expect(result.member?.account).toBe(40_000);
    expect(result.winnings).toHaveLength(1);
    expect(result.winnings[0]).toMatchObject({
      amount: 50_000,
      status: "completed",
    });

    const overview = await owner.authenticated.query(
      api.functions.account.getMyOverview,
      {},
    );
    expect(overview.currentSeasonFinancial).toMatchObject({
      earningsCents: 50_000,
      accountOffsetCents: 10_000,
      availableCents: 40_000,
    });
  }, 15_000);

  it("adds an existing positive account balance to the distributable total", async () => {
    const t = createTestBackend();
    const owner = await ensureMember(t, "positive-balance-owner");
    const fixture = await seedCompletedSeason(t, owner.member._id, 50_000);
    await t.run(async (ctx) => {
      await ctx.db.patch(owner.member._id, { account: 12_500 });
    });

    const overview = await owner.authenticated.query(
      api.functions.account.getMyOverview,
      {},
    );
    expect(overview.currentSeasonFinancial).toMatchObject({
      earningsCents: 50_000,
      accountOffsetCents: 0,
      availableCents: 62_500,
    });

    const request = await owner.authenticated.mutation(
      api.functions.settlements.submitMyRequest,
      {
        seasonId: fixture.seasonId,
        transferCents: 0,
        charityCents: 0,
        leagueCents: 0,
        nextSeasonCardCents: 0,
        retainedCents: 62_500,
      },
    );
    expect(request).toMatchObject({
      availableCents: 62_500,
      retainedCents: 62_500,
      status: "completed",
    });
    const member = await t.run(async (ctx) => ctx.db.get(owner.member._id));
    expect(member?.account).toBe(62_500);
  });

  it("lets a member retain all winnings without creating admin work", async () => {
    const t = createTestBackend();
    const owner = await ensureMember(t, "retained-owner");
    const fixture = await seedCompletedSeason(t, owner.member._id, 20_000);

    const request = await owner.authenticated.mutation(
      api.functions.settlements.submitMyRequest,
      {
        seasonId: fixture.seasonId,
        transferCents: 0,
        charityCents: 0,
        leagueCents: 0,
        nextSeasonCardCents: 0,
        retainedCents: 20_000,
      },
    );

    expect(request).toMatchObject({
      retainedCents: 20_000,
      status: "completed",
    });
    const member = await t.run(async (ctx) => ctx.db.get(owner.member._id));
    expect(member?.account).toBe(20_000);
  });

  it("rejects early, over-allocated, duplicate, and unauthorized requests", async () => {
    const t = createTestBackend();
    const owner = await ensureMember(t, "settlement-guard-owner");
    const regular = await ensureMember(t, "settlement-guard-regular");
    const fixture = await seedCompletedSeason(t, owner.member._id, 20_000);
    const historicalSeasonId = await t.run(async (ctx) =>
      ctx.db.insert("seasons", {
        year: 2025,
        number: 1,
        startDate: Date.now() - 200_000,
        endDate: Date.now() - 100_000,
      }),
    );

    await expect(
      owner.authenticated.mutation(api.functions.settlements.submitMyRequest, {
        seasonId: historicalSeasonId,
        transferCents: 0,
        charityCents: 0,
        leagueCents: 0,
        nextSeasonCardCents: 0,
      }),
    ).rejects.toThrow("only available for the current season");

    await expect(
      owner.authenticated.mutation(api.functions.settlements.submitMyRequest, {
        seasonId: fixture.seasonId,
        transferCents: 20_001,
        charityCents: 0,
        leagueCents: 0,
        nextSeasonCardCents: 0,
        payoutEmail: "owner@example.com",
      }),
    ).rejects.toThrow("Allocate the full");

    const request = await owner.authenticated.mutation(
      api.functions.settlements.submitMyRequest,
      {
        seasonId: fixture.seasonId,
        transferCents: 20_000,
        charityCents: 0,
        leagueCents: 0,
        nextSeasonCardCents: 0,
        payoutEmail: "owner@example.com",
      },
    );
    if (!request) throw new Error("Expected settlement request");
    await expect(
      owner.authenticated.mutation(api.functions.settlements.submitMyRequest, {
        seasonId: fixture.seasonId,
        transferCents: 20_000,
        charityCents: 0,
        leagueCents: 0,
        nextSeasonCardCents: 0,
        payoutEmail: "owner@example.com",
      }),
    ).rejects.toThrow("already have");
    await expect(
      regular.authenticated.query(
        api.functions.settlements.adminListRequests,
        {},
      ),
    ).rejects.toThrow("Admin access required");
    await expect(
      regular.authenticated.mutation(
        api.functions.settlements.adminCreditCurrentSeasonWinnings,
        {},
      ),
    ).rejects.toThrow("Admin access required");
    await expect(
      regular.authenticated.mutation(
        api.functions.settlements.adminCompleteItem,
        { requestId: request._id, item: "transfer" },
      ),
    ).rejects.toThrow("Admin access required");
  });
});
