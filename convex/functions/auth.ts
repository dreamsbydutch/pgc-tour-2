import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { ClerkUserIdentity, Viewer } from "../types/types";

type AuthCtx = QueryCtx | MutationCtx;
type MemberDoc = Doc<"members">;
type MemberLookupCtx = {
  db: QueryCtx["db"] | MutationCtx["db"];
};
type ActionAuthCtx = {
  auth: ActionCtx["auth"];
  runQuery: ActionCtx["runQuery"];
};

function getIdentityNameParts(
  userIdentity: Pick<ClerkUserIdentity, "name" | "givenName" | "familyName">,
): { firstname: string; lastname: string } {
  const [fallbackFirstname = "", ...remainingNameParts] = userIdentity.name
    .trim()
    .split(/\s+/);
  return {
    firstname: userIdentity.givenName ?? fallbackFirstname,
    lastname: userIdentity.familyName ?? remainingNameParts.join(" "),
  };
}

export async function getClerkUserIdentity(
  ctx: AuthCtx,
): Promise<ClerkUserIdentity> {
  const userIdentity = await ctx.auth.getUserIdentity();
  if (
    !userIdentity ||
    !userIdentity.subject ||
    !userIdentity.email ||
    !userIdentity.name
  ) {
    throw new Error("Unauthorized");
  }
  return {
    tokenIdentifier: userIdentity.tokenIdentifier,
    issuer: userIdentity.issuer,
    subject: userIdentity.subject,
    email: userIdentity.email,
    name: userIdentity.name,
    pictureUrl: userIdentity.pictureUrl,
    givenName: userIdentity.givenName,
    familyName: userIdentity.familyName,
    emailVerified: userIdentity.emailVerified ?? false,
    phoneNumberVerified: userIdentity.phoneNumberVerified ?? false,
    updatedAt: userIdentity.updatedAt ?? new Date().toISOString(),
  };
}

export async function findMemberByClerkId(
  ctx: MemberLookupCtx,
  clerkId: string,
): Promise<MemberDoc | null> {
  return ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
}

export async function requireMemberByClerkId(
  ctx: MemberLookupCtx,
  clerkId: string,
): Promise<MemberDoc> {
  const member = await findMemberByClerkId(ctx, clerkId);
  if (!member) {
    throw new Error("Unauthorized");
  }
  return member;
}

export async function requireViewerMember(ctx: AuthCtx): Promise<MemberDoc> {
  const userIdentity = await getClerkUserIdentity(ctx);
  return requireMemberByClerkId(ctx, userIdentity.subject);
}

export async function getViewer(ctx: AuthCtx): Promise<Viewer> {
  const userIdentity = await getClerkUserIdentity(ctx);
  const member = await requireMemberByClerkId(ctx, userIdentity.subject);
  const { firstname, lastname } = getIdentityNameParts(userIdentity);
  return {
    id: member._id,
    clerkId: member.clerkId ?? userIdentity.subject,
    firstname: member.firstname ?? firstname,
    lastname: member.lastname ?? lastname,
    isActive: member.isActive ?? false,
    lastLoginAt: member.lastLoginAt,
    updatedAt: member.updatedAt,
    email: member.email,
    role: member.role,
    account: member.account,
    friends: member.friends,
    pictureUrl: userIdentity.pictureUrl,
  };
}
export async function connectClerkUserToMember(
  ctx: MutationCtx,
): Promise<void> {
  const userIdentity = await getClerkUserIdentity(ctx);
  const { firstname, lastname } = getIdentityNameParts(userIdentity);
  const member = await findMemberByClerkId(ctx, userIdentity.subject);
  if (!member) {
    const emailCheck = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", userIdentity.email))
      .first();
    if (!emailCheck) {
      await ctx.db.insert("members", {
        clerkId: userIdentity.subject,
        firstname,
        lastname,
        isActive: true,
        lastLoginAt: Date.now(),
        updatedAt: Date.now(),
        email: userIdentity.email,
        role: "regular",
        account: 0,
        friends: [],
      });
      return;
    } else {
      await ctx.db.patch(emailCheck._id, {
        clerkId: userIdentity.subject,
        firstname: emailCheck.firstname ?? firstname,
        lastname: emailCheck.lastname ?? lastname,
        isActive: true,
        updatedAt: Date.now(),
      });
    }
  }
  return;
}

export const getViewerMember = query({
  handler: async (ctx) => {
    const member = await requireViewerMember(ctx);
    return {
      ok: true,
      member,
    } as const;
  },
});

export const getMemberByClerkId_Internal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const member = await findMemberByClerkId(ctx, args.clerkId);
    if (!member) {
      return { ok: false } as const;
    }

    return {
      ok: true,
      member,
    } as const;
  },
});

export async function requireAuth(ctx: AuthCtx): Promise<Viewer> {
  return getViewer(ctx);
}
export async function requireAdmin(ctx: AuthCtx): Promise<Viewer> {
  const viewer = await requireAuth(ctx);
  if (viewer.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return viewer;
}
export async function requireAdminAction(ctx: ActionAuthCtx): Promise<void> {
  const userIdentity = await ctx.auth.getUserIdentity();
  if (!userIdentity?.subject) {
    throw new Error("Unauthorized");
  }

  const isAdminResult = await ctx.runQuery(
    internal.functions.auth.getIsAdminByClerkId_Internal,
    { clerkId: userIdentity.subject },
  );

  if (!isAdminResult.isAdmin) {
    throw new Error("Unauthorized");
  }
}
export async function requireTourCardOwner(
  ctx: AuthCtx,
  tourCard: Doc<"tourCards">,
): Promise<Viewer> {
  const member = await getViewer(ctx);
  if (member.id !== tourCard.memberId) {
    await requireAdmin(ctx);
  }
  return member;
}

export const getIsAdminByClerkId_Internal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const member = await findMemberByClerkId(ctx, args.clerkId);

    return {
      ok: true,
      isAdmin: Boolean(member && member.role === "admin"),
    } as const;
  },
});
