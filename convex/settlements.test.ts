/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

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
      const tierId = await ctx.db.insert("tiers", {
        name: "Major",
        seasonId: fixture.seasonId,
        points: [],
        payouts: [],
      });
      const tournamentId = await ctx.db.insert("tournaments", {
        name: "Account Major",
        seasonId: fixture.seasonId,
        tierId,
        courseId: await ctx.db.insert("courses", {
          apiId: "account-course",
          name: "Account Course",
          location: "Test",
          par: 72,
          front: 36,
          back: 36,
          timeZoneOffset: 0,
        }),
        startDate: Date.now() - 10_000,
        endDate: Date.now() - 5_000,
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
        tournamentStartDate: Date.now() - 10_000,
        tournamentEndDate: Date.now() - 5_000,
        tournamentStatus: "completed",
        tierId,
        tierName: "Major",
        isPlayoff: false,
        position: "1",
        points: 100,
        earnings: 20_000,
        updatedAt: Date.now(),
      });
    });

    const overview = await owner.authenticated.query(
      api.functions.account.getMyOverview,
      {},
    );
    expect(overview.career).toMatchObject({
      earningsCents: 50_000,
      points: 250,
      wins: 1,
      madeCut: 4,
      appearances: 5,
    });
    expect(overview.achievements).toHaveLength(1);
    expect(overview.achievements[0]).toMatchObject({
      tournamentName: "Account Major",
      isMajor: true,
    });
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
  });

  it("rejects early, over-allocated, duplicate, and unauthorized requests", async () => {
    const t = createTestBackend();
    const owner = await ensureMember(t, "settlement-guard-owner");
    const regular = await ensureMember(t, "settlement-guard-regular");
    const fixture = await seedCompletedSeason(t, owner.member._id, 20_000);

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
        api.functions.settlements.adminCompleteItem,
        { requestId: request._id, item: "transfer" },
      ),
    ).rejects.toThrow("Admin access required");
  });
});
