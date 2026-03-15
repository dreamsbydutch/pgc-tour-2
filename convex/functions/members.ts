import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireAuth } from "../utils/auth";
import { sharedArgs } from "../validators/_shared";

// Level 0: shared context types

type MembersContext = MutationCtx | QueryCtx;

// Level 1: normalization and access helpers

/** Normalizes a required member email address. */
function normalizeRequiredEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  return normalizedEmail;
}

/** Normalizes a required Clerk id. */
function normalizeRequiredClerkId(clerkId: string): string {
  const normalizedClerkId = clerkId.trim();

  if (!normalizedClerkId) {
    throw new Error("Clerk ID is required");
  }

  return normalizedClerkId;
}

/** Normalizes an optional member name field. */
function normalizeOptionalName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }

  return name.trim();
}

/** Normalizes a member's friend id list into unique non-empty ids. */
function normalizeFriends(friendIds: string[]): string[] {
  return [...new Set(friendIds.map((friendId) => friendId.trim()))].filter(
    (friendId) => friendId.length > 0,
  );
}

/** Returns one member by Clerk id. */
async function getMemberByClerkId(
  ctx: MembersContext,
  clerkId: string,
): Promise<Doc<"members"> | null> {
  return await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
}

/** Resolves the target member and enforces self-service or admin access. */
async function requireMemberAccess(
  ctx: MutationCtx,
  memberId: Id<"members">,
): Promise<{
  requester: Doc<"members">;
  target: Doc<"members">;
  isAdmin: boolean;
}> {
  const target = await ctx.db.get(memberId);
  if (!target) {
    throw new Error("Member not found");
  }

  const requesterClerkId = await requireAuth(ctx);
  const requester = await getMemberByClerkId(ctx, requesterClerkId);

  if (!requester) {
    throw new Error("Member profile not found");
  }

  const isAdmin = requester.role === "admin";

  if (!isAdmin && requester._id !== memberId) {
    throw new Error("Forbidden: You can only manage your own member profile");
  }

  return { requester, target, isAdmin };
}

/** Deletes member-owned records and cleans up linked references before deleting the member. */
async function deleteMemberDependencies(
  ctx: MutationCtx,
  member: Doc<"members">,
) {
  const [tourCards, transactions, pushSubscriptions, auditLogs, members] =
    await Promise.all([
      ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect(),
      ctx.db
        .query("pushSubscriptions")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect(),
      ctx.db.query("members").collect(),
    ]);

  let deletedTeams = 0;

  for (const tourCard of tourCards) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
      .collect();

    deletedTeams += teams.length;

    await Promise.all(teams.map((team) => ctx.db.delete(team._id)));
    await ctx.db.delete(tourCard._id);
  }

  await Promise.all([
    ...transactions.map((transaction) => ctx.db.delete(transaction._id)),
    ...pushSubscriptions.map((subscription) => ctx.db.delete(subscription._id)),
    ...auditLogs.map((auditLog) => ctx.db.delete(auditLog._id)),
  ]);

  const memberIdString = String(member._id);
  let cleanedFriendReferences = 0;

  for (const candidate of members) {
    if (candidate._id === member._id || candidate.friends.length === 0) {
      continue;
    }

    const nextFriends = candidate.friends.filter(
      (friendId) => String(friendId) !== memberIdString,
    );

    if (nextFriends.length === candidate.friends.length) {
      continue;
    }

    cleanedFriendReferences += candidate.friends.length - nextFriends.length;
    await ctx.db.patch(candidate._id, {
      friends: nextFriends,
      updatedAt: Date.now(),
    });
  }

  await ctx.db.delete(member._id);

  return {
    deletedMemberId: member._id,
    deletedTourCards: tourCards.length,
    deletedTeams,
    deletedTransactions: transactions.length,
    deletedPushSubscriptions: pushSubscriptions.length,
    deletedAuditLogs: auditLogs.length,
    cleanedFriendReferences,
  };
}

// Level 2: public read queries

/** Returns members filtered by Clerk id, active state, sort, and pagination options. */
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

// Level 3: authenticated write mutations

/** Ensures the signed-in Clerk user has a member profile and refreshes its basic profile fields. */
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
    const authenticatedClerkId = await requireAuth(ctx);
    const requestedClerkId = normalizeRequiredClerkId(args.clerkId);
    const requester = await getMemberByClerkId(ctx, authenticatedClerkId);

    if (
      requester?.role !== "admin" &&
      authenticatedClerkId !== requestedClerkId
    ) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }

    const now = Date.now();
    const profilePatch: Pick<
      Doc<"members">,
      "email" | "firstname" | "lastname" | "lastLoginAt" | "updatedAt"
    > = {
      email: normalizeRequiredEmail(args.profile.email),
      firstname: normalizeOptionalName(args.profile.firstname),
      lastname: normalizeOptionalName(args.profile.lastname),
      lastLoginAt: now,
      updatedAt: now,
    };

    const existing = await getMemberByClerkId(ctx, requestedClerkId);

    if (existing) {
      const patch: Partial<Doc<"members">> = {
        ...profilePatch,
        isActive: existing.isActive ?? true,
      };

      await ctx.db.patch(existing._id, patch);
      return await ctx.db.get(existing._id);
    }

    const memberId = await ctx.db.insert("members", {
      clerkId: requestedClerkId,
      ...profilePatch,
      role: "regular",
      account: 0,
      friends: [],
      isActive: true,
    });

    return await ctx.db.get(memberId);
  },
});

/** Updates one member while enforcing self-service limits for non-admin callers. */
export const updateMembers = mutation({
  args: {
    memberId: v.id("members"),
    data: v.object({
      firstname: v.optional(v.string()),
      lastname: v.optional(v.string()),
      email: v.optional(v.string()),
      friends: v.optional(v.array(v.string())),
      isActive: v.optional(v.boolean()),
      role: v.optional(
        v.union(
          v.literal("admin"),
          v.literal("moderator"),
          v.literal("regular"),
        ),
      ),
      account: v.optional(v.number()),
      clerkId: v.optional(v.string()),
    }),
    options: v.optional(
      v.object({
        returnEnhanced: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { isAdmin, target } = await requireMemberAccess(ctx, args.memberId);

    if (
      !isAdmin &&
      (args.data.account !== undefined ||
        args.data.clerkId !== undefined ||
        args.data.isActive !== undefined ||
        args.data.role !== undefined)
    ) {
      throw new Error(
        "Forbidden: You can only update your own profile details",
      );
    }

    const patch: Partial<Doc<"members">> = {
      updatedAt: Date.now(),
    };

    if (args.data.firstname !== undefined) {
      patch.firstname = normalizeOptionalName(args.data.firstname);
    }

    if (args.data.lastname !== undefined) {
      patch.lastname = normalizeOptionalName(args.data.lastname);
    }

    if (args.data.email !== undefined) {
      patch.email = normalizeRequiredEmail(args.data.email);
    }

    if (args.data.friends !== undefined) {
      patch.friends = normalizeFriends(args.data.friends).filter(
        (friendId) => friendId !== String(target._id),
      );
    }

    if (isAdmin && args.data.account !== undefined) {
      patch.account = args.data.account;
    }

    if (isAdmin && args.data.isActive !== undefined) {
      patch.isActive = args.data.isActive;
    }

    if (isAdmin && args.data.role !== undefined) {
      patch.role = args.data.role;
    }

    if (isAdmin && args.data.clerkId !== undefined) {
      const nextClerkId = normalizeRequiredClerkId(args.data.clerkId);
      const existing = await getMemberByClerkId(ctx, nextClerkId);

      if (existing && existing._id !== target._id) {
        throw new Error("Clerk ID is already linked to another member");
      }

      patch.clerkId = nextClerkId;
    }

    await ctx.db.patch(args.memberId, patch);

    return await ctx.db.get(args.memberId);
  },
});

/** Deletes one member after removing dependent season, team, and account records. */
export const deleteMembers = mutation({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const { target } = await requireMemberAccess(ctx, args.memberId);

    return await deleteMemberDependencies(ctx, target);
  },
});
