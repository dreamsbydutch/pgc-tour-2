import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import { getCurrentMember } from "../utils/auth";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  publishNotifications,
} from "../utils/notifications";

const categoryFields = {
  leagueUpdates: v.boolean(),
  pickReminders: v.boolean(),
  finalResults: v.boolean(),
  teamMoments: v.boolean(),
  financial: v.boolean(),
  milestones: v.boolean(),
};

export const getMyCenter = query({
  args: {},
  handler: async (ctx) => {
    const member = await getCurrentMember(ctx);
    const [items, unread] = await Promise.all([
      ctx.db
        .query("notifications")
        .withIndex("by_member_created_at", (query) =>
          query.eq("memberId", member._id),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("notifications")
        .withIndex("by_member_read_at", (query) =>
          query.eq("memberId", member._id).eq("readAt", undefined),
        )
        .take(100),
    ]);
    return {
      items: items.map((item) => ({
        _id: item._id,
        category: item.category,
        title: item.title,
        body: item.body,
        href: item.href,
        readAt: item.readAt,
        createdAt: item.createdAt,
      })),
      unreadCount: unread.length,
    };
  },
});

export const getMyPreferences = query({
  args: {},
  handler: async (ctx) => {
    const member = await getCurrentMember(ctx);
    const [preferences, subscriptions] = await Promise.all([
      getNotificationPreferences(ctx, member._id),
      ctx.db
        .query("pushSubscriptions")
        .withIndex("by_member", (query) => query.eq("memberId", member._id))
        .take(20),
    ]);
    return {
      preferences,
      subscribedDeviceCount: subscriptions.filter(
        (subscription) => subscription.enabled !== false,
      ).length,
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? "",
    };
  },
});

export const updateMyPreferences = mutation({
  args: categoryFields,
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_member", (query) => query.eq("memberId", member._id))
      .unique();
    const value = { ...args, memberId: member._id, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("notificationPreferences", value);
    return args;
  },
});

export const registerPushSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    const endpoint = args.endpoint.trim();
    if (!endpoint.startsWith("https://") || endpoint.length > 4096) {
      throw new Error("Invalid push endpoint");
    }
    if (
      args.p256dh.length < 16 ||
      args.p256dh.length > 512 ||
      args.auth.length < 8 ||
      args.auth.length > 512
    ) {
      throw new Error("Invalid push subscription keys");
    }
    const existingForEndpoint = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (query) => query.eq("endpoint", endpoint))
      .take(20);
    const now = Date.now();
    const owned = existingForEndpoint.find(
      (subscription) => subscription.memberId === member._id,
    );
    for (const subscription of existingForEndpoint) {
      if (subscription._id !== owned?._id)
        await ctx.db.delete(subscription._id);
    }
    const value = {
      memberId: member._id,
      endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent?.slice(0, 500),
      enabled: true,
      failureCount: 0,
      updatedAt: now,
    };
    const subscriptionId = owned
      ? owned._id
      : await ctx.db.insert("pushSubscriptions", value);
    if (owned) await ctx.db.patch(owned._id, value);
    return { subscriptionId };
  },
});

export const unregisterPushSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_member_endpoint", (query) =>
        query.eq("memberId", member._id).eq("endpoint", args.endpoint),
      )
      .take(10);
    for (const subscription of subscriptions) {
      await ctx.db.delete(subscription._id);
    }
    return { removed: subscriptions.length };
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.memberId !== member._id) {
      throw new Error("Notification not found");
    }
    if (!notification.readAt) {
      await ctx.db.patch(notification._id, { readAt: Date.now() });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const member = await getCurrentMember(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_member_read_at", (query) =>
        query.eq("memberId", member._id).eq("readAt", undefined),
      )
      .take(500);
    const now = Date.now();
    for (const item of unread) await ctx.db.patch(item._id, { readAt: now });
    return { updated: unread.length };
  },
});

export const publishWeeklyRecap = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    memberIds: v.array(v.id("members")),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    return await publishNotifications(ctx, {
      dedupeKey: `weekly-recap:${tournament._id}`,
      category: "leagueUpdates",
      tournamentId: tournament._id,
      recipients: args.memberIds.map((memberId) => ({
        memberId,
        title: "The weekly PGC recap is ready",
        body: `${tournament.name} is next. Catch up and review the field.`,
        href: `/tournament?tournamentId=${tournament._id}`,
      })),
    });
  },
});

export const publishDuePickReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const upcoming = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (query) => query.eq("status", "upcoming"))
      .take(100);
    let created = 0;
    for (const tournament of upcoming) {
      const course = await ctx.db.get(tournament.courseId);
      if (!course) continue;
      const reminderAt = getPickReminderAt(
        tournament.startDate,
        course.timeZoneOffset,
      );
      if (now < reminderAt || now >= tournament.startDate) continue;
      const [teams, cards, tier] = await Promise.all([
        ctx.db
          .query("teams")
          .withIndex("by_tournament", (query) =>
            query.eq("tournamentId", tournament._id),
          )
          .take(500),
        ctx.db
          .query("tourCards")
          .withIndex("by_season", (query) =>
            query.eq("seasonId", tournament.seasonId),
          )
          .take(500),
        ctx.db.get(tournament.tierId),
      ]);
      if (tier?.name.trim().toLowerCase() === "playoff") {
        const playoffTournaments = (
          await ctx.db
            .query("tournaments")
            .withIndex("by_tier", (query) =>
              query.eq("tierId", tournament.tierId),
            )
            .take(100)
        ).sort((a, b) => a.startDate - b.startDate);
        if (playoffTournaments[0]?._id !== tournament._id) continue;
      }
      const submitted = new Set(teams.map((team) => String(team.tourCardId)));
      const missingByMember = new Map<string, (typeof cards)[number]>();
      for (const card of cards) {
        if (!submitted.has(String(card._id))) {
          missingByMember.set(String(card.memberId), card);
        }
      }
      const result = await publishNotifications(ctx, {
        dedupeKey: `pick-reminder:${tournament._id}`,
        category: "pickReminders",
        tournamentId: tournament._id,
        recipients: [...missingByMember.values()].map((card) => ({
          memberId: card.memberId,
          title: `Picks are due tomorrow`,
          body: `Your ${tournament.name} roster is still missing.`,
          href: `/tournament?tournamentId=${tournament._id}`,
        })),
      });
      if (result.created) created += result.notifications;
    }
    return { created };
  },
});

export function getPickReminderAt(startDate: number, offsetMs: number) {
  const localStart = new Date(startDate + offsetMs);
  const reminderLocal = Date.UTC(
    localStart.getUTCFullYear(),
    localStart.getUTCMonth(),
    localStart.getUTCDate() - 1,
    19,
    0,
    0,
    0,
  );
  return reminderLocal - offsetMs;
}

export const publishFinalResults = internalMutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament || tournament.status !== "completed") {
      return { created: false, reason: "not_completed" } as const;
    }
    const [teams, tier] = await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (query) =>
          query.eq("tournamentId", tournament._id),
        )
        .take(500),
      ctx.db.get(tournament.tierId),
    ]);
    const resultsByMember = new Map<
      string,
      {
        memberId: NonNullable<(typeof teams)[number]["memberId"]>;
        teams: (typeof teams)[number][];
      }
    >();
    for (const team of teams) {
      const memberId =
        team.memberId ?? (await ctx.db.get(team.tourCardId))?.memberId;
      if (!memberId) continue;
      const key = String(memberId);
      const existing = resultsByMember.get(key);
      if (existing) existing.teams.push(team);
      else resultsByMember.set(key, { memberId, teams: [team] });
    }
    const finalResult = await publishNotifications(ctx, {
      dedupeKey: `final-results:${tournament._id}`,
      category: "finalResults",
      tournamentId: tournament._id,
      recipients: [...resultsByMember.values()].map((result) => ({
        memberId: result.memberId,
        title: `${tournament.name} results are final`,
        body: result.teams
          .map((team) =>
            [
              team.displayName ? `${team.displayName}:` : null,
              team.position ?? "Finished",
              typeof team.points === "number" ? `${team.points} pts` : null,
            ]
              .filter(Boolean)
              .join(" "),
          )
          .join(" | "),
        href: `/tournament?tournamentId=${tournament._id}`,
      })),
    });
    const milestoneRecipients = [];
    for (const team of teams.filter((item) => {
      const position = item.position?.trim().toUpperCase();
      return position === "1" || position === "T1";
    })) {
      const memberId =
        team.memberId ?? (await ctx.db.get(team.tourCardId))?.memberId;
      if (!memberId) continue;
      milestoneRecipients.push({
        memberId,
        title:
          tier?.name.trim().toLowerCase() === "major"
            ? "Major champion"
            : "Tournament winner",
        body: `Your ${tournament.name} victory is official.`,
        href: `/tournament?tournamentId=${tournament._id}`,
      });
    }
    const milestoneResult = await publishNotifications(ctx, {
      dedupeKey: `winner-milestone:${tournament._id}`,
      category: "milestones",
      tournamentId: tournament._id,
      recipients: milestoneRecipients,
    });
    return {
      created: finalResult.created || milestoneResult.created,
      notifications: finalResult.notifications + milestoneResult.notifications,
    } as const;
  },
});

export const claimPendingDeliveries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_status_next_attempt", (query) =>
        query.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .take(50);
    const claimed = [];
    for (const delivery of pending) {
      const [notification, subscription, preferences] = await Promise.all([
        ctx.db.get(delivery.notificationId),
        ctx.db.get(delivery.subscriptionId),
        getNotificationPreferences(ctx, delivery.memberId),
      ]);
      if (
        !notification ||
        !subscription ||
        subscription.enabled === false ||
        !preferences[notification.category]
      ) {
        await ctx.db.patch(delivery._id, {
          status: "skipped",
          updatedAt: now,
        });
        continue;
      }
      const leaseToken = crypto.randomUUID();
      await ctx.db.patch(delivery._id, {
        status: "processing",
        leaseToken,
        leaseExpiresAt: now + 5 * 60_000,
        attempts: delivery.attempts + 1,
        updatedAt: now,
      });
      claimed.push({
        deliveryId: delivery._id,
        leaseToken,
        attempts: delivery.attempts + 1,
        notification: {
          id: notification._id,
          title: notification.title,
          body: notification.body,
          href: notification.href,
          category: notification.category,
        },
        subscription: {
          id: subscription._id,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      });
    }
    return claimed;
  },
});

export const finalizeDelivery = internalMutation({
  args: {
    deliveryId: v.id("notificationDeliveries"),
    leaseToken: v.string(),
    outcome: v.union(
      v.literal("sent"),
      v.literal("expired"),
      v.literal("retry"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (
      !delivery ||
      delivery.status !== "processing" ||
      delivery.leaseToken !== args.leaseToken
    ) {
      return { updated: false };
    }
    const now = Date.now();
    if (args.outcome === "sent") {
      await ctx.db.patch(delivery._id, {
        status: "sent",
        sentAt: now,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastError: undefined,
        updatedAt: now,
      });
      const subscription = await ctx.db.get(delivery.subscriptionId);
      if (subscription) {
        await ctx.db.patch(subscription._id, {
          failureCount: 0,
          lastSuccessAt: now,
          updatedAt: now,
        });
      }
      return { updated: true };
    }
    if (args.outcome === "expired") {
      const subscription = await ctx.db.get(delivery.subscriptionId);
      if (subscription) await ctx.db.delete(subscription._id);
      await ctx.db.patch(delivery._id, {
        status: "failed",
        lastError: "Subscription expired",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      return { updated: true };
    }
    if (args.outcome === "retry" && delivery.attempts < 3) {
      await ctx.db.patch(delivery._id, {
        status: "pending",
        nextAttemptAt: now + 2 ** delivery.attempts * 60_000,
        lastError: args.error?.slice(0, 500),
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        2 ** delivery.attempts * 60_000,
        internal.functions.pushDelivery.deliverPending,
        {},
      );
      return { updated: true };
    }
    await ctx.db.patch(delivery._id, {
      status: "failed",
      lastError: args.error?.slice(0, 500),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    return { updated: true };
  },
});

export const repairDeliveries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const processing = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_status_next_attempt", (query) =>
        query.eq("status", "processing"),
      )
      .take(100);
    let repaired = 0;
    for (const delivery of processing) {
      if ((delivery.leaseExpiresAt ?? 0) > now) continue;
      await ctx.db.patch(delivery._id, {
        status: "pending",
        nextAttemptAt: now,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      repaired += 1;
    }
    const due = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_status_next_attempt", (query) =>
        query.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .first();
    if (due) {
      await ctx.scheduler.runAfter(
        0,
        internal.functions.pushDelivery.deliverPending,
        {},
      );
    }
    return { repaired, scheduled: Boolean(due) };
  },
});

export { DEFAULT_NOTIFICATION_PREFERENCES };
