/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  return convexTest(schema, modules);
}

async function createMember(
  t: ReturnType<typeof createTestBackend>,
  subject: string,
) {
  const memberId = await t.run((ctx) =>
    ctx.db.insert("members", {
      clerkId: subject,
      email: `${subject}@example.com`,
      firstname: subject,
      lastname: "Member",
      role: "regular",
      account: 0,
      friends: [],
    }),
  );
  return {
    memberId,
    authenticated: t.withIdentity({
      subject,
      email: `${subject}@example.com`,
      email_verified: true,
    }),
  };
}

async function seedSeason(
  t: ReturnType<typeof createTestBackend>,
  args?: {
    tournamentStatus?: "upcoming" | "active" | "completed";
    tierName?: string;
    startDate?: number;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const seasonId = await ctx.db.insert("seasons", {
      year: 2026,
      number: 1,
      startDate: now - 30 * 86_400_000,
      endDate: now + 30 * 86_400_000,
    });
    const tourId = await ctx.db.insert("tours", {
      name: "Alpha Tour",
      shortForm: "ALP",
      logoUrl: "https://example.com/alpha.png",
      seasonId,
      buyIn: 10_000,
      playoffSpots: [1, 1],
      maxParticipants: 75,
    });
    const otherTourId = await ctx.db.insert("tours", {
      name: "Beta Tour",
      shortForm: "BET",
      logoUrl: "https://example.com/beta.png",
      seasonId,
      buyIn: 10_000,
      playoffSpots: [1, 1],
      maxParticipants: 75,
    });
    const tierId = await ctx.db.insert("tiers", {
      name: args?.tierName ?? "Standard",
      seasonId,
      payouts: [],
      points: [],
    });
    const courseId = await ctx.db.insert("courses", {
      apiId: "pulse-course",
      name: "Pulse Course",
      location: "Test",
      par: 72,
      front: 36,
      back: 36,
      timeZoneOffset: 0,
    });
    const startDate =
      args?.startDate ??
      (args?.tournamentStatus === "active"
        ? now - 86_400_000
        : now + 86_400_000);
    const tournamentId = await ctx.db.insert("tournaments", {
      name: "Pulse Open",
      startDate,
      endDate: startDate + 4 * 86_400_000,
      tierId,
      courseId,
      seasonId,
      status: args?.tournamentStatus ?? "upcoming",
    });
    return { seasonId, tourId, otherTourId, tournamentId, tierId };
  });
}

async function insertCard(
  t: ReturnType<typeof createTestBackend>,
  args: {
    memberId: Id<"members">;
    seasonId: Id<"seasons">;
    tourId: Id<"tours">;
    name: string;
    points?: number;
    playoff?: number;
  },
) {
  return await t.run((ctx) =>
    ctx.db.insert("tourCards", {
      displayName: args.name,
      memberId: args.memberId,
      seasonId: args.seasonId,
      tourId: args.tourId,
      earnings: 0,
      points: args.points ?? 0,
      wins: 0,
      topTen: 0,
      topFive: 0,
      madeCut: 0,
      appearances: 0,
      playoff: args.playoff,
    }),
  );
}

async function insertStanding(
  t: ReturnType<typeof createTestBackend>,
  args: {
    memberId: Id<"members">;
    seasonId: Id<"seasons">;
    tourId: Id<"tours">;
    cardId: Id<"tourCards">;
    name: string;
    points: number;
    rank?: number;
  },
) {
  await t.run((ctx) =>
    ctx.db.insert("standingsRows", {
      seasonId: args.seasonId,
      tourId: args.tourId,
      tourCardId: args.cardId,
      memberId: args.memberId,
      displayName: args.name,
      variant: "regular",
      points: args.points,
      earnings: 0,
      wins: 0,
      topFive: 0,
      topTen: 0,
      madeCut: 0,
      appearances: 1,
      pastPoints: 0,
      rank: args.rank ?? 1,
      currentPosition: String(args.rank ?? 1),
      playoff: 0,
      posChange: 0,
      posChangePO: 0,
      updatedAt: Date.now(),
    }),
  );
}

describe("viewer Clubhouse Pulse read model", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("returns explicit signed-out, missing-member, and no-card states", async () => {
    expect(
      await t.query(api.functions.home.getViewerClubhousePulse, {}),
    ).toEqual({ kind: "signed_out" });
    const missing = t.withIdentity({ subject: "missing" });
    expect(
      await missing.query(api.functions.home.getViewerClubhousePulse, {}),
    ).toEqual({ kind: "missing_member" });

    const seeded = await seedSeason(t);
    const viewer = await createMember(t, "viewer-no-card");
    await t.run((ctx) =>
      ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        nextTournamentId: seeded.tournamentId,
        seasonPhase: "in-season",
        publicVersion: 1,
        updatedAt: Date.now(),
      }),
    );
    const result = await viewer.authenticated.query(
      api.functions.home.getViewerClubhousePulse,
      {},
    );
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.cards).toEqual([]);
  });

  it("isolates active regular data to the viewer's tours and strips rosters", async () => {
    const seeded = await seedSeason(t, { tournamentStatus: "active" });
    const viewer = await createMember(t, "active-viewer");
    const other = await createMember(t, "active-other");
    const viewerCard = await insertCard(t, {
      memberId: viewer.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.tourId,
      name: "Viewer",
      points: 100,
    });
    const otherTourCard = await insertCard(t, {
      memberId: other.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.otherTourId,
      name: "Other tour",
      points: 80,
    });
    await insertStanding(t, {
      memberId: viewer.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.tourId,
      cardId: viewerCard,
      name: "Viewer",
      points: 100,
    });
    await insertStanding(t, {
      memberId: other.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.otherTourId,
      cardId: otherTourCard,
      name: "Other tour",
      points: 80,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: viewerCard,
        golferIds: [101, 102],
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        memberId: viewer.memberId,
        displayName: "Viewer",
        position: "1",
        score: -8,
        points: 50,
      });
      await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: otherTourCard,
        golferIds: [201, 202],
        seasonId: seeded.seasonId,
        tourId: seeded.otherTourId,
        memberId: other.memberId,
        displayName: "Other tour",
        position: "1",
        score: -10,
        points: 60,
      });
      await ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        activeTournamentId: seeded.tournamentId,
        seasonPhase: "in-season",
        publicVersion: 1,
        updatedAt: Date.now(),
      });
    });
    const result = await viewer.authenticated.query(
      api.functions.home.getViewerClubhousePulse,
      {},
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.cards).toHaveLength(1);
    expect(result.standingsByTour).toHaveLength(1);
    expect(String(result.standingsByTour[0]?.tourId)).toBe(
      String(seeded.tourId),
    );
    expect(result.activeCompetitions).toHaveLength(1);
    expect(result.activeCompetitions[0]?.teams).toHaveLength(1);
    expect(result.activeCompetitions[0]?.teams[0]).not.toHaveProperty(
      "golferIds",
    );
  });

  it("keeps Gold and Silver playoff brackets isolated", async () => {
    const seeded = await seedSeason(t, {
      tournamentStatus: "active",
      tierName: "Playoff",
    });
    const viewer = await createMember(t, "gold-viewer");
    const other = await createMember(t, "silver-other");
    const goldCard = await insertCard(t, {
      memberId: viewer.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.tourId,
      name: "Gold",
      playoff: 1,
    });
    const silverCard = await insertCard(t, {
      memberId: other.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.tourId,
      name: "Silver",
      playoff: 2,
    });
    await t.run(async (ctx) => {
      for (const [cardId, memberId, playoff] of [
        [goldCard, viewer.memberId, 1],
        [silverCard, other.memberId, 2],
      ] as const) {
        await ctx.db.insert("teams", {
          tournamentId: seeded.tournamentId,
          tourCardId: cardId,
          golferIds: [1],
          seasonId: seeded.seasonId,
          tourId: seeded.tourId,
          memberId,
          displayName: playoff === 1 ? "Gold" : "Silver",
          playoff,
          position: "1",
          score: -5,
        });
      }
      await ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        activeTournamentId: seeded.tournamentId,
        seasonPhase: "in-season",
        publicVersion: 1,
        updatedAt: Date.now(),
      });
    });
    const result = await viewer.authenticated.query(
      api.functions.home.getViewerClubhousePulse,
      {},
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.activeCompetitions.map((item) => item.key)).toEqual([
      "playoff:1",
    ]);
    expect(result.activeCompetitions[0]?.teams[0]?.playoff).toBe(1);
  });

  it("reports pick-window roster presence without exposing either roster", async () => {
    const seeded = await seedSeason(t, { startDate: Date.now() + 86_400_000 });
    const viewer = await createMember(t, "picks-viewer");
    const firstCard = await insertCard(t, {
      memberId: viewer.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.tourId,
      name: "First",
    });
    await insertCard(t, {
      memberId: viewer.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.otherTourId,
      name: "Second",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("teams", {
        tournamentId: seeded.tournamentId,
        tourCardId: firstCard,
        golferIds: [999, 1000],
        seasonId: seeded.seasonId,
        tourId: seeded.tourId,
        memberId: viewer.memberId,
        displayName: "First",
      });
      await ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        nextTournamentId: seeded.tournamentId,
        pickWindowTournamentId: seeded.tournamentId,
        pickWindowOpensAt: Date.now() - 1_000,
        pickWindowClosesAt: Date.now() + 86_400_000,
        seasonPhase: "in-season",
        publicVersion: 1,
        updatedAt: Date.now(),
      });
    });
    const result = await viewer.authenticated.query(
      api.functions.home.getViewerClubhousePulse,
      {},
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.cards.map((card) => card.hasPickWindowTeam)).toEqual([
      true,
      false,
    ]);
    expect(JSON.stringify(result)).not.toContain("golferIds");
    expect(JSON.stringify(result)).not.toContain("999");
  });

  it("selects the latest completed contribution and skips cancelled results", async () => {
    const seeded = await seedSeason(t);
    const viewer = await createMember(t, "history-viewer");
    const cardId = await insertCard(t, {
      memberId: viewer.memberId,
      seasonId: seeded.seasonId,
      tourId: seeded.tourId,
      name: "History",
    });
    const now = Date.now();
    await t.run(async (ctx) => {
      for (const item of [
        {
          name: "Completed",
          start: now - 20_000,
          status: "completed" as const,
        },
        {
          name: "Cancelled",
          start: now - 10_000,
          status: "cancelled" as const,
        },
      ]) {
        await ctx.db.insert("standingsContributions", {
          seasonId: seeded.seasonId,
          tourId: seeded.tourId,
          tourCardId: cardId,
          tournamentId: seeded.tournamentId,
          memberId: viewer.memberId,
          displayName: "History",
          tournamentName: item.name,
          tournamentStartDate: item.start,
          tournamentEndDate: item.start + 1_000,
          tournamentStatus: item.status,
          tierId: seeded.tierId,
          tierName: "Standard",
          isPlayoff: false,
          points: 10,
          updatedAt: now,
        });
      }
      await ctx.db.insert("appState", {
        key: "primary",
        currentSeasonId: seeded.seasonId,
        nextTournamentId: seeded.tournamentId,
        seasonPhase: "in-season",
        publicVersion: 1,
        updatedAt: now,
      });
    });
    const result = await viewer.authenticated.query(
      api.functions.home.getViewerClubhousePulse,
      {},
    );
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.cards[0]?.latestResult?.tournament.name).toBe("Completed");
    }
  });
});
