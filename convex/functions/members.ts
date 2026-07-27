import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  getCurrentMember as getAuthenticatedMember,
  requireAdmin,
  requireAuth,
} from "../utils/auth";

const memberSortValidator = v.optional(
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
);

export const getCurrentMember = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthenticatedMember(ctx);
  },
});

export const getPublicMembers = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return members.map((member) => ({
      _id: member._id,
      firstname: member.firstname,
      lastname: member.lastname,
      displayName:
        [member.firstname, member.lastname].filter(Boolean).join(" ").trim() ||
        "Member",
    }));
  },
});

export const adminListMembers = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    sort: memberSortValidator,
    pagination: v.optional(
      v.object({
        limit: v.optional(v.number()),
        cursor: v.optional(v.union(v.string(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const activeOnly = args.activeOnly ?? false;
    const limit = Math.min(Math.max(args.pagination?.limit ?? 100, 1), 500);
    const result = activeOnly
      ? await ctx.db
          .query("members")
          .withIndex("by_active_lastname", (q) => q.eq("isActive", true))
          .paginate({
            cursor: args.pagination?.cursor ?? null,
            numItems: limit,
          })
      : await ctx.db
          .query("members")
          .withIndex("by_lastname")
          .paginate({
            cursor: args.pagination?.cursor ?? null,
            numItems: limit,
          });
    const members = result.page;
    const sortBy = args.sort?.sortBy ?? "lastname";
    const direction = args.sort?.sortOrder === "desc" ? -1 : 1;
    const sorted = [...members].sort((a, b) => {
      if (sortBy === "firstname") {
        return (a.firstname ?? "").localeCompare(b.firstname ?? "") * direction;
      }
      if (sortBy === "email") {
        return a.email.localeCompare(b.email) * direction;
      }
      if (sortBy === "account") {
        return (a.account - b.account) * direction;
      }
      return (a.lastname ?? "").localeCompare(b.lastname ?? "") * direction;
    });
    return {
      page: sorted,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const ensureCurrentMember = mutation({
  args: {
    profile: v.object({
      email: v.string(),
      firstname: v.optional(v.string()),
      lastname: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireAuth(ctx);
    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();
    const patch: Partial<Doc<"members">> = {
      email: args.profile.email.trim().toLowerCase(),
      firstname: args.profile.firstname?.trim() || undefined,
      lastname: args.profile.lastname?.trim() || undefined,
      isActive: existing?.isActive ?? true,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return await ctx.db.get(existing._id);
    }

    const memberId = await ctx.db.insert("members", {
      clerkId,
      email: patch.email ?? args.profile.email,
      firstname: patch.firstname,
      lastname: patch.lastname,
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
      friends: v.optional(v.array(v.union(v.string(), v.id("members")))),
    }),
    options: v.optional(
      v.object({
        returnEnhanced: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const requester = await getAuthenticatedMember(ctx);
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
