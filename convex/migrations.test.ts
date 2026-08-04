/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
type TeamMetadataBackfillPage = FunctionReturnType<
  typeof api.functions.migrations.adminBackfillTeamMetadata
>;

function createTestBackend() {
  return convexTest(schema, modules);
}

describe("team metadata backfill", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("backfills legacy rows from tour cards and is safe to rerun", async () => {
    const seeded = await t.run(async (ctx) => {
      const adminMemberId = await ctx.db.insert("members", {
        clerkId: "migration-admin",
        email: "admin@example.com",
        firstname: "Admin",
        lastname: "Member",
        role: "admin",
        account: 0,
        friends: [],
      });
      const memberId = await ctx.db.insert("members", {
        email: "player@example.com",
        firstname: "Player",
        lastname: "Member",
        role: "regular",
        account: 0,
        friends: [],
      });
      const seasonId = await ctx.db.insert("seasons", {
        year: 2026,
        number: 1,
      });
      const tourId = await ctx.db.insert("tours", {
        name: "Test Tour",
        shortForm: "TEST",
        logoUrl: "https://example.com/tour.png",
        seasonId,
        buyIn: 10_000,
        playoffSpots: [15, 20],
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
        startDate: Date.now(),
        endDate: Date.now() + 1,
        tierId,
        courseId,
        seasonId,
      });
      const tourCardId = await ctx.db.insert("tourCards", {
        displayName: "Canonical Name",
        tourId,
        seasonId,
        memberId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
        playoff: 1,
      });
      const legacyTeamId = await ctx.db.insert("teams", {
        tournamentId,
        tourCardId,
        golferIds: [1],
      });
      const staleTeamId = await ctx.db.insert("teams", {
        tournamentId,
        tourCardId,
        golferIds: [2],
        seasonId,
        tourId,
        memberId,
        displayName: "Stale Name",
        playoff: 2,
      });
      await ctx.db.insert("teams", {
        tournamentId,
        tourCardId,
        golferIds: [3],
        seasonId,
        tourId,
        memberId,
        displayName: "Canonical Name",
        playoff: 1,
      });
      const deletedTourCardId = await ctx.db.insert("tourCards", {
        displayName: "Deleted Card",
        tourId,
        seasonId,
        memberId,
        earnings: 0,
        points: 0,
        topTen: 0,
        madeCut: 0,
        appearances: 0,
      });
      await ctx.db.insert("teams", {
        tournamentId,
        tourCardId: deletedTourCardId,
        golferIds: [4],
      });
      await ctx.db.delete(deletedTourCardId);

      return { adminMemberId, legacyTeamId, staleTeamId };
    });

    expect(seeded.adminMemberId).toBeDefined();
    const admin = t.withIdentity({ subject: "migration-admin" });

    const runAllPages = async () => {
      let cursor: string | null = null;
      const totals = {
        scanned: 0,
        updated: 0,
        unchanged: 0,
        missingTourCards: 0,
      };
      do {
        const page: TeamMetadataBackfillPage = await admin.mutation(
          api.functions.migrations.adminBackfillTeamMetadata,
          { cursor, limit: 2 },
        );
        totals.scanned += page.scanned;
        totals.updated += page.updated;
        totals.unchanged += page.unchanged;
        totals.missingTourCards += page.missingTourCards;
        cursor = page.isDone ? null : page.continueCursor;
        if (page.isDone) break;
      } while (cursor);
      return totals;
    };

    expect(await runAllPages()).toEqual({
      scanned: 4,
      updated: 2,
      unchanged: 1,
      missingTourCards: 1,
    });

    const repaired = await t.run(async (ctx) => ({
      legacy: await ctx.db.get(seeded.legacyTeamId),
      stale: await ctx.db.get(seeded.staleTeamId),
    }));
    expect(repaired.legacy).toMatchObject({
      displayName: "Canonical Name",
      playoff: 1,
    });
    expect(repaired.legacy?.seasonId).toBeDefined();
    expect(repaired.legacy?.tourId).toBeDefined();
    expect(repaired.legacy?.memberId).toBeDefined();
    expect(repaired.stale).toMatchObject({
      displayName: "Canonical Name",
      playoff: 1,
    });

    const runAllInternalPages = async () => {
      let cursor: string | null = null;
      const totals = {
        scanned: 0,
        updated: 0,
        unchanged: 0,
        missingTourCards: 0,
      };
      do {
        const page: TeamMetadataBackfillPage = await t.mutation(
          internal.functions.migrations.backfillTeamMetadataPageInternal,
          { cursor, limit: 2 },
        );
        totals.scanned += page.scanned;
        totals.updated += page.updated;
        totals.unchanged += page.unchanged;
        totals.missingTourCards += page.missingTourCards;
        cursor = page.isDone ? null : page.continueCursor;
        if (page.isDone) break;
      } while (cursor);
      return totals;
    };

    expect(await runAllInternalPages()).toEqual({
      scanned: 4,
      updated: 0,
      unchanged: 3,
      missingTourCards: 1,
    });

    const cleanup = await t.mutation(
      internal.functions.migrations.cleanupOrphanedTeamsPageInternal,
      { cursor: null, limit: 10, deleteRows: true },
    );
    expect(cleanup).toMatchObject({
      scanned: 4,
      orphaned: 1,
      deleted: 1,
      isDone: true,
    });
    const deletionAudit = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "deleted"))
        .unique(),
    );
    expect(deletionAudit).toMatchObject({
      entityType: "team",
      action: "deleted",
      changes: {
        reason: "orphaned_tour_card",
      },
    });
  });

  it("requires an administrator", async () => {
    await expect(
      t.mutation(api.functions.migrations.adminBackfillTeamMetadata, {
        cursor: null,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("rebuilds an overbooked tour's exact registered count", async () => {
    const tourId = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("members", {
        email: "overbooked@example.com",
        firstname: "Over",
        lastname: "Booked",
        role: "regular",
        account: 0,
        friends: [],
      });
      const seasonId = await ctx.db.insert("seasons", {
        year: 2026,
        number: 1,
      });
      const id = await ctx.db.insert("tours", {
        name: "Overbooked Tour",
        shortForm: "OVER",
        logoUrl: "https://example.com/tour.png",
        seasonId,
        buyIn: 10_000,
        playoffSpots: [15, 20],
        maxParticipants: 2,
        registeredCount: 0,
      });
      for (let index = 0; index < 3; index += 1) {
        await ctx.db.insert("tourCards", {
          displayName: `Player ${index}`,
          tourId: id,
          seasonId,
          memberId,
          earnings: 0,
          points: 0,
          topTen: 0,
          madeCut: 0,
          appearances: 0,
        });
      }
      return id;
    });

    const result = await t.mutation(
      internal.functions.readModels.rebuildReadModelsPageInternal,
      { cursor: null, limit: 10 },
    );
    expect(result.isDone).toBe(true);
    expect(
      await t.run(async (ctx) => (await ctx.db.get(tourId))?.registeredCount),
    ).toBe(3);
  });
});
