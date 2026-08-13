/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { getPickReminderAt } from "./functions/notifications";
import { detectTeamMoment } from "./utils/notifications";

const modules = import.meta.glob("./**/*.ts");

function createTestBackend() {
  return convexTest(schema, modules);
}

async function createMember(
  t: ReturnType<typeof createTestBackend>,
  subject: string,
) {
  const authenticated = t.withIdentity({
    subject,
    email: `${subject}@example.com`,
    email_verified: true,
  });
  const member = await authenticated.mutation(
    api.functions.members.ensureCurrentMember,
    {},
  );
  if (!member) throw new Error("Expected member");
  return { authenticated, memberId: member._id };
}

describe("notifications", () => {
  let t: ReturnType<typeof createTestBackend>;

  beforeEach(() => {
    t = createTestBackend();
  });

  it("defaults preferences on and isolates each member's inbox", async () => {
    const owner = await createMember(t, "notification-owner");
    const other = await createMember(t, "notification-other");
    const tournamentId = await seedTournament(t);

    const defaults = await owner.authenticated.query(
      api.functions.notifications.getMyPreferences,
      {},
    );
    expect(defaults.preferences).toEqual({
      leagueUpdates: true,
      pickReminders: true,
      finalResults: true,
      teamMoments: true,
      financial: true,
      milestones: true,
    });

    await t.mutation(internal.functions.notifications.publishWeeklyRecap, {
      tournamentId,
      memberIds: [owner.memberId],
    });
    const ownerCenter = await owner.authenticated.query(
      api.functions.notifications.getMyCenter,
      {},
    );
    const otherCenter = await other.authenticated.query(
      api.functions.notifications.getMyCenter,
      {},
    );
    expect(ownerCenter.unreadCount).toBe(1);
    expect(ownerCenter.items[0]?.category).toBe("leagueUpdates");
    expect(otherCenter.items).toEqual([]);

    await owner.authenticated.mutation(api.functions.notifications.markRead, {
      notificationId: ownerCenter.items[0]._id,
    });
    expect(
      (
        await owner.authenticated.query(
          api.functions.notifications.getMyCenter,
          {},
        )
      ).unreadCount,
    ).toBe(0);
  });

  it("deduplicates events and honors disabled push categories", async () => {
    const owner = await createMember(t, "notification-preference");
    const tournamentId = await seedTournament(t);
    await owner.authenticated.mutation(
      api.functions.notifications.registerPushSubscription,
      {
        endpoint: "https://push.example.com/subscription-one",
        p256dh: "a".repeat(65),
        auth: "b".repeat(16),
      },
    );
    await owner.authenticated.mutation(
      api.functions.notifications.updateMyPreferences,
      {
        leagueUpdates: false,
        pickReminders: true,
        finalResults: true,
        teamMoments: true,
        financial: true,
        milestones: true,
      },
    );
    await t.mutation(internal.functions.notifications.publishWeeklyRecap, {
      tournamentId,
      memberIds: [owner.memberId],
    });
    await t.mutation(internal.functions.notifications.publishWeeklyRecap, {
      tournamentId,
      memberIds: [owner.memberId],
    });
    const state = await t.run(async (ctx) => ({
      events: await ctx.db.query("notificationEvents").collect(),
      notifications: await ctx.db.query("notifications").collect(),
      deliveries: await ctx.db.query("notificationDeliveries").collect(),
    }));
    expect(state.events).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
    expect(state.deliveries).toHaveLength(0);
  });

  it("reassigns a browser endpoint to the latest signed-in member", async () => {
    const first = await createMember(t, "push-first");
    const second = await createMember(t, "push-second");
    const subscription = {
      endpoint: "https://push.example.com/shared-browser",
      p256dh: "a".repeat(65),
      auth: "b".repeat(16),
    };
    await first.authenticated.mutation(
      api.functions.notifications.registerPushSubscription,
      subscription,
    );
    await second.authenticated.mutation(
      api.functions.notifications.registerPushSubscription,
      subscription,
    );
    const subscriptions = await t.run((ctx) =>
      ctx.db.query("pushSubscriptions").collect(),
    );
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.memberId).toBe(second.memberId);
  });
});

describe("notification timing and moment rules", () => {
  it("schedules the reminder for 7pm course-local time the day before", () => {
    const start = Date.UTC(2026, 7, 13, 12);
    const easternOffset = -4 * 60 * 60 * 1000;
    expect(getPickReminderAt(start, easternOffset)).toBe(
      Date.UTC(2026, 7, 12, 23),
    );
  });

  it("detects leads, top-five entries, and one large-jump key per round", () => {
    expect(
      detectTeamMoment({
        beforePosition: "4",
        afterPosition: "1",
        round: 3,
      }),
    ).toMatchObject({ key: "lead:r3" });
    expect(
      detectTeamMoment({
        beforePosition: "9",
        afterPosition: "4",
        round: 2,
      }),
    ).toMatchObject({ key: "top-five:r2" });
    expect(
      detectTeamMoment({
        beforePosition: "18",
        afterPosition: "11",
        round: 1,
      }),
    ).toMatchObject({ key: "jump:r1" });
    expect(
      detectTeamMoment({
        beforePosition: "4",
        afterPosition: "3",
        round: 1,
      }),
    ).toBeNull();
  });
});

async function seedTournament(t: ReturnType<typeof createTestBackend>) {
  return await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", {
      year: 2026,
      number: 1,
    });
    const tierId = await ctx.db.insert("tiers", {
      name: "Standard",
      seasonId,
      payouts: [],
      points: [],
    });
    const courseId = await ctx.db.insert("courses", {
      apiId: "notifications-course",
      name: "Notifications Course",
      location: "Test",
      par: 72,
      front: 36,
      back: 36,
      timeZoneOffset: 0,
    });
    return await ctx.db.insert("tournaments", {
      name: "Notifications Open",
      startDate: Date.now() + 86_400_000,
      endDate: Date.now() + 5 * 86_400_000,
      tierId,
      courseId,
      seasonId,
      status: "upcoming",
    });
  });
}
