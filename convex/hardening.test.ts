/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  return convexTest(schema, modules);
}

async function ensureMember(
  t: ReturnType<typeof createTestBackend>,
  subject: string,
) {
  const authenticated = t.withIdentity({ subject });
  const member = await authenticated.mutation(
    api.functions.members.ensureCurrentMember,
    {
      profile: {
        email: `${subject}@example.com`,
        firstname: "Test",
        lastname: "Member",
      },
    },
  );
  if (!member) throw new Error("Expected member");
  return { authenticated, member };
}

async function seedCompetition(t: ReturnType<typeof createTestBackend>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const seasonId = await ctx.db.insert("seasons", {
      year: new Date().getFullYear(),
      number: 1,
      registrationDeadline: now + 60_000,
    });
    const tourId = await ctx.db.insert("tours", {
      name: "Test Tour",
      shortForm: "TEST",
      logoUrl: "https://example.com/tour.png",
      seasonId,
      buyIn: 10_000,
      playoffSpots: [],
      maxParticipants: 75,
    });
    const tierId = await ctx.db.insert("tiers", {
      name: "Standard",
      seasonId,
      payouts: [],
      points: [],
    });
    const courseId = await ctx.db.insert("courses", {
      apiId: "test-course",
      name: "Test Course",
      location: "Test",
      par: 72,
      front: 36,
      back: 36,
      timeZoneOffset: 0,
    });
    const tournamentId = await ctx.db.insert("tournaments", {
      name: "Test Tournament",
      startDate: now + 24 * 60 * 60 * 1000,
      endDate: now + 5 * 24 * 60 * 60 * 1000,
      tierId,
      courseId,
      seasonId,
      status: "upcoming",
    });
    const golferApiIds: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const apiId = index + 1;
      golferApiIds.push(apiId);
      const golferId = await ctx.db.insert("golfers", {
        apiId,
        playerName: `Golfer ${apiId}`,
      });
      await ctx.db.insert("tournamentGolfers", {
        golferId,
        tournamentId,
        group: Math.floor(index / 2) + 1,
      });
    }
    return { seasonId, tourId, tournamentId, golferApiIds };
  });
}

describe("member privacy and identity", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("rejects anonymous private member access and creation", async () => {
    await expect(
      t.query(api.functions.members.getCurrentMember, {}),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.mutation(api.functions.members.ensureCurrentMember, {
        profile: { email: "anonymous@example.com" },
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("returns only public display fields from the public member list", async () => {
    await ensureMember(t, "member-public");
    const members = await t.query(api.functions.members.getPublicMembers, {});
    expect(members).toHaveLength(1);
    expect(members[0]).not.toHaveProperty("email");
    expect(members[0]).not.toHaveProperty("account");
    expect(members[0]).not.toHaveProperty("clerkId");
    expect(members[0]).not.toHaveProperty("friends");
  });
});

describe("registration, picks, payments, and leases", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("creates registration and its fee atomically", async () => {
    const seeded = await seedCompetition(t);
    const { authenticated, member } = await ensureMember(t, "registration");
    const card = await authenticated.mutation(
      api.functions.tourCards.createMyTourCard,
      {
        displayName: "T. Member",
        tourId: seeded.tourId,
        seasonId: seeded.seasonId,
      },
    );
    expect(card?.memberId).toBe(member._id);
    const state = await t.run(async (ctx) => ({
      member: await ctx.db.get(member._id),
      transactions: await ctx.db
        .query("transactions")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect(),
    }));
    expect(state.member?.account).toBe(-10_000);
    expect(state.transactions).toMatchObject([
      { amount: -10_000, transactionType: "TourCardFee", status: "completed" },
    ]);
  });

  it("enforces roster rules and upserts the caller's team", async () => {
    const seeded = await seedCompetition(t);
    const { authenticated, member } = await ensureMember(t, "picker");
    const tourCardId = await t.run(async (ctx) => {
      await ctx.db.patch(member._id, { account: 0 });
      return await ctx.db.insert("tourCards", {
        displayName: "Picker",
        memberId: member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
    });
    await expect(
      authenticated.mutation(api.functions.teams.saveMyTournamentTeam, {
        tournamentId: seeded.tournamentId,
        tourCardId,
        golferIds: seeded.golferApiIds.slice(0, 9),
      }),
    ).rejects.toThrow("exactly 10");
    const first = await authenticated.mutation(
      api.functions.teams.saveMyTournamentTeam,
      {
        tournamentId: seeded.tournamentId,
        tourCardId,
        golferIds: seeded.golferApiIds,
      },
    );
    const second = await authenticated.mutation(
      api.functions.teams.saveMyTournamentTeam,
      {
        tournamentId: seeded.tournamentId,
        tourCardId,
        golferIds: [...seeded.golferApiIds].reverse(),
      },
    );
    expect(second?._id).toBe(first?._id);
  });

  it("requires admin access for payments", async () => {
    const seeded = await seedCompetition(t);
    const regular = await ensureMember(t, "regular");
    const admin = await ensureMember(t, "admin");
    await t.run(async (ctx) => {
      await ctx.db.patch(admin.member._id, { role: "admin" });
    });
    await expect(
      regular.authenticated.mutation(api.functions.transactions.createPayment, {
        memberId: regular.member._id,
        seasonId: seeded.seasonId,
        amount: 1_000,
      }),
    ).rejects.toThrow("Admin");
    await admin.authenticated.mutation(
      api.functions.transactions.createPayment,
      {
        memberId: regular.member._id,
        seasonId: seeded.seasonId,
        amount: 1_000,
      },
    );
    const updated = await t.run((ctx) => ctx.db.get(regular.member._id));
    expect(updated?.account).toBe(1_000);
  });

  it("prevents concurrent job leases and recovers expired runs", async () => {
    const first = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "test",
      runKey: "test:1",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    const second = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "test",
      runKey: "test:2",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(false);
    await t.run(async (ctx) => {
      await ctx.db.patch(first.runId as Id<"syncRuns">, {
        leaseExpiresAt: Date.now() - 1,
      });
    });
    const recovered = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "test",
      runKey: "test:3",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    expect(recovered.acquired).toBe(true);
  });

  it("keeps public home data viewer-independent and bounded", async () => {
    const seeded = await seedCompetition(t);
    const { member } = await ensureMember(t, "private-home");
    await t.run(async (ctx) => {
      await ctx.db.insert("tourCards", {
        displayName: "Private Card",
        memberId: member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
    });
    const dashboard = await t.query(
      api.functions.home.getPublicHomeDashboard,
      {},
    );
    expect(dashboard).not.toHaveProperty("member");
    expect(dashboard).not.toHaveProperty("tourCards");
    expect(dashboard.tours).toHaveLength(1);
  });

  it("maintains registration counts and denormalized team metadata", async () => {
    const seeded = await seedCompetition(t);
    const { authenticated, member } = await ensureMember(t, "read-models");
    await t.run((ctx) => ctx.db.patch(member._id, { account: 0 }));
    const card = await authenticated.mutation(
      api.functions.tourCards.createMyTourCard,
      {
        displayName: "Read Model",
        tourId: seeded.tourId,
        seasonId: seeded.seasonId,
      },
    );
    expect(card).not.toBeNull();
    await t.run((ctx) => ctx.db.patch(member._id, { account: 0 }));
    const team = await authenticated.mutation(
      api.functions.teams.saveMyTournamentTeam,
      {
        tournamentId: seeded.tournamentId,
        tourCardId: card!._id,
        golferIds: seeded.golferApiIds,
      },
    );
    const tour = await t.run((ctx) => ctx.db.get(seeded.tourId));
    expect(tour?.registeredCount).toBe(1);
    expect(team).toMatchObject({
      seasonId: seeded.seasonId,
      tourId: seeded.tourId,
      memberId: member._id,
      displayName: "Read Model",
    });
  });

  it("returns only the authenticated viewer's private bootstrap data", async () => {
    const seeded = await seedCompetition(t);
    const first = await ensureMember(t, "viewer-one");
    const second = await ensureMember(t, "viewer-two");
    await t.run(async (ctx) => {
      await ctx.db.insert("tourCards", {
        displayName: "One",
        memberId: first.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      await ctx.db.insert("tourCards", {
        displayName: "Two",
        memberId: second.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
    });
    const bootstrap = await first.authenticated.query(
      api.functions.readModels.getViewerBootstrap,
      {},
    );
    expect(bootstrap.member?._id).toBe(first.member._id);
    expect(bootstrap.tourCards.map((card) => card.displayName)).toEqual([
      "One",
    ]);
  });

  it("does not patch unchanged live-sync rows", async () => {
    const seeded = await seedCompetition(t);
    const tournamentGolfer = await t.run((ctx) =>
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", seeded.tournamentId),
        )
        .first(),
    );
    expect(tournamentGolfer).not.toBeNull();

    const unchanged = await t.mutation(
      internal.functions.golfers.updateTournamentGolfer,
      {
        tournamentGolfer: {
          _id: tournamentGolfer!._id,
          golferId: tournamentGolfer!.golferId,
          tournamentId: tournamentGolfer!.tournamentId,
          group: tournamentGolfer!.group,
        },
      },
    );
    expect(unchanged.changed).toBe(false);

    const changed = await t.mutation(
      internal.functions.golfers.updateTournamentGolfer,
      {
        tournamentGolfer: {
          _id: tournamentGolfer!._id,
          golferId: tournamentGolfer!.golferId,
          tournamentId: tournamentGolfer!.tournamentId,
          group: tournamentGolfer!.group,
          score: -3,
        },
      },
    );
    expect(changed.changed).toBe(true);
    const afterChange = await t.run((ctx) => ctx.db.get(tournamentGolfer!._id));
    const repeated = await t.mutation(
      internal.functions.golfers.updateTournamentGolfer,
      {
        tournamentGolfer: {
          _id: tournamentGolfer!._id,
          golferId: tournamentGolfer!.golferId,
          tournamentId: tournamentGolfer!.tournamentId,
          group: tournamentGolfer!.group,
          score: -3,
        },
      },
    );
    const afterRepeat = await t.run((ctx) => ctx.db.get(tournamentGolfer!._id));
    expect(repeated.changed).toBe(false);
    expect(afterRepeat?.updatedAt).toBe(afterChange?.updatedAt);
  });

  it("materializes major champion badges once at completion", async () => {
    const seeded = await seedCompetition(t);
    const { member } = await ensureMember(t, "major-winner");
    await t.run(async (ctx) => {
      const tournament = await ctx.db.get(seeded.tournamentId);
      if (!tournament) throw new Error("Expected tournament");
      await ctx.db.patch(tournament.tierId, { name: "Major" });
      await ctx.db.patch(tournament._id, { status: "completed" });
      const tourCardId = await ctx.db.insert("tourCards", {
        displayName: "Winner",
        memberId: member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId,
        golferIds: seeded.golferApiIds,
        position: "1",
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        memberId: member._id,
        displayName: "Winner",
      });
    });

    const first = await t.mutation(
      internal.functions.readModels.rebuildMajorChampionBadgesForTournament,
      { tournamentId: seeded.tournamentId },
    );
    const second = await t.mutation(
      internal.functions.readModels.rebuildMajorChampionBadgesForTournament,
      { tournamentId: seeded.tournamentId },
    );
    const badges = await t.run((ctx) =>
      ctx.db
        .query("majorChampionBadges")
        .withIndex("by_season_member", (q) =>
          q.eq("seasonId", seeded.seasonId).eq("memberId", member._id),
        )
        .collect(),
    );
    expect(first.changed).toBe(1);
    expect(second.changed).toBe(0);
    expect(badges).toHaveLength(1);
  });
});
