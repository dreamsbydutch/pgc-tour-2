import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type {
  NotificationCategory,
  NotificationPreferenceValues,
  NotificationRecipient,
} from "../types/notifications";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceValues = {
  leagueUpdates: true,
  pickReminders: true,
  finalResults: true,
  teamMoments: true,
  financial: true,
  milestones: true,
};

export async function getNotificationPreferences(
  ctx: QueryCtx | MutationCtx,
  memberId: Id<"members">,
): Promise<NotificationPreferenceValues> {
  const preferences = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_member", (query) => query.eq("memberId", memberId))
    .unique();
  if (!preferences) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    leagueUpdates: preferences.leagueUpdates,
    pickReminders: preferences.pickReminders,
    finalResults: preferences.finalResults,
    teamMoments: preferences.teamMoments,
    financial: preferences.financial,
    milestones: preferences.milestones,
  };
}

export async function publishNotifications(
  ctx: MutationCtx,
  args: {
    dedupeKey: string;
    category: NotificationCategory;
    recipients: NotificationRecipient[];
    tournamentId?: Id<"tournaments">;
    settlementRequestId?: Id<"settlementRequests">;
  },
) {
  const existing = await ctx.db
    .query("notificationEvents")
    .withIndex("by_dedupe_key", (query) =>
      query.eq("dedupeKey", args.dedupeKey),
    )
    .unique();
  if (existing) {
    return { eventId: existing._id, created: false, notifications: 0 };
  }

  const now = Date.now();
  const eventId = await ctx.db.insert("notificationEvents", {
    dedupeKey: args.dedupeKey,
    category: args.category,
    tournamentId: args.tournamentId,
    settlementRequestId: args.settlementRequestId,
    createdAt: now,
  });
  const recipients = new Map(
    args.recipients.map((recipient) => [String(recipient.memberId), recipient]),
  );
  let deliveryCount = 0;

  for (const recipient of recipients.values()) {
    const notificationId = await ctx.db.insert("notifications", {
      eventId,
      memberId: recipient.memberId,
      category: args.category,
      title: recipient.title.slice(0, 120),
      body: recipient.body.slice(0, 500),
      href: normalizeNotificationHref(recipient.href),
      createdAt: now,
    });
    const preferences = await getNotificationPreferences(
      ctx,
      recipient.memberId,
    );
    if (!preferences[args.category]) continue;
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_member", (query) =>
        query.eq("memberId", recipient.memberId),
      )
      .take(20);
    for (const subscription of subscriptions) {
      if (subscription.enabled === false) continue;
      await ctx.db.insert("notificationDeliveries", {
        notificationId,
        subscriptionId: subscription._id,
        memberId: recipient.memberId,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        updatedAt: now,
      });
      deliveryCount += 1;
    }
  }

  if (deliveryCount > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.functions.pushDelivery.deliverPending,
      {},
    );
  }
  return {
    eventId,
    created: true,
    notifications: recipients.size,
    deliveries: deliveryCount,
  };
}

export function normalizeNotificationHref(href: string) {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed.slice(0, 500);
}

export function parsePosition(position: string | undefined): number | null {
  const match = position?.match(/\d+/);
  if (!match) return null;
  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) ? value : null;
}

export function detectTeamMoment(args: {
  beforePosition?: string;
  afterPosition?: string;
  round?: number;
}) {
  const before = parsePosition(args.beforePosition);
  const after = parsePosition(args.afterPosition);
  if (after === null || before === null || after >= before) return null;
  const gained = before - after;
  if (after === 1 && before !== 1) {
    return {
      key: `lead:r${args.round ?? 0}`,
      title: "Your team has taken the lead",
      body: `You moved from ${args.beforePosition} to ${args.afterPosition}.`,
    };
  }
  if (after <= 5 && before > 5 && gained >= 3) {
    return {
      key: `top-five:r${args.round ?? 0}`,
      title: "Your team is into the top five",
      body: `A ${gained}-place jump moved you to ${args.afterPosition}.`,
    };
  }
  if (gained >= 5) {
    return {
      key: `jump:r${args.round ?? 0}`,
      title: "Big move on the leaderboard",
      body: `Your team climbed ${gained} places to ${args.afterPosition}.`,
    };
  }
  return null;
}
