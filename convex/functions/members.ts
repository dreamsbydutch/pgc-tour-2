import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  getCurrentMember as getAuthenticatedMember,
  getAuthenticatedIdentityProfile,
  normalizeMemberName,
  requireAdmin,
} from "../utils/auth";
import { writeAuditLog } from "../utils/audit";
import {
  projectAdminMember,
  projectPublicMember,
  projectViewerMember,
} from "../utils/publicDtos";

type ProfileUpdate = {
  firstname?: string;
  lastname?: string;
};

async function applyProfileUpdate(
  ctx: MutationCtx,
  member: Doc<"members">,
  data: ProfileUpdate,
) {
  const patch: Partial<Doc<"members">> = {};

  if (Object.prototype.hasOwnProperty.call(data, "firstname")) {
    const firstname = normalizeMemberName(data.firstname);
    if (firstname !== member.firstname) patch.firstname = firstname;
  }
  if (Object.prototype.hasOwnProperty.call(data, "lastname")) {
    const lastname = normalizeMemberName(data.lastname);
    if (lastname !== member.lastname) patch.lastname = lastname;
  }

  if (Object.keys(patch).length === 0) return member;
  patch.updatedAt = Date.now();
  await ctx.db.patch(member._id, patch);
  return await ctx.db.get(member._id);
}

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
    return projectViewerMember(await getAuthenticatedMember(ctx));
  },
});

export const getPublicMembers = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(500);

    return members.map(projectPublicMember);
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
      page: sorted.map(projectAdminMember),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const ensureCurrentMember = mutation({
  args: {
    profile: v.optional(
      v.object({
        email: v.string(),
        firstname: v.optional(v.string()),
        lastname: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx) => {
    const identity = await getAuthenticatedIdentityProfile(ctx);
    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      const patch: Partial<Doc<"members">> = {};
      if (identity.email && identity.email !== existing.email) {
        patch.email = identity.email;
      }
      if (identity.firstname && identity.firstname !== existing.firstname) {
        patch.firstname = identity.firstname;
      }
      if (identity.lastname && identity.lastname !== existing.lastname) {
        patch.lastname = identity.lastname;
      }
      if (Object.keys(patch).length === 0) return projectViewerMember(existing);
      patch.updatedAt = Date.now();
      await ctx.db.patch(existing._id, patch);
      const updated = await ctx.db.get(existing._id);
      return updated ? projectViewerMember(updated) : null;
    }

    if (!identity.email || !identity.emailVerified) {
      throw new Error(
        "Member profile cannot be created because Clerk did not provide a verified email claim.",
      );
    }

    const memberId = await ctx.db.insert("members", {
      clerkId: identity.subject,
      email: identity.email,
      firstname: identity.firstname,
      lastname: identity.lastname,
      role: "regular",
      account: 0,
      friends: [],
      isActive: true,
      updatedAt: Date.now(),
    });
    const created = await ctx.db.get(memberId);
    return created ? projectViewerMember(created) : null;
  },
});

export const updateMyProfile = mutation({
  args: {
    firstname: v.optional(v.string()),
    lastname: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await getAuthenticatedMember(ctx);
    const updated = await applyProfileUpdate(ctx, member, args);
    return updated ? projectViewerMember(updated) : null;
  },
});

export const addMyFriend = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const member = await getAuthenticatedMember(ctx);
    if (member._id === args.memberId) {
      throw new Error("You cannot add yourself as a friend");
    }
    const target = await ctx.db.get(args.memberId);
    if (!target || target.isActive !== true) {
      throw new Error("Friend must be an active member");
    }

    const uniqueFriends = new Map(
      member.friends.map((friend) => [String(friend), friend] as const),
    );
    if (uniqueFriends.has(String(args.memberId))) {
      return projectViewerMember(member);
    }
    uniqueFriends.set(String(args.memberId), args.memberId);
    await ctx.db.patch(member._id, {
      friends: [...uniqueFriends.values()],
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(member._id);
    return updated ? projectViewerMember(updated) : null;
  },
});

export const removeMyFriend = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const member = await getAuthenticatedMember(ctx);
    const friends = member.friends.filter(
      (friend) => String(friend) !== String(args.memberId),
    );
    if (friends.length === member.friends.length) {
      return projectViewerMember(member);
    }
    await ctx.db.patch(member._id, { friends, updatedAt: Date.now() });
    const updated = await ctx.db.get(member._id);
    return updated ? projectViewerMember(updated) : null;
  },
});

export const adminUpdateMemberStatus = mutation({
  args: { memberId: v.id("members"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const admin = await getAuthenticatedMember(ctx);
    if (admin._id === args.memberId && !args.isActive) {
      throw new Error("Administrators cannot deactivate their own account");
    }
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Member not found");
    if (member.isActive === args.isActive) return projectAdminMember(member);

    await ctx.db.patch(member._id, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      memberId: admin._id,
      entityType: "member",
      entityId: String(member._id),
      action: "updated",
      changes: { isActive: { from: member.isActive, to: args.isActive } },
    });
    const updated = await ctx.db.get(member._id);
    return updated ? projectAdminMember(updated) : null;
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
    if (requester._id !== args.memberId) {
      throw new Error("Forbidden: You can only update your own profile");
    }
    if (
      args.data.email !== undefined ||
      args.data.isActive !== undefined ||
      args.data.friends !== undefined
    ) {
      throw new Error("Forbidden: This legacy endpoint only updates names");
    }
    const profile: ProfileUpdate = {};
    if (Object.prototype.hasOwnProperty.call(args.data, "firstname")) {
      profile.firstname = args.data.firstname;
    }
    if (Object.prototype.hasOwnProperty.call(args.data, "lastname")) {
      profile.lastname = args.data.lastname;
    }
    const updated = await applyProfileUpdate(ctx, requester, profile);
    return updated ? projectViewerMember(updated) : null;
  },
});
