/**
 * Push Subscriptions - Basic CRUD
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnResource, getCurrentMember } from "../auth";
import type { Id } from "../_generated/dataModel";

export const createPushSubscriptions = mutation({
  args: {
    data: v.object({
      endpoint: v.string(),
      p256dh: v.string(),
      auth: v.string(),
      userAgent: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const currentMember = await getCurrentMember(ctx);
    if (!currentMember.clerkId) {
      throw new Error("Unauthorized: Member is not linked to Clerk");
    }
    await requireOwnResource(ctx, currentMember.clerkId);

    const pushSubscriptionId = await ctx.db.insert("pushSubscriptions", {
      memberId: currentMember._id,
      endpoint: args.data.endpoint,
      p256dh: args.data.p256dh,
      auth: args.data.auth,
      userAgent: args.data.userAgent,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(pushSubscriptionId);
  },
});

export const getPushSubscriptions = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("pushSubscriptions")),
        ids: v.optional(v.array(v.id("pushSubscriptions"))),
        filter: v.optional(
          v.object({
            memberId: v.optional(v.id("members")),
            clerkId: v.optional(v.string()),
            endpoint: v.optional(v.string()),
          }),
        ),
        limit: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      return await ctx.db.get(options.id);
    }

    if (options.ids) {
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      return docs.filter(Boolean);
    }

    const filter = options.filter || {};

    const memberId: Id<"members"> | undefined = filter.memberId
      ? (filter.memberId as Id<"members">)
      : filter.clerkId
        ? (
            await ctx.db
              .query("members")
              .withIndex("by_clerk_id", (q) => q.eq("clerkId", filter.clerkId!))
              .first()
          )?._id
        : undefined;

    if (memberId) {
      const member = await ctx.db.get(memberId);
      const clerkId = member?.clerkId;
      if (!clerkId) {
        throw new Error("Unauthorized: Member is not linked to Clerk");
      }
      await requireOwnResource(ctx, clerkId);
    }

    let results;
    if (memberId && filter.endpoint) {
      results = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_member_endpoint", (q) =>
          q.eq("memberId", memberId).eq("endpoint", filter.endpoint!),
        )
        .collect();
    } else if (memberId) {
      results = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_member", (q) => q.eq("memberId", memberId))
        .collect();
    } else {
      results = await ctx.db.query("pushSubscriptions").collect();
    }

    if (options.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return results;
  },
});

export const updatePushSubscriptions = mutation({
  args: {
    pushSubscriptionId: v.id("pushSubscriptions"),
    data: v.object({
      endpoint: v.optional(v.string()),
      p256dh: v.optional(v.string()),
      auth: v.optional(v.string()),
      userAgent: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.pushSubscriptionId);
    if (!subscription) {
      throw new Error("Push subscription not found");
    }

    await requirePushSubscriptionOwner(ctx, subscription.memberId);

    await ctx.db.patch(args.pushSubscriptionId, {
      ...args.data,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.pushSubscriptionId);
  },
});

export const deletePushSubscriptions = mutation({
  args: { pushSubscriptionId: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.pushSubscriptionId);
    if (!existing) return null;

    await requirePushSubscriptionOwner(ctx, existing.memberId);

    await ctx.db.delete(args.pushSubscriptionId);
    return existing;
  },
});

async function requirePushSubscriptionOwner(ctx: any, memberId: Id<"members">) {
  const member = (await ctx.db.get(memberId)) as { clerkId?: string } | null;
  const clerkId = member?.clerkId;
  if (!clerkId) {
    throw new Error("Unauthorized: Member is not linked to Clerk");
  }
  await requireOwnResource(ctx, clerkId);
}
