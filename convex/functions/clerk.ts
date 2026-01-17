/**
 * Clerk admin utilities.
 *
 * Requires `CLERK_SECRET_KEY` set in the Convex environment.
 */

import { action, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { fetchWithRetry } from "./_externalFetch";

type ClerkEmail = {
  email_address?: string;
};

type ClerkUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email_addresses?: ClerkEmail[];
};

type ClerkUserRow = {
  clerkId: string;
  email: string | null;
  fullName: string;
};

export const getMemberRoleForClerkAuth = internalQuery({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<{ role: string } | null> => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return member ? { role: member.role } : null;
  },
});

function buildFullName(user: ClerkUser): string {
  const fromFull = (user.full_name ?? "").trim();
  if (fromFull) return fromFull;
  const first = (user.first_name ?? "").trim();
  const last = (user.last_name ?? "").trim();
  return `${first} ${last}`.trim().replace(/\s+/g, " ");
}

function pickPrimaryEmail(user: ClerkUser): string | null {
  const emails = Array.isArray(user.email_addresses)
    ? user.email_addresses
    : [];
  const first = emails[0]?.email_address;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

async function fetchClerkUsers(options: {
  limit: number;
  offset: number;
}): Promise<ClerkUser[]> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "Missing CLERK_SECRET_KEY in Convex environment variables.",
    );
  }

  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("offset", String(options.offset));

  const result = await fetchWithRetry<ClerkUser[]>(
    url.toString(),
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    },
    {
      timeout: 30000,
      retries: 3,
      validateResponse: (json): json is ClerkUser[] =>
        Array.isArray(json) &&
        json.every(
          (u) =>
            u && typeof u === "object" && "id" in u && typeof u.id === "string",
        ),
      logPrefix: "Clerk API",
    },
  );

  if (!result.ok) {
    throw new Error(`Clerk API error: ${result.error}`);
  }

  return result.data;
}

/**
 * Returns Clerk users for admin tooling.
 *
 * Email is the authoritative key for linking Clerk users to `members`.
 * Joining and "unlinked" detection happens in the frontend.
 */
export const listClerkUsers = action({
  args: {
    clerkId: v.optional(v.string()),
    options: v.optional(
      v.object({
        limit: v.optional(v.number()),
        offset: v.optional(v.number()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: true;
    offset: number;
    limit: number;
    fetched: number;
    users: ClerkUserRow[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    const actingClerkId = args.clerkId?.trim();

    if (identity && actingClerkId && identity.subject !== actingClerkId) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }

    if (!identity) {
      if (!actingClerkId) {
        throw new Error("Unauthorized: You must be signed in");
      }

      const memberInfo = await ctx.runQuery(
        internal.functions.clerk.getMemberRoleForClerkAuth,
        { clerkId: actingClerkId },
      );

      if (!memberInfo) {
        throw new Error(
          "Member profile not found. Please contact an administrator.",
        );
      }

      if (memberInfo.role !== "admin") {
        throw new Error("Forbidden: Admin access required");
      }
    }

    const limit = Math.max(1, Math.min(args.options?.limit ?? 50, 200));
    const offset = Math.max(0, args.options?.offset ?? 0);

    const clerkUsers = await fetchClerkUsers({ limit, offset });
    const users: ClerkUserRow[] = clerkUsers
      .filter((u): u is ClerkUser => !!u && typeof u.id === "string")
      .map((u) => ({
        clerkId: u.id,
        email: pickPrimaryEmail(u),
        fullName: buildFullName(u),
      }));

    return {
      ok: true,
      offset,
      limit,
      fetched: clerkUsers.length,
      users,
    };
  },
});
