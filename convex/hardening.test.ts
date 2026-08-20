/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  const authenticated = t.withIdentity({
    subject,
    email: `${subject}@example.com`,
    email_verified: true,
    given_name: "Test",
    family_name: "Member",
  });
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it("ignores client identity fields and skips unchanged provisioning writes", async () => {
    const authenticated = t.withIdentity({
      subject: "identity-source",
      email: "REAL@EXAMPLE.COM",
      email_verified: true,
      given_name: "Real",
      family_name: "Person",
    });
    const created = await authenticated.mutation(
      api.functions.members.ensureCurrentMember,
      {
        profile: {
          email: "forged@example.com",
          firstname: "Forged",
          lastname: "Identity",
        },
      },
    );
    expect(created).toMatchObject({
      email: "real@example.com",
      firstname: "Real",
      lastname: "Person",
    });
    expect(created).not.toHaveProperty("clerkId");
    const updatedAt = created
      ? await t.run(async (ctx) => (await ctx.db.get(created._id))?.updatedAt)
      : undefined;
    const repeated = await authenticated.mutation(
      api.functions.members.ensureCurrentMember,
      {},
    );
    const repeatedUpdatedAt = repeated
      ? await t.run(async (ctx) => (await ctx.db.get(repeated._id))?.updatedAt)
      : undefined;
    expect(repeatedUpdatedAt).toBe(updatedAt);
  });

  it("allows existing members without profile claims but rejects new ones", async () => {
    const existing = await ensureMember(t, "existing-claims");
    const missingClaims = t.withIdentity({ subject: "existing-claims" });
    const result = await missingClaims.mutation(
      api.functions.members.ensureCurrentMember,
      {},
    );
    expect(result?._id).toBe(existing.member._id);

    await expect(
      t
        .withIdentity({ subject: "new-missing-claims" })
        .mutation(api.functions.members.ensureCurrentMember, {}),
    ).rejects.toThrow("verified email claim");
  });

  it("restricts profile and friend changes to narrow self-service mutations", async () => {
    const first = await ensureMember(t, "narrow-first");
    const second = await ensureMember(t, "narrow-second");

    await expect(
      first.authenticated.mutation(api.functions.members.updateMembers, {
        memberId: first.member._id,
        data: { email: "changed@example.com" },
      }),
    ).rejects.toThrow("only updates names");
    await expect(
      first.authenticated.mutation(api.functions.members.updateMembers, {
        memberId: second.member._id,
        data: { firstname: "Nope" },
      }),
    ).rejects.toThrow("your own profile");

    await first.authenticated.mutation(api.functions.members.addMyFriend, {
      memberId: second.member._id,
    });
    await first.authenticated.mutation(api.functions.members.addMyFriend, {
      memberId: second.member._id,
    });
    let stored = await t.run((ctx) => ctx.db.get(first.member._id));
    expect(stored?.friends.map(String)).toEqual([String(second.member._id)]);

    await first.authenticated.mutation(api.functions.members.removeMyFriend, {
      memberId: second.member._id,
    });
    await first.authenticated.mutation(api.functions.members.removeMyFriend, {
      memberId: second.member._id,
    });
    stored = await t.run((ctx) => ctx.db.get(first.member._id));
    expect(stored?.friends).toEqual([]);
  });

  it("prevents an admin from deactivating their own account", async () => {
    const admin = await ensureMember(t, "self-deactivate-admin");
    await t.run((ctx) => ctx.db.patch(admin.member._id, { role: "admin" }));
    await expect(
      admin.authenticated.mutation(
        api.functions.members.adminUpdateMemberStatus,
        { memberId: admin.member._id, isActive: false },
      ),
    ).rejects.toThrow("cannot deactivate");
  });
});

describe("email action hardening", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("rejects anonymous and non-admin missing-team reminder test sends", async () => {
    await expect(
      t.action(api.functions.emails.sendMissingTeamReminderEmailTest, {}),
    ).rejects.toThrow("Unauthorized");

    const regular = await ensureMember(t, "email-regular");
    await expect(
      regular.authenticated.action(
        api.functions.emails.sendMissingTeamReminderEmailTest,
        {},
      ),
    ).rejects.toThrow("Admin access required");

    await expect(
      t.action(
        api.functions.emails.adminSendMissingTeamReminderForUpcomingTournament,
        {},
      ),
    ).rejects.toThrow("Unauthorized");
    await expect(
      regular.authenticated.action(
        api.functions.emails.adminSendMissingTeamReminderForUpcomingTournament,
        {},
      ),
    ).rejects.toThrow("Admin access required");
  });

  it("blocks concurrent sends and enforces the completed-send cooldown", async () => {
    const key = "test:dispatch";
    const first = await t.mutation(
      internal.functions.emails.acquireEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "first",
        now: 1_000,
        leaseMs: 5_000,
      },
    );
    expect(first).toEqual({ acquired: true });

    const concurrent = await t.mutation(
      internal.functions.emails.acquireEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "second",
        now: 2_000,
        leaseMs: 5_000,
      },
    );
    expect(concurrent).toMatchObject({
      acquired: false,
      reason: "in_progress",
      retryAfterMs: 4_000,
    });

    await t.mutation(
      internal.functions.emails.completeEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "first",
        now: 3_000,
        cooldownMs: 10_000,
      },
    );

    const rateLimited = await t.mutation(
      internal.functions.emails.acquireEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "third",
        now: 4_000,
        leaseMs: 5_000,
      },
    );
    expect(rateLimited).toMatchObject({
      acquired: false,
      reason: "rate_limited",
      retryAfterMs: 9_000,
    });

    const afterCooldown = await t.mutation(
      internal.functions.emails.acquireEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "fourth",
        now: 13_000,
        leaseMs: 5_000,
      },
    );
    expect(afterCooldown).toEqual({ acquired: true });
  });

  it("ignores completion from an expired lease owner", async () => {
    const key = "test:stale-completion";
    await t.mutation(
      internal.functions.emails.acquireEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "old",
        now: 1_000,
        leaseMs: 1_000,
      },
    );
    await t.mutation(
      internal.functions.emails.acquireEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "new",
        now: 2_001,
        leaseMs: 5_000,
      },
    );

    const staleCompletion = await t.mutation(
      internal.functions.emails.completeEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "old",
        now: 3_000,
        cooldownMs: 10_000,
      },
    );
    expect(staleCompletion).toEqual({ completed: false });

    const stillInProgress = await t.mutation(
      internal.functions.emails.acquireEmailDispatchGuard_Internal,
      {
        key,
        leaseToken: "third",
        now: 3_001,
        leaseMs: 5_000,
      },
    );
    expect(stillInProgress).toMatchObject({
      acquired: false,
      reason: "in_progress",
    });
  });
});

describe("admin dashboard authorization", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("rejects non-admin dashboard and tournament-list access", async () => {
    await seedCompetition(t);
    const regular = await ensureMember(t, "dashboard-regular");
    const moderator = await ensureMember(t, "dashboard-moderator");
    await t.run((ctx) =>
      ctx.db.patch(moderator.member._id, { role: "moderator" }),
    );

    await expect(
      t.query(api.functions.readModels.adminGetDashboard, {}),
    ).rejects.toThrow("Unauthorized");
    await expect(
      regular.authenticated.query(
        api.functions.readModels.adminGetDashboard,
        {},
      ),
    ).rejects.toThrow("Admin");
    await expect(
      moderator.authenticated.query(
        api.functions.readModels.adminGetDashboard,
        {},
      ),
    ).rejects.toThrow("Admin");
    await expect(
      regular.authenticated.query(
        api.functions.tournaments.getAllTournaments,
        {},
      ),
    ).rejects.toThrow("Admin");
  });

  it("returns bounded explicit DTOs to admins", async () => {
    await seedCompetition(t);
    const admin = await ensureMember(t, "dashboard-admin");
    await t.run((ctx) => ctx.db.patch(admin.member._id, { role: "admin" }));
    const dashboard = await admin.authenticated.query(
      api.functions.readModels.adminGetDashboard,
      {},
    );

    expect(dashboard.members).toHaveLength(1);
    expect(dashboard.members[0]).not.toHaveProperty("clerkId");
    expect(dashboard.members[0]).not.toHaveProperty("friends");
    expect(dashboard.members[0]).not.toHaveProperty("updatedAt");
    expect(dashboard.tournaments[0]).not.toHaveProperty("apiId");
    expect(dashboard.tournaments[0]).not.toHaveProperty(
      "leaderboardLastUpdatedAt",
    );
  });
});

describe("pre-start tournament roster privacy", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("returns only the caller's indexed team before the server start time", async () => {
    const seeded = await seedCompetition(t);
    const owner = await ensureMember(t, "roster-owner");
    const other = await ensureMember(t, "roster-other");
    const admin = await ensureMember(t, "roster-admin");
    const otherCardId = await t.run(async (ctx) => {
      await ctx.db.patch(admin.member._id, { role: "admin" });
      const ownerCardId = await ctx.db.insert("tourCards", {
        displayName: "Owner",
        memberId: owner.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      const otherCardId = await ctx.db.insert("tourCards", {
        displayName: "Other",
        memberId: other.member._id,
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
        tourCardId: ownerCardId,
        memberId: owner.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        displayName: "Owner",
        golferIds: seeded.golferApiIds,
      });
      await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: otherCardId,
        memberId: other.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        displayName: "Other",
        golferIds: [...seeded.golferApiIds].reverse(),
      });
      await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: otherCardId,
        golferIds: seeded.golferApiIds,
      });
      await ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        nextTournamentId: seeded.tournamentId,
        seasonPhase: "registration",
        publicVersion: 1,
        updatedAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      });
      return otherCardId;
    });

    const anonymous = await t.query(
      api.functions.tournaments.getTournamentLeaderboardView,
      { tournamentId: seeded.tournamentId },
    );
    const ownerView = await owner.authenticated.query(
      api.functions.tournaments.getTournamentLeaderboardView,
      { tournamentId: seeded.tournamentId },
    );
    const adminView = await admin.authenticated.query(
      api.functions.tournaments.getTournamentLeaderboardView,
      { tournamentId: seeded.tournamentId },
    );
    const anonymousScoped = await t.query(
      api.functions.tournaments.getPgcLeaderboard,
      {
        tournamentId: seeded.tournamentId,
        tourId: String(seeded.tourId),
        variant: "regular",
      },
    );
    const ownerScoped = await owner.authenticated.query(
      api.functions.tournaments.getPgcLeaderboard,
      {
        tournamentId: seeded.tournamentId,
        tourId: String(seeded.tourId),
        variant: "regular",
      },
    );
    const adminScoped = await admin.authenticated.query(
      api.functions.tournaments.getPgcLeaderboard,
      {
        tournamentId: seeded.tournamentId,
        tourId: String(seeded.tourId),
        variant: "regular",
      },
    );
    const standings = await t.query(api.functions.seasons.getStandingsIndex, {
      seasonId: seeded.seasonId,
    });
    const legacyStandings = await t.query(
      api.functions.seasons.getStandingsViewData,
      { seasonId: seeded.seasonId },
    );
    const history = await t.query(
      api.functions.seasons.getTourCardTournamentHistory,
      { tourCardId: otherCardId },
    );

    expect(anonymous.teams).toEqual([]);
    expect(ownerView.teams).toHaveLength(1);
    expect(ownerView.teams[0]?.memberId).toBe(owner.member._id);
    expect(adminView.teams).toEqual([]);
    expect(anonymousScoped.teams).toEqual([]);
    expect(ownerScoped.teams).toHaveLength(1);
    expect(ownerScoped.teams[0]?.memberId).toBe(owner.member._id);
    expect(adminScoped.teams).toEqual([]);
    expect(standings.standingsRows).toEqual([]);
    expect(legacyStandings.teams).toEqual([]);
    expect(history.page).toEqual([]);
  });

  it("reveals all teams at the exact start boundary", async () => {
    const seeded = await seedCompetition(t);
    const owner = await ensureMember(t, "boundary-owner");
    const startDate = Date.now() + 60_000;
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.tournamentId, { startDate });
      const cardId = await ctx.db.insert("tourCards", {
        displayName: "Boundary",
        memberId: owner.member._id,
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
        tourCardId: cardId,
        memberId: owner.member._id,
        golferIds: seeded.golferApiIds,
      });
    });

    vi.useFakeTimers();
    vi.setSystemTime(startDate - 1);
    const before = await t.query(
      api.functions.tournaments.getTournamentLeaderboardView,
      { tournamentId: seeded.tournamentId },
    );
    vi.setSystemTime(startDate);
    const atStart = await t.query(
      api.functions.tournaments.getTournamentLeaderboardView,
      { tournamentId: seeded.tournamentId },
    );

    expect(before.teams).toEqual([]);
    expect(atStart.teams).toHaveLength(1);
  });
});

describe("tour-card self-service cutoff", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("ignores a cancelled event and audits a switch before the next event", async () => {
    const seeded = await seedCompetition(t);
    const owner = await ensureMember(t, "switch-owner");
    const { cardId, destinationTourId } = await t.run(async (ctx) => {
      await ctx.db.patch(seeded.tournamentId, {
        status: "cancelled",
        startDate: Date.now() - 60_000,
      });
      const destinationTourId = await ctx.db.insert("tours", {
        name: "Destination Tour",
        shortForm: "DEST",
        logoUrl: "https://example.com/destination.png",
        seasonId: seeded.seasonId,
        buyIn: 10_000,
        playoffSpots: [],
        maxParticipants: 75,
      });
      const sourceTournament = await ctx.db.get(seeded.tournamentId);
      if (!sourceTournament) throw new Error("Expected tournament");
      await ctx.db.insert("tournaments", {
        name: "First Active Event",
        startDate: Date.now() + 60_000,
        endDate: Date.now() + 120_000,
        tierId: sourceTournament.tierId,
        courseId: sourceTournament.courseId,
        seasonId: seeded.seasonId,
        status: "upcoming",
      });
      const cardId = await ctx.db.insert("tourCards", {
        displayName: "Switch Owner",
        memberId: owner.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      return { cardId, destinationTourId };
    });

    const switched = await owner.authenticated.mutation(
      api.functions.tourCards.switchTourCards,
      { id: cardId, tourId: destinationTourId },
    );
    expect(switched?.tourId).toBe(destinationTourId);
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "tourCard").eq("entityId", String(cardId)),
        )
        .collect(),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "updated" });
  });

  it("blocks owners at the exact boundary and gives admins no bypass", async () => {
    const seeded = await seedCompetition(t);
    const owner = await ensureMember(t, "locked-owner");
    const admin = await ensureMember(t, "locked-admin");
    const startDate = Date.now() + 60_000;
    const { cardId, destinationTourId, teamId } = await t.run(async (ctx) => {
      await ctx.db.patch(admin.member._id, { role: "admin" });
      await ctx.db.patch(seeded.tournamentId, { startDate });
      const destinationTourId = await ctx.db.insert("tours", {
        name: "Locked Destination",
        shortForm: "LOCK",
        logoUrl: "https://example.com/locked.png",
        seasonId: seeded.seasonId,
        buyIn: 10_000,
        playoffSpots: [],
        maxParticipants: 75,
      });
      const cardId = await ctx.db.insert("tourCards", {
        displayName: "Locked Owner",
        memberId: owner.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      const teamId = await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: cardId,
        memberId: owner.member._id,
        tourId: seeded.tourId,
        golferIds: seeded.golferApiIds,
      });
      return { cardId, destinationTourId, teamId };
    });

    await expect(
      admin.authenticated.mutation(api.functions.tourCards.switchTourCards, {
        id: cardId,
        tourId: destinationTourId,
      }),
    ).rejects.toThrow("your own tour card");

    vi.useFakeTimers();
    vi.setSystemTime(startDate);
    await expect(
      owner.authenticated.mutation(api.functions.tourCards.switchTourCards, {
        id: cardId,
        tourId: destinationTourId,
      }),
    ).rejects.toThrow("first event started");
    await expect(
      owner.authenticated.mutation(
        api.functions.tourCards.deleteTourCardAndFee,
        { id: cardId },
      ),
    ).rejects.toThrow("first event started");

    const unchanged = await t.run(async (ctx) => ({
      card: await ctx.db.get(cardId),
      team: await ctx.db.get(teamId),
      audits: await ctx.db.query("auditLogs").collect(),
    }));
    expect(unchanged.card?.tourId).toBe(seeded.tourId);
    expect(unchanged.team?.tourId).toBe(seeded.tourId);
    expect(unchanged.audits).toEqual([]);
  });

  it("allows deletion when all events are cancelled and audits financial cleanup", async () => {
    const seeded = await seedCompetition(t);
    const owner = await ensureMember(t, "delete-owner");
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.tournamentId, {
        status: "cancelled",
        startDate: Date.now() - 60_000,
      });
    });
    const card = await owner.authenticated.mutation(
      api.functions.tourCards.createMyTourCard,
      {
        displayName: "Delete Owner",
        tourId: seeded.tourId,
        seasonId: seeded.seasonId,
      },
    );
    if (!card) throw new Error("Expected tour card");

    await owner.authenticated.mutation(
      api.functions.tourCards.deleteTourCardAndFee,
      { id: card._id },
    );
    const state = await t.run(async (ctx) => ({
      card: await ctx.db.get(card._id),
      member: await ctx.db.get(owner.member._id),
      transactions: await ctx.db
        .query("transactions")
        .withIndex("by_member", (q) => q.eq("memberId", owner.member._id))
        .collect(),
      audits: await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "tourCard").eq("entityId", String(card._id)),
        )
        .collect(),
    }));
    expect(state.card).toBeNull();
    expect(state.member?.account).toBe(0);
    expect(state.transactions).toEqual([]);
    expect(state.audits).toHaveLength(2);
    expect(state.audits[state.audits.length - 1]).toMatchObject({
      action: "deleted",
    });
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

  it("coalesces unchanged sync run heartbeats but keeps failures", async () => {
    vi.useFakeTimers();
    const startedAt = new Date("2026-08-02T12:00:00.000Z");
    vi.setSystemTime(startedAt);

    const first = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "tournament_sync",
      runKey: "tournament_sync:first",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    if (!first.acquired) throw new Error("Expected first lease");
    await t.mutation(internal.functions.syncRuns.finalize, {
      runId: first.runId,
      status: "skipped",
      skipReason: "data_golf_unchanged",
      coalesceWithinMs: 30 * 60_000,
    });

    vi.setSystemTime(new Date(startedAt.getTime() + 4 * 60_000));
    const second = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "tournament_sync",
      runKey: "tournament_sync:second",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    if (!second.acquired) throw new Error("Expected second lease");
    const coalesced = await t.mutation(internal.functions.syncRuns.finalize, {
      runId: second.runId,
      status: "skipped",
      skipReason: "data_golf_unchanged",
      coalesceWithinMs: 30 * 60_000,
    });
    expect(coalesced?.persisted).toBe(false);

    vi.setSystemTime(new Date(startedAt.getTime() + 8 * 60_000));
    const failed = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "tournament_sync",
      runKey: "tournament_sync:failed",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    if (!failed.acquired) throw new Error("Expected failure lease");
    await t.mutation(internal.functions.syncRuns.finalize, {
      runId: failed.runId,
      status: "failed",
      error: "upstream unavailable",
      coalesceWithinMs: 30 * 60_000,
    });

    vi.setSystemTime(new Date(startedAt.getTime() + 9 * 60_000));
    const recovery = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "tournament_sync",
      runKey: "tournament_sync:recovery",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    if (!recovery.acquired) throw new Error("Expected recovery lease");
    const recovered = await t.mutation(internal.functions.syncRuns.finalize, {
      runId: recovery.runId,
      status: "skipped",
      skipReason: "data_golf_unchanged",
      coalesceWithinMs: 30 * 60_000,
    });
    expect(recovered?.persisted).toBe(true);

    vi.setSystemTime(new Date(startedAt.getTime() + 13 * 60_000));
    const repeated = await t.mutation(internal.functions.syncRuns.acquire, {
      jobName: "tournament_sync",
      runKey: "tournament_sync:repeated",
      trigger: "scheduled",
      leaseMs: 60_000,
    });
    if (!repeated.acquired) throw new Error("Expected repeated lease");
    const repeatedResult = await t.mutation(
      internal.functions.syncRuns.finalize,
      {
        runId: repeated.runId,
        status: "skipped",
        skipReason: "data_golf_unchanged",
        coalesceWithinMs: 30 * 60_000,
      },
    );
    expect(repeatedResult?.persisted).toBe(false);

    vi.setSystemTime(new Date(startedAt.getTime() + 39 * 60_000));
    const nextHeartbeat = await t.mutation(
      internal.functions.syncRuns.acquire,
      {
        jobName: "tournament_sync",
        runKey: "tournament_sync:next-heartbeat",
        trigger: "scheduled",
        leaseMs: 60_000,
      },
    );
    if (!nextHeartbeat.acquired) throw new Error("Expected heartbeat lease");
    const nextHeartbeatResult = await t.mutation(
      internal.functions.syncRuns.finalize,
      {
        runId: nextHeartbeat.runId,
        status: "skipped",
        skipReason: "data_golf_unchanged",
        coalesceWithinMs: 30 * 60_000,
      },
    );
    expect(nextHeartbeatResult?.persisted).toBe(true);

    const runs = await t.run((ctx) => ctx.db.query("syncRuns").collect());
    expect(runs).toHaveLength(4);
    expect(runs.map((run) => run.status).sort()).toEqual([
      "failed",
      "skipped",
      "skipped",
      "skipped",
    ]);
  });

  it("coalesces unchanged sync timestamps and records recovery promptly", async () => {
    vi.useFakeTimers();
    const startedAt = new Date("2026-08-02T12:00:00.000Z");
    vi.setSystemTime(startedAt);
    const seeded = await seedCompetition(t);

    const first = await t.mutation(
      internal.functions.tournamentSyncState.recordUnchangedSuccess,
      {
        tournamentId: seeded.tournamentId,
        dataGolfInPlayLastUpdate: "marker-1",
        coalesceWithinMs: 30 * 60_000,
      },
    );
    expect(first.persisted).toBe(true);

    vi.setSystemTime(new Date(startedAt.getTime() + 4 * 60_000));
    const second = await t.mutation(
      internal.functions.tournamentSyncState.recordUnchangedSuccess,
      {
        tournamentId: seeded.tournamentId,
        dataGolfInPlayLastUpdate: "marker-1",
        coalesceWithinMs: 30 * 60_000,
      },
    );
    expect(second.persisted).toBe(false);
    const coalescedState = await t.run((ctx) => ctx.db.get(first.id));
    expect(coalescedState?.lastAttemptAt).toBe(startedAt.getTime());
    expect(coalescedState?.lastSuccessAt).toBe(startedAt.getTime());

    const failureAt = startedAt.getTime() + 5 * 60_000;
    vi.setSystemTime(new Date(failureAt));
    await t.mutation(internal.functions.tournamentSyncState.recordFailure, {
      tournamentId: seeded.tournamentId,
      error: "upstream unavailable",
    });
    const failedState = await t.run((ctx) => ctx.db.get(first.id));
    expect(failedState?.failureCount).toBe(1);
    expect(failedState?.lastAttemptAt).toBe(failureAt);
    expect(failedState?.updatedAt).toBe(failureAt);

    const recoveredAt = failureAt + 60_000;
    vi.setSystemTime(new Date(recoveredAt));
    const recovered = await t.mutation(
      internal.functions.tournamentSyncState.recordUnchangedSuccess,
      {
        tournamentId: seeded.tournamentId,
        dataGolfInPlayLastUpdate: "marker-1",
        coalesceWithinMs: 30 * 60_000,
      },
    );
    expect(recovered.persisted).toBe(true);
    const recoveredState = await t.run((ctx) => ctx.db.get(first.id));
    expect(recoveredState?.failureCount).toBe(0);
    expect(recoveredState?.lastSuccessAt).toBe(recoveredAt);

    const nextHeartbeatAt = recoveredAt + 30 * 60_000;
    vi.setSystemTime(new Date(nextHeartbeatAt));
    const nextHeartbeat = await t.mutation(
      internal.functions.tournamentSyncState.recordUnchangedSuccess,
      {
        tournamentId: seeded.tournamentId,
        dataGolfInPlayLastUpdate: "marker-1",
        coalesceWithinMs: 30 * 60_000,
      },
    );
    expect(nextHeartbeat.persisted).toBe(true);
    const refreshedState = await t.run((ctx) => ctx.db.get(first.id));
    expect(refreshedState?.lastSuccessAt).toBe(nextHeartbeatAt);
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
      await ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        nextTournamentId: seeded.tournamentId,
        seasonPhase: "in-season",
        publicVersion: 1,
        liveSyncChainId: "private-chain",
        liveSyncLeaseUntil: Date.now() + 60_000,
        liveSyncScheduledTournamentId: seeded.tournamentId,
        pickWindowScheduledTournamentId: seeded.tournamentId,
        updatedAt: Date.now(),
      });
    });
    const dashboard = await t.query(
      api.functions.home.getPublicHomeDashboard,
      {},
    );
    expect(dashboard).not.toHaveProperty("member");
    expect(dashboard).not.toHaveProperty("tourCards");
    expect(dashboard.tours).toHaveLength(1);
    expect(dashboard.tournaments[0]).not.toHaveProperty("groupsEmailSentAt");
    expect(dashboard.tournaments[0]).not.toHaveProperty(
      "dataGolfInPlayLastUpdate",
    );
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
      await ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        nextTournamentId: seeded.tournamentId,
        seasonPhase: "in-season",
        publicVersion: 1,
        liveSyncChainId: "private-bootstrap-chain",
        liveSyncLeaseUntil: Date.now() + 60_000,
        liveSyncScheduledTournamentId: seeded.tournamentId,
        pickWindowScheduledTournamentId: seeded.tournamentId,
        updatedAt: Date.now(),
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
    expect(bootstrap.appState).not.toHaveProperty("liveSyncChainId");
    expect(bootstrap.appState).not.toHaveProperty("liveSyncLeaseUntil");
    expect(bootstrap.appState).not.toHaveProperty(
      "pickWindowScheduledTournamentId",
    );
    expect(bootstrap.member).not.toHaveProperty("clerkId");
    expect(bootstrap.tourCards[0]).not.toHaveProperty("updatedAt");
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
    const [shell, standings] = await Promise.all([
      t.query(api.functions.tournaments.getTournamentShell, {
        tournamentId: seeded.tournamentId,
      }),
      t.query(api.functions.seasons.getStandingsIndex, {
        seasonId: seeded.seasonId,
      }),
    ]);
    const memberId = String(member._id);
    expect(shell.majorChampionBadgesByMemberId[memberId]).toHaveLength(1);
    expect(standings.majorChampionBadgesByMemberId[memberId]).toHaveLength(1);
    expect(
      shell.majorChampionBadgesByMemberId[memberId]?.[0],
    ).not.toHaveProperty("updatedAt");
  });
});

describe("phase two bounded tournament reads", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("returns scoped leaderboard DTOs and loads team details on demand", async () => {
    const seeded = await seedCompetition(t);
    const owner = await ensureMember(t, "phase-two-owner");
    const { teamId, golferId } = await t.run(async (ctx) => {
      await ctx.db.patch(seeded.tournamentId, {
        status: "active",
        startDate: Date.now() - 60_000,
        dataGolfInPlayLastUpdate: "legacy-marker",
      });
      const cardId = await ctx.db.insert("tourCards", {
        displayName: "Scoped Team",
        memberId: owner.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      const teamId = await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: cardId,
        golferIds: seeded.golferApiIds,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        memberId: owner.member._id,
        displayName: "Scoped Team",
        score: -4,
      });
      const tournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", seeded.tournamentId),
        )
        .first();
      if (!tournamentGolfer) throw new Error("Expected golfer");
      await ctx.db.patch(tournamentGolfer._id, {
        espnRounds: [
          {
            round: 1,
            holes: [{ hole: 1, strokes: 4, relativeToPar: 0 }],
          },
        ],
      });
      await ctx.db.insert("tournamentSyncState", {
        tournamentId: seeded.tournamentId,
        leaderboardLastUpdatedAt: 12345,
        failureCount: 0,
        updatedAt: Date.now(),
      });
      return { teamId, golferId: tournamentGolfer.golferId };
    });

    const shell = await t.query(api.functions.tournaments.getTournamentShell, {
      tournamentId: seeded.tournamentId,
    });
    const pgc = await t.query(api.functions.tournaments.getPgcLeaderboard, {
      tournamentId: seeded.tournamentId,
      tourId: String(seeded.tourId),
      variant: "regular",
    });
    const pga = await owner.authenticated.query(
      api.functions.tournaments.getPgaLeaderboard,
      { tournamentId: seeded.tournamentId },
    );
    const detail = await t.query(api.functions.tournaments.getTeamDetail, {
      teamId,
    });

    expect(shell.tournament?.leaderboardLastUpdatedAt).toBe(12345);
    expect(shell.tournament).not.toHaveProperty("apiId");
    expect(shell.tournament).not.toHaveProperty("dataGolfInPlayLastUpdate");
    expect(pgc.teams).toHaveLength(1);
    expect(pgc.teams[0]).not.toHaveProperty("golferIds");
    expect(pgc.teams[0]).not.toHaveProperty("updatedAt");
    expect(pga.golfers).toHaveLength(10);
    expect(pga.golfers[0]).not.toHaveProperty("espnRounds");
    expect(pga.viewerTeam?.golferIds).toEqual(seeded.golferApiIds);
    expect(detail?.golfers).toHaveLength(10);
    expect(detail?.golferIds).toEqual(seeded.golferApiIds);

    const legacyScorecard = await t.query(
      api.functions.espnGolf.getPlayerHoleScorecard,
      { tournamentId: seeded.tournamentId, golferId },
    );
    expect(legacyScorecard?.rounds[0]?.holes[0]?.strokes).toBe(4);
  });

  it("returns later-playoff non-qualifiers as cut roster rows", async () => {
    const seeded = await seedCompetition(t);
    const owner = await ensureMember(t, "later-playoff-owner");
    const teamId = await t.run(async (ctx) => {
      const tournament = await ctx.db.get(seeded.tournamentId);
      if (!tournament) throw new Error("Expected tournament");
      await ctx.db.patch(tournament.tierId, { name: "Playoff" });
      await ctx.db.insert("tournaments", {
        name: "Playoff opener",
        startDate: tournament.startDate - 14 * 24 * 60 * 60_000,
        endDate: tournament.startDate - 10 * 24 * 60 * 60_000,
        tierId: tournament.tierId,
        courseId: tournament.courseId,
        seasonId: tournament.seasonId,
        status: "completed",
      });
      await ctx.db.patch(tournament._id, {
        name: "Playoff second leg",
        status: "active",
        startDate: Date.now() - 60_000,
      });
      const cardId = await ctx.db.insert("tourCards", {
        displayName: "Four Qualifiers",
        memberId: owner.member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
        playoff: 1,
      });
      const teamId = await ctx.db.insert("teams", {
        tournamentId: tournament._id,
        tourCardId: cardId,
        golferIds: seeded.golferApiIds,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        memberId: owner.member._id,
        displayName: "Four Qualifiers",
        playoff: 1,
      });
      const tournamentGolfers = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .take(10);
      for (const [index, golfer] of tournamentGolfers.slice(0, 4).entries()) {
        await ctx.db.patch(golfer._id, {
          position: `T${index + 1}`,
          roundOneTeeTime: Date.now() + index * 60_000,
        });
      }
      return teamId;
    });

    const detail = await t.query(api.functions.tournaments.getTeamDetail, {
      teamId,
    });

    expect(detail?.golfers).toHaveLength(10);
    expect(
      detail?.golfers.filter((golfer) => golfer.position === "CUT"),
    ).toHaveLength(6);
  });

  it("prefers isolated scorecards while preserving the legacy fallback", async () => {
    const seeded = await seedCompetition(t);
    const golfer = await t.run((ctx) =>
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", seeded.tournamentId),
        )
        .first(),
    );
    if (!golfer) throw new Error("Expected golfer");
    await t.run(async (ctx) => {
      await ctx.db.patch(golfer._id, {
        espnRounds: [
          {
            round: 1,
            holes: [{ hole: 1, strokes: 5, relativeToPar: 1 }],
          },
        ],
      });
      await ctx.db.insert("tournamentGolferScorecards", {
        tournamentId: seeded.tournamentId,
        golferId: golfer.golferId,
        rounds: [
          {
            round: 1,
            holes: [{ hole: 1, strokes: 3, relativeToPar: -1 }],
          },
        ],
        updatedAt: Date.now(),
      });
    });
    const scorecard = await t.query(
      api.functions.espnGolf.getPlayerHoleScorecard,
      { tournamentId: seeded.tournamentId, golferId: golfer.golferId },
    );
    expect(scorecard?.rounds[0]?.holes[0]?.strokes).toBe(3);
  });

  it("returns partial and empty scorecard sets for valid teams", async () => {
    const seeded = await seedCompetition(t);
    const golferIds = await t.run(async (ctx) => {
      const tournamentGolfers = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", seeded.tournamentId),
        )
        .take(10);
      return tournamentGolfers.map((golfer) => golfer.golferId);
    });

    const empty = await t.query(api.functions.espnGolf.getTeamHoleScorecards, {
      tournamentId: seeded.tournamentId,
      golferIds,
    });
    expect(empty).toEqual([]);

    await t.run(async (ctx) => {
      await ctx.db.insert("tournamentGolferScorecards", {
        tournamentId: seeded.tournamentId,
        golferId: golferIds[0]!,
        rounds: [
          {
            round: 1,
            holes: [{ hole: 1, strokes: 3, relativeToPar: -1 }],
          },
        ],
        updatedAt: Date.now(),
      });
    });

    const partial = await t.query(
      api.functions.espnGolf.getTeamHoleScorecards,
      { tournamentId: seeded.tournamentId, golferIds },
    );
    expect(partial).toHaveLength(1);
    expect(partial?.[0]?.rounds[0]?.holes[0]).toMatchObject({
      hole: 1,
      strokes: 3,
      relativeToPar: -1,
    });
  });

  it("does not rewrite a scorecard whose normalized rounds are unchanged", async () => {
    const seeded = await seedCompetition(t);
    const golfer = await t.run((ctx) =>
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", seeded.tournamentId),
        )
        .first(),
    );
    if (!golfer) throw new Error("Expected golfer");

    const first = await t.mutation(
      internal.functions.espnGolf.applyScorecardChunk,
      {
        tournamentId: seeded.tournamentId,
        players: [],
        scorecards: [
          {
            golferId: golfer.golferId,
            rounds: [
              {
                round: 1,
                holes: [
                  { hole: 1, strokes: 4, relativeToPar: 0 },
                  { hole: 2, strokes: 3, relativeToPar: -1 },
                ],
              },
            ],
          },
        ],
        fetchedAt: 100,
      },
    );
    const repeated = await t.mutation(
      internal.functions.espnGolf.applyScorecardChunk,
      {
        tournamentId: seeded.tournamentId,
        players: [],
        scorecards: [
          {
            golferId: golfer.golferId,
            rounds: [
              {
                round: 1,
                holes: [
                  { hole: 2, strokes: 3, relativeToPar: -1 },
                  { hole: 1, strokes: 4, relativeToPar: 0 },
                ],
              },
            ],
          },
        ],
        fetchedAt: 200,
      },
    );
    const stored = await t.run((ctx) =>
      ctx.db
        .query("tournamentGolferScorecards")
        .withIndex("by_golfer_tournament", (q) =>
          q
            .eq("golferId", golfer.golferId)
            .eq("tournamentId", seeded.tournamentId),
        )
        .unique(),
    );

    expect(first.scorecardsUpdated).toBe(1);
    expect(repeated.scorecardsUpdated).toBe(0);
    expect(stored?.updatedAt).toBe(100);
  });

  it("applies golfer and team updates in bounded batches", async () => {
    const seeded = await seedCompetition(t);
    const rows = await t.run((ctx) =>
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", seeded.tournamentId),
        )
        .take(2),
    );
    const golferResult = await t.mutation(
      internal.functions.golfers.applyTournamentGolferUpdatesBatch,
      {
        updates: rows.map((row, index) => ({
          _id: row._id,
          golferId: row.golferId,
          tournamentId: row.tournamentId,
          group: row.group,
          score: index === 0 ? -2 : undefined,
        })),
      },
    );
    expect(golferResult).toEqual({ seen: 2, changed: 1 });

    const { member } = await ensureMember(t, "batch-owner");
    const teamId = await t.run(async (ctx) => {
      const cardId = await ctx.db.insert("tourCards", {
        displayName: "Batch",
        memberId: member._id,
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      return await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: cardId,
        golferIds: seeded.golferApiIds,
        score: 0,
      });
    });
    const teamResult = await t.mutation(
      internal.functions.teams.applyTeamUpdatesBatch,
      {
        updates: [
          { _id: teamId, score: -5 },
          { _id: teamId, score: -5 },
        ],
      },
    );
    expect(teamResult).toEqual({ seen: 2, changed: 1 });
    await expect(
      t.mutation(internal.functions.teams.applyTeamUpdatesBatch, {
        updates: Array.from({ length: 26 }, () => ({ _id: teamId })),
      }),
    ).rejects.toThrow("Batch limit is 25 teams");
  });
});
