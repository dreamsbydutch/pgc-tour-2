import { internalMutation, query } from "../_generated/server";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { findMemberByClerkId, requireAdmin } from "./auth";

type MemberDoc = Doc<"members">;
type MemberRole = "admin" | "moderator" | "regular";
type MemberSortField =
  | "firstname"
  | "lastname"
  | "email"
  | "account"
  | "updatedAt"
  | "lastLoginAt";

type MemberReturnType = { ok: true; member: MemberDoc };
type MembersReturnType = { ok: true; members: MemberDoc[] };
type DeleteMemberReturnType = { ok: true };

type MemberWriteArgs = {
  clerkId?: string;
  email: string;
  firstname?: string;
  lastname?: string;
  isActive?: boolean;
  role?: MemberRole;
  account?: number;
  friends?: Id<"members">[];
  lastLoginAt?: number;
};

type MemberCtx = {
  db: DatabaseReader | DatabaseWriter;
};

function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function normalizeMemberWriteArgs(args: MemberWriteArgs): MemberWriteArgs {
  return {
    ...args,
    clerkId: normalizeOptionalString(args.clerkId),
    email: args.email.trim().toLowerCase(),
    firstname: normalizeOptionalString(args.firstname),
    lastname: normalizeOptionalString(args.lastname),
  };
}

function validateMemberValues(args: MemberWriteArgs): string | null {
  if (args.email.trim().length === 0) {
    return "Member email is required.";
  }
  if (args.clerkId !== undefined && args.clerkId.trim().length === 0) {
    return "Clerk ID cannot be empty.";
  }
  if (args.account !== undefined && !Number.isInteger(args.account)) {
    return "Account balance must be an integer number of cents.";
  }
  if (
    args.lastLoginAt !== undefined &&
    (!Number.isInteger(args.lastLoginAt) || args.lastLoginAt < 0)
  ) {
    return "Last login timestamp must be a non-negative integer.";
  }
  if (args.friends) {
    const uniqueFriendIds = new Set(args.friends);
    if (uniqueFriendIds.size !== args.friends.length) {
      return "Friends must not contain duplicates.";
    }
  }
  return null;
}

function compareMembers(
  left: MemberDoc,
  right: MemberDoc,
  sortBy: MemberSortField,
  sortOrder: 1 | -1,
): number {
  if (sortBy === "account") {
    return (left.account - right.account) * sortOrder;
  }
  if (sortBy === "updatedAt") {
    return ((left.updatedAt ?? 0) - (right.updatedAt ?? 0)) * sortOrder;
  }
  if (sortBy === "lastLoginAt") {
    return ((left.lastLoginAt ?? 0) - (right.lastLoginAt ?? 0)) * sortOrder;
  }
  if (sortBy === "firstname") {
    return (
      (left.firstname ?? "").localeCompare(right.firstname ?? "") * sortOrder
    );
  }
  if (sortBy === "email") {
    return left.email.localeCompare(right.email) * sortOrder;
  }
  return (left.lastname ?? "").localeCompare(right.lastname ?? "") * sortOrder;
}

export async function requireMember(
  ctx: MemberCtx,
  memberId: Id<"members">,
): Promise<MemberDoc> {
  const member = await ctx.db.get(memberId);
  if (!member) {
    throw new Error("Member not found.");
  }
  return member;
}

async function requireReferencedFriends(
  ctx: MemberCtx,
  friendIds: Id<"members">[],
  currentMemberId?: Id<"members">,
): Promise<void> {
  for (const friendId of friendIds) {
    if (currentMemberId && friendId === currentMemberId) {
      throw new Error("Member cannot reference themselves as a friend.");
    }
    await requireMember(ctx, friendId);
  }
}

async function ensureUniqueMemberIdentifiers(
  ctx: MemberCtx,
  args: MemberWriteArgs,
  currentMemberId?: Id<"members">,
): Promise<void> {
  const existingByEmail = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", args.email))
    .first();
  if (existingByEmail && existingByEmail._id !== currentMemberId) {
    throw new Error("A member with this email already exists.");
  }

  if (args.clerkId) {
    const existingByClerkId = await findMemberByClerkId(
      { db: ctx.db },
      args.clerkId,
    );
    if (existingByClerkId && existingByClerkId._id !== currentMemberId) {
      throw new Error("A member with this Clerk ID already exists.");
    }
  }
}

// GENERAL FETCH FUNCTIONS
export const getMemberById = query({
  args: {
    id: v.id("members"),
  },
  handler: async (ctx, args): Promise<MemberReturnType> => {
    const member = await requireMember(ctx, args.id);
    return { ok: true, member };
  },
});

export const getMembersByRole = query({
  args: {
    role: v.union(
      v.literal("admin"),
      v.literal("moderator"),
      v.literal("regular"),
    ),
  },
  handler: async (ctx, args): Promise<MembersReturnType> => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
    if (members.length === 0) {
      throw new Error("No members found for this role.");
    }
    return { ok: true, members };
  },
});

export const getMembers = query({
  args: {
    isActive: v.optional(v.boolean()),
    role: v.optional(
      v.union(v.literal("admin"), v.literal("moderator"), v.literal("regular")),
    ),
    sortBy: v.optional(
      v.union(
        v.literal("firstname"),
        v.literal("lastname"),
        v.literal("email"),
        v.literal("account"),
        v.literal("updatedAt"),
        v.literal("lastLoginAt"),
      ),
    ),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args): Promise<MembersReturnType> => {
    let members: MemberDoc[];
    if (args.role) {
      const role: MemberRole = args.role;
      members = await ctx.db
        .query("members")
        .withIndex("by_role", (q) => q.eq("role", role))
        .collect();
    } else {
      members = await ctx.db.query("members").collect();
    }

    if (args.isActive !== undefined) {
      members = members.filter(
        (member) => (member.isActive ?? false) === args.isActive,
      );
    }

    const sortBy = args.sortBy ?? "lastname";
    const sortOrder = args.sortOrder === "desc" ? -1 : 1;

    return {
      ok: true,
      members: [...members].sort((left, right) =>
        compareMembers(left, right, sortBy, sortOrder),
      ),
    };
  },
});

// ADMIN CRUD FUNCTIONS
export const createMember = internalMutation({
  args: {
    clerkId: v.optional(v.string()),
    email: v.string(),
    firstname: v.optional(v.string()),
    lastname: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    role: v.optional(
      v.union(v.literal("admin"), v.literal("moderator"), v.literal("regular")),
    ),
    account: v.optional(v.number()),
    friends: v.optional(v.array(v.id("members"))),
    lastLoginAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MemberReturnType> => {
    await requireAdmin(ctx);
    const normalizedArgs = normalizeMemberWriteArgs(args);
    const validationError = validateMemberValues(normalizedArgs);
    if (validationError) {
      throw new Error(validationError);
    }

    await ensureUniqueMemberIdentifiers(ctx, normalizedArgs);
    await requireReferencedFriends(ctx, normalizedArgs.friends ?? []);

    const memberId = await ctx.db.insert("members", {
      clerkId: normalizedArgs.clerkId,
      email: normalizedArgs.email,
      firstname: normalizedArgs.firstname,
      lastname: normalizedArgs.lastname,
      isActive: normalizedArgs.isActive ?? true,
      role: normalizedArgs.role ?? "regular",
      account: normalizedArgs.account ?? 0,
      friends: normalizedArgs.friends ?? [],
      lastLoginAt: normalizedArgs.lastLoginAt,
      updatedAt: Date.now(),
    });

    const member = await requireMember(ctx, memberId);
    return { ok: true, member };
  },
});

export const updateMember = internalMutation({
  args: {
    id: v.id("members"),
    clerkId: v.optional(v.string()),
    email: v.optional(v.string()),
    firstname: v.optional(v.string()),
    lastname: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    role: v.optional(
      v.union(v.literal("admin"), v.literal("moderator"), v.literal("regular")),
    ),
    account: v.optional(v.number()),
    friends: v.optional(v.array(v.id("members"))),
    lastLoginAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MemberReturnType> => {
    await requireAdmin(ctx);
    const member = await requireMember(ctx, args.id);
    const normalizedArgs = normalizeMemberWriteArgs({
      clerkId: args.clerkId ?? member.clerkId,
      email: args.email ?? member.email,
      firstname: args.firstname ?? member.firstname,
      lastname: args.lastname ?? member.lastname,
      isActive: args.isActive ?? member.isActive,
      role: args.role ?? member.role,
      account: args.account ?? member.account,
      friends: args.friends ?? member.friends,
      lastLoginAt: args.lastLoginAt ?? member.lastLoginAt,
    });
    const validationError = validateMemberValues(normalizedArgs);
    if (validationError) {
      throw new Error(validationError);
    }

    await ensureUniqueMemberIdentifiers(ctx, normalizedArgs, args.id);
    await requireReferencedFriends(ctx, normalizedArgs.friends ?? [], args.id);

    await ctx.db.patch(args.id, {
      clerkId: normalizedArgs.clerkId,
      email: normalizedArgs.email,
      firstname: normalizedArgs.firstname,
      lastname: normalizedArgs.lastname,
      isActive: normalizedArgs.isActive,
      role: normalizedArgs.role,
      account: normalizedArgs.account,
      friends: normalizedArgs.friends ?? [],
      lastLoginAt: normalizedArgs.lastLoginAt,
      updatedAt: Date.now(),
    });

    const updatedMember = await requireMember(ctx, args.id);
    return { ok: true, member: updatedMember };
  },
});

export const deleteMember = internalMutation({
  args: {
    id: v.id("members"),
  },
  handler: async (ctx, args): Promise<DeleteMemberReturnType> => {
    await requireAdmin(ctx);
    await requireMember(ctx, args.id);

    const [tourCard, transaction, pushSubscription, auditLog, members] =
      await Promise.all([
        ctx.db
          .query("tourCards")
          .withIndex("by_member", (q) => q.eq("memberId", args.id))
          .first(),
        ctx.db
          .query("transactions")
          .withIndex("by_member", (q) => q.eq("memberId", args.id))
          .first(),
        ctx.db
          .query("pushSubscriptions")
          .withIndex("by_member", (q) => q.eq("memberId", args.id))
          .first(),
        ctx.db
          .query("auditLogs")
          .withIndex("by_member", (q) => q.eq("memberId", args.id))
          .first(),
        ctx.db.query("members").collect(),
      ]);

    const friendReference = members.find((member) =>
      member.friends.includes(args.id),
    );

    if (
      tourCard ||
      transaction ||
      pushSubscription ||
      auditLog ||
      friendReference
    ) {
      const relatedRecords = [
        tourCard ? "tour cards" : null,
        transaction ? "transactions" : null,
        pushSubscription ? "push subscriptions" : null,
        auditLog ? "audit logs" : null,
        friendReference ? "friend references" : null,
      ].filter((value): value is string => value !== null);

      throw new Error(
        `Cannot delete member with existing ${relatedRecords.join(", ")}.`,
      );
    }

    await ctx.db.delete(args.id);
    return { ok: true };
  },
});
