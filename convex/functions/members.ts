import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireAuth } from "../utils/auth";

export const getMembers = query({
  args: {
    options: v.optional(
      v.object({
        clerkId: v.optional(v.string()),
        activeOnly: v.optional(v.boolean()),
        sort: v.optional(
          v.object({
            sortBy: v.optional(
              v.union(
                v.literal("firstname"),
                v.literal("lastname"),
                v.literal("email"),
                v.literal("account"),
              ),
            ),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
        pagination: v.optional(
          v.object({
            limit: v.optional(v.number()),
            offset: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options ?? {};

    if (options.clerkId) {
      return await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", options.clerkId!))
        .first();
    }

    let members = await ctx.db.query("members").collect();

    if (options.activeOnly) {
      members = members.filter((member) => member.isActive !== false);
    }

    const sort = options.sort ?? {};
    const sortBy = sort.sortBy ?? "lastname";
    const sortOrder = sort.sortOrder === "desc" ? -1 : 1;

    const sorted = [...members].sort((a, b) => {
      if (sortBy === "firstname") {
        return (a.firstname ?? "").localeCompare(b.firstname ?? "") * sortOrder;
      }
      if (sortBy === "email") {
        return a.email.localeCompare(b.email) * sortOrder;
      }
      if (sortBy === "account") {
        return (a.account - b.account) * sortOrder;
      }
      return (a.lastname ?? "").localeCompare(b.lastname ?? "") * sortOrder;
    });

    const pagination = options.pagination ?? {};
    const offset = Math.max(pagination.offset ?? 0, 0);
    const limit = Math.max(pagination.limit ?? sorted.length, 0);

    return sorted.slice(offset, offset + limit);
  },
});

export const ensureMemberForCurrentClerkUser = mutation({
  args: {
    clerkId: v.string(),
    profile: v.object({
      email: v.string(),
      firstname: v.optional(v.string()),
      lastname: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity && identity.subject !== args.clerkId) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existing) {
      const patch: Partial<Doc<"members">> = {
        email: args.profile.email,
        firstname: args.profile.firstname,
        lastname: args.profile.lastname,
        isActive: existing.isActive ?? true,
        updatedAt: Date.now(),
      };
      await ctx.db.patch(existing._id, patch);
      return await ctx.db.get(existing._id);
    }

    const memberId = await ctx.db.insert("members", {
      clerkId: args.clerkId,
      email: args.profile.email,
      firstname: args.profile.firstname,
      lastname: args.profile.lastname,
      role: "regular",
      account: 0,
      friends: [],
      isActive: true,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(memberId);
  },
});

export const updateMembers = mutation({
  args: {
    memberId: v.id("members"),
    data: v.object({
      firstname: v.optional(v.string()),
      lastname: v.optional(v.string()),
      email: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
    }),
    options: v.optional(
      v.object({
        returnEnhanced: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireAuth(ctx);
    const requester = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (!requester) {
      throw new Error("Member not found");
    }

    if (requester.role !== "admin" && requester._id !== args.memberId) {
      throw new Error("Forbidden: You can only update your own profile");
    }

    await ctx.db.patch(args.memberId, {
      ...args.data,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(args.memberId);
  },
});
