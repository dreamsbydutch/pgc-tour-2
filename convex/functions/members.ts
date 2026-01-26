/**
 * Member Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation, action } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../auth";
import type { Id } from "../_generated/dataModel";
import type { AuthCtx } from "../types/functionUtils";
import { requireAdminByClerkId } from "./_authByClerkId";
import {
  processData,
  formatCents,
  dateUtils,
  normalize,
  validators,
} from "./_utils";
import { TIME } from "./_constants";
import { logAudit, computeChanges, extractDeleteMetadata } from "./_auditLog";
import { fetchWithRetry } from "./_externalFetch";
import type {
  ValidationResult,
  AnalyticsResult,
  DeleteResponse,
  MemberDoc,
  EnhancedMemberDoc,
  MemberSortFunction,
  DatabaseContext,
  MemberFilterOptions,
  MemberOptimizedQueryOptions,
  MemberEnhancementOptions,
  MemberSortOptions,
} from "../types/types";

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
 * Validate member data
 */
function validateMemberData(data: {
  clerkId?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  displayName?: string;
  isActive?: boolean;
  role?: "admin" | "moderator" | "regular";
  account?: number;
  friends?: (string | Id<"members">)[];
}): ValidationResult {
  const errors: string[] = [];

  const clerkIdErr = validators.stringLength(data.clerkId, 3, 100, "Clerk ID");
  if (clerkIdErr) errors.push(clerkIdErr);

  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push("Invalid email format");
    }
  }

  const firstnameErr = validators.stringLength(
    data.firstname,
    0,
    50,
    "First name",
  );
  if (firstnameErr) errors.push(firstnameErr);

  const lastnameErr = validators.stringLength(
    data.lastname,
    0,
    50,
    "Last name",
  );
  if (lastnameErr) errors.push(lastnameErr);

  const displayNameErr = validators.stringLength(
    data.displayName,
    0,
    100,
    "Display name",
  );
  if (displayNameErr) errors.push(displayNameErr);

  if (data.account !== undefined) {
    if (!Number.isFinite(data.account)) {
      errors.push("Account balance must be a finite number of cents");
    } else if (Math.trunc(data.account) !== data.account) {
      errors.push("Account balance must be an integer number of cents");
    }
  }

  if (data.friends && data.friends.length > 500) {
    errors.push("Too many friends (maximum 500)");
  }

  return { isValid: errors.length === 0, errors };
}

async function getActingClerkId(
  ctx: AuthCtx,
  clerkId: string | undefined,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    if (clerkId && identity.subject !== clerkId) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }
    return identity.subject;
  }

  if (!clerkId) {
    throw new Error("Unauthorized: You must be signed in");
  }
  return clerkId;
}

async function getActingMemberByClerkId(ctx: DatabaseContext, clerkId: string) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();

  if (!member) {
    throw new Error(
      "Member profile not found. Please contact an administrator.",
    );
  }

  return member;
}

async function getActingMember(ctx: AuthCtx, clerkId: string | undefined) {
  const effective = (clerkId ?? "").trim() || undefined;
  const actingClerkId = await getActingClerkId(ctx, effective);
  return await getActingMemberByClerkId(ctx, actingClerkId);
}

/**
 * Generate full name from first and last name
 */
function generateFullName(firstname?: string, lastname?: string): string {
  const first = (firstname || "").trim();
  const last = (lastname || "").trim();

  if (first && last) {
    return `${first} ${last}`;
  } else if (first) {
    return first;
  } else if (last) {
    return last;
  } else {
    return "";
  }
}

function normalizeNameToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  let out = "";
  let shouldCapitalize = true;

  for (const ch of trimmed) {
    const isLetter = /[A-Za-z]/.test(ch);
    if (isLetter) {
      out += shouldCapitalize ? ch.toUpperCase() : ch.toLowerCase();
      shouldCapitalize = false;
      continue;
    }

    out += ch;
    shouldCapitalize = ch === "-" || ch === "'" || ch === "’";
  }

  return out;
}

function normalizePersonName(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const tokens = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(normalizeNameToken);

  return tokens.join(" ");
}

/**
 * Generate effective display name
 */
function generateDisplayName(
  displayName?: string,
  firstname?: string,
  lastname?: string,
  email?: string,
): string {
  if (displayName && displayName.trim()) {
    return displayName.trim();
  }

  const fullName = generateFullName(firstname, lastname);
  if (fullName) {
    return fullName;
  }

  if (email) {
    return email.split("@")[0];
  }

  return "Anonymous User";
}

function readOptionalDisplayName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const dn = (value as { displayName?: unknown }).displayName;
  return typeof dn === "string" && dn.trim() ? dn.trim() : undefined;
}

/**
 * Calculate days since last login
 */
function calculateDaysSinceLastLogin(lastLoginAt?: number): number | undefined {
  if (!lastLoginAt) return undefined;
  return dateUtils.daysSince(lastLoginAt);
}

/**
 * Determine if member is considered online (last login within 15 minutes)
 */
function isOnline(lastLoginAt?: number): boolean {
  if (!lastLoginAt) return false;
  const now = Date.now();
  const threshold = now - TIME.FIFTEEN_MINUTES;
  return lastLoginAt > threshold;
}

/**
 * Create members with comprehensive options
 *
 * @example
 * Basic member creation
 * const member = await ctx.runMutation(api.functions.members.createMembers, {
 *   data: {
 *     clerkId: "user_1234567890",
 *     email: "john.doe@example.com",
 *     firstname: "John",
 *     lastname: "Doe",
 *     role: "regular"
 *   }
 * });
 *
 * With advanced options
 * const member = await ctx.runMutation(api.functions.members.createMembers, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     setActive: true,
 *     autoGenerateDisplayName: true,
 *     initialBalance: 10000,
 *     returnEnhanced: true
 *   }
 * });
 */
export const createMembers = mutation({
  args: {
    data: v.object({
      clerkId: v.string(),
      email: v.string(),
      firstname: v.optional(v.string()),
      lastname: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
      role: v.optional(
        v.union(
          v.literal("admin"),
          v.literal("moderator"),
          v.literal("regular"),
        ),
      ),
      account: v.optional(v.number()),
      friends: v.optional(v.array(v.union(v.string(), v.id("members")))),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        setActive: v.optional(v.boolean()),
        initialBalance: v.optional(v.number()),
        recordLogin: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeFriends: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const data = {
      ...args.data,
      clerkId: args.data.clerkId.trim(),
      email: normalize.email(args.data.email),
    };

    if (!options.skipValidation) {
      const validation = validateMemberData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const existing = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.clerkId))
        .first();

      if (existing) {
        throw new Error("Member with this Clerk ID already exists");
      }

      const existingEmail = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", data.email))
        .first();

      if (existingEmail)
        throw new Error("Member with this email already exists");

      const rawEmail = args.data.email.trim();
      if (rawEmail && rawEmail !== data.email) {
        const existingEmailRaw = await ctx.db
          .query("members")
          .withIndex("by_email", (q) => q.eq("email", rawEmail))
          .first();
        if (existingEmailRaw) {
          throw new Error("Member with this email already exists");
        }
      }
    }

    let accountBalance = data.account || 0;
    if (options.initialBalance !== undefined) {
      accountBalance = options.initialBalance;
    }

    const memberData = {
      clerkId: data.clerkId,
      email: data.email,
      firstname: data.firstname,
      lastname: data.lastname,
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      role: data.role || ("regular" as const),
      account: accountBalance,
      friends: data.friends || [],
      lastLoginAt: options.recordLogin ? Date.now() : undefined,
      updatedAt: Date.now(),
    };

    const memberId = await ctx.db.insert("members", memberData);

    await logAudit(ctx, {
      entityType: "members",
      entityId: memberId,
      action: "created",
      metadata: {
        role: data.role || "regular",
        initialBalance: accountBalance,
      },
    });

    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Failed to retrieve created member");

    if (options.returnEnhanced) {
      return await enhanceMember(ctx, member, {
        includeFriends: options.includeFriends,
        includeStatistics: options.includeStatistics,
      });
    }

    return member;
  },
});

/**
 * Get members with comprehensive query options
 *
 * @example
 * Get single member by ID
 * const member = await ctx.runQuery(api.functions.members.getMembers, {
 *   options: { id: "member123" }
 * });
 *
 * Get member by clerk ID
 * const member = await ctx.runQuery(api.functions.members.getMembers, {
 *   options: {
 *     filter: { clerkId: "user_1234567890" }
 *   }
 * });
 *
 * Get members with filtering, sorting, and pagination
 * const result = await ctx.runQuery(api.functions.members.getMembers, {
 *   options: {
 *     filter: {
 *       role: "admin",
 *       hasBalance: true,
 *       searchTerm: "John"
 *     },
 *     sort: {
 *       sortBy: "lastname",
 *       sortOrder: "asc"
 *     },
 *     pagination: {
 *       limit: 50,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeFriends: true,
 *       includeTourCards: true,
 *       includeTeams: true
 *     }
 *   }
 * });
 */
export const getMembers = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("members")),
        ids: v.optional(v.array(v.id("members"))),
        clerkId: v.optional(v.string()),
        filter: v.optional(
          v.object({
            clerkId: v.optional(v.string()),
            email: v.optional(v.string()),
            role: v.optional(
              v.union(
                v.literal("admin"),
                v.literal("moderator"),
                v.literal("regular"),
              ),
            ),
            hasBalance: v.optional(v.boolean()),
            minBalance: v.optional(v.number()),
            maxBalance: v.optional(v.number()),
            hasFriends: v.optional(v.boolean()),
            isOnline: v.optional(v.boolean()),
            joinedAfter: v.optional(v.number()),
            joinedBefore: v.optional(v.number()),
            lastLoginAfter: v.optional(v.number()),
            lastLoginBefore: v.optional(v.number()),
            searchTerm: v.optional(v.string()),
            createdAfter: v.optional(v.number()),
            createdBefore: v.optional(v.number()),
            updatedAfter: v.optional(v.number()),
            updatedBefore: v.optional(v.number()),
          }),
        ),
        sort: v.optional(
          v.object({
            sortBy: v.optional(
              v.union(
                v.literal("firstname"),
                v.literal("lastname"),
                v.literal("email"),
                v.literal("account"),
                v.literal("role"),
                v.literal("createdAt"),
                v.literal("updatedAt"),
                v.literal("lastLoginAt"),
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
        enhance: v.optional(
          v.object({
            includeFriends: v.optional(v.boolean()),
            includeTransactions: v.optional(v.boolean()),
            includeTourCards: v.optional(v.boolean()),
            includeTeams: v.optional(v.boolean()),
          }),
        ),
        activeOnly: v.optional(v.boolean()),
        adminOnly: v.optional(v.boolean()),
        onlineOnly: v.optional(v.boolean()),
        includeAnalytics: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      const member = await ctx.db.get(options.id);
      if (!member) return null;

      return await enhanceMember(ctx, member, options.enhance || {});
    }

    if (options.clerkId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", options.clerkId!))
        .first();
      if (!member) return null;

      return await enhanceMember(ctx, member, options.enhance || {});
    }

    if (options.ids) {
      const members = await Promise.all(
        options.ids.map(async (id) => {
          const member = await ctx.db.get(id);
          return member
            ? await enhanceMember(ctx, member, options.enhance || {})
            : null;
        }),
      );
      return members.filter(Boolean);
    }

    let members = await getOptimizedMembers(ctx, options);

    members = applyFilters(members, options.filter || {});

    const processedMembers = processData(members, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });

    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedMembers = await Promise.all(
        processedMembers.map((member) =>
          enhanceMember(ctx, member, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          members: enhancedMembers,
          analytics: await generateAnalytics(ctx, members),
          meta: {
            total: members.length,
            filtered: processedMembers.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedMembers;
    }

    const basicMembers = processedMembers.map((member) => ({
      ...member,
      fullName: generateFullName(member.firstname, member.lastname),
      formattedBalance: formatCents(member.account),
      effectiveDisplayName: generateDisplayName(
        member.firstname,
        member.lastname,
        member.email,
      ),
      hasBalance: member.account > 0,
      isOnline: isOnline(member.lastLoginAt),
      daysSinceLastLogin: calculateDaysSinceLastLogin(member.lastLoginAt),
      friendCount: member.friends.length,
    }));

    if (options.includeAnalytics) {
      return {
        members: basicMembers,
        analytics: await generateAnalytics(ctx, members),
        meta: {
          total: members.length,
          filtered: basicMembers.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicMembers;
  },
});

/**
 * Ensure the signed-in Clerk user is linked to a `members` record.
 *
 * Behavior:
 * - If a member already exists for this `clerkId`, returns it.
 * - Else tries to link an existing member by email.
 * - Else creates a new "regular" member.
 */
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
    const clerkId = args.clerkId.trim();
    if (!clerkId) throw new Error("Clerk ID is required to create/link member");

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: You must be signed in");
    if (identity.subject !== clerkId)
      throw new Error("Unauthorized: Clerk ID mismatch");

    const rawEmail = args.profile.email.trim();
    const email = normalize.email(rawEmail);
    if (!email) throw new Error("Email is required to create/link member");

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { lastLoginAt: Date.now() });
      return { status: "alreadyLinked" as const, memberId: existing._id };
    }

    let byEmail = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!byEmail && rawEmail && rawEmail !== email) {
      byEmail = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", rawEmail))
        .first();
    }

    if (byEmail) {
      if (byEmail.clerkId && byEmail.clerkId !== clerkId) {
        return {
          status: "conflict" as const,
          reason: "emailAlreadyLinked",
          memberId: byEmail._id,
        };
      }

      await ctx.db.patch(byEmail._id, {
        clerkId,
        ...(byEmail.email !== email ? { email } : {}),
        ...(args.profile.firstname && !byEmail.firstname
          ? { firstname: args.profile.firstname }
          : {}),
        ...(args.profile.lastname && !byEmail.lastname
          ? { lastname: args.profile.lastname }
          : {}),
        lastLoginAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { status: "linkedByEmail" as const, memberId: byEmail._id };
    }

    const newId = await ctx.db.insert("members", {
      clerkId,
      email,
      firstname: args.profile.firstname,
      lastname: args.profile.lastname,
      role: "regular",
      account: 0,
      friends: [],
      lastLoginAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { status: "created" as const, memberId: newId };
  },
});

/**
 * Admin tool: link an existing member to a Clerk user.
 */
export const adminLinkMemberToClerkUser = mutation({
  args: {
    adminClerkId: v.optional(v.string()),
    memberId: v.id("members"),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (existing) {
      throw new Error("That Clerk user is already linked to a member.");
    }

    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Member not found.");
    if (member.clerkId && member.clerkId !== args.clerkId) {
      throw new Error("Member is already linked to a different Clerk user.");
    }

    await ctx.db.patch(args.memberId, {
      clerkId: args.clerkId,
      updatedAt: Date.now(),
    });

    return { ok: true as const, memberId: args.memberId };
  },
});

/**
 * Admin tool: create a new member for a given Clerk user.
 */
export const adminCreateMemberForClerkUser = mutation({
  args: {
    adminClerkId: v.optional(v.string()),
    clerkId: v.string(),
    email: v.string(),
    firstname: v.optional(v.string()),
    lastname: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (existing) return { ok: true as const, memberId: existing._id };

    const rawEmail = args.email.trim();
    const email = normalize.email(rawEmail);
    if (!email) throw new Error("Email is required.");

    let byEmail = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!byEmail && rawEmail && rawEmail !== email) {
      byEmail = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", rawEmail))
        .first();
    }

    if (byEmail) {
      if (byEmail.clerkId && byEmail.clerkId !== args.clerkId) {
        throw new Error(
          "Member with this email is already linked to a Clerk user.",
        );
      }

      await ctx.db.patch(byEmail._id, {
        clerkId: args.clerkId,
        ...(byEmail.email !== email ? { email } : {}),
        ...(args.firstname && !byEmail.firstname
          ? { firstname: args.firstname }
          : {}),
        ...(args.lastname && !byEmail.lastname
          ? { lastname: args.lastname }
          : {}),
        updatedAt: Date.now(),
      });

      return { ok: true as const, memberId: byEmail._id };
    }

    const id = await ctx.db.insert("members", {
      clerkId: args.clerkId,
      email,
      firstname: args.firstname,
      lastname: args.lastname,
      role: "regular",
      account: 0,
      friends: [],
      updatedAt: Date.now(),
    });

    return { ok: true as const, memberId: id };
  },
});
/**
 * Get members with cursor-based pagination (for large datasets)
 *
 * Returns cursor-paginated results to handle large member tables efficiently.
 * Use this instead of getMembers when dealing with potentially large result sets.
 *
 * @example
 * First page
 * const firstPage = await ctx.runQuery(api.functions.members.getMembersPage, {
 *   paginationOpts: { numItems: 50 }
 * });
 *
 * Next page
 * if (!firstPage.isDone) {
 *   const nextPage = await ctx.runQuery(api.functions.members.getMembersPage, {
 *     paginationOpts: { numItems: 50, cursor: firstPage.continueCursor }
 *   });
 * }
 */
export const getMembersPage = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
      id: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        filter: v.optional(
          v.object({
            clerkId: v.optional(v.string()),
            email: v.optional(v.string()),
            role: v.optional(
              v.union(
                v.literal("admin"),
                v.literal("moderator"),
                v.literal("regular"),
              ),
            ),
            searchTerm: v.optional(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};
    const filter = options.filter || {};

    if (filter.clerkId) {
      return await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", filter.clerkId!))
        .paginate(args.paginationOpts);
    }

    if (filter.role) {
      return await ctx.db
        .query("members")
        .withIndex("by_role", (q) => q.eq("role", filter.role!))
        .paginate(args.paginationOpts);
    }

    const result = await ctx.db.query("members").paginate(args.paginationOpts);

    if (filter.email || filter.searchTerm) {
      const filtered = result.page.filter((member) => {
        if (filter.email && member.email !== filter.email) return false;
        if (filter.searchTerm) {
          const searchLower = filter.searchTerm.toLowerCase();
          const searchableText = [
            member.firstname,
            member.lastname,
            member.email,
          ]
            .join(" ")
            .toLowerCase();
          if (!searchableText.includes(searchLower)) return false;
        }
        return true;
      });

      return {
        ...result,
        page: filtered,
      };
    }

    return result;
  },
});

/**
 * Admin/support query: list members with minimal fields for Clerk linking.
 * Returns a single page with cursor for safe pagination.
 */
export const listMembersForClerkLinking = query({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.min(args.numItems ?? 100, 1000);

    const result = await ctx.db.query("members").paginate({
      cursor: args.cursor ?? null,
      numItems: pageSize,
    });

    return {
      members: result.page.map((m) => ({
        _id: m._id,
        clerkId: m.clerkId,
        email: m.email,
        firstname: m.firstname,
        lastname: m.lastname,
        role: m.role,
      })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Update members with comprehensive options
 *
 * @example
 * Basic update
 * const updatedMember = await ctx.runMutation(api.functions.members.updateMembers, {
 *   memberId: "member123",
 *   data: { firstname: "John", lastname: "Smith" }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.members.updateMembers, {
 *   memberId: "member123",
 *   data: { account: 50000 },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     recordLogin: true,
 *     autoUpdateDisplayName: true,
 *     returnEnhanced: true,
 *     includeFriends: true
 *   }
 * });
 */
export const updateMembers = mutation({
  args: {
    clerkId: v.optional(v.string()),
    memberId: v.id("members"),
    data: v.object({
      email: v.optional(v.string()),
      firstname: v.optional(v.string()),
      lastname: v.optional(v.string()),
      displayName: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
      role: v.optional(
        v.union(
          v.literal("admin"),
          v.literal("moderator"),
          v.literal("regular"),
        ),
      ),
      account: v.optional(v.number()),
      friends: v.optional(v.array(v.union(v.string(), v.id("members")))),
      lastLoginAt: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        updateTimestamp: v.optional(v.boolean()),
        recordLogin: v.optional(v.boolean()),
        autoUpdateDisplayName: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeFriends: v.optional(v.boolean()),
        includeTourCards: v.optional(v.boolean()),
        includeTeams: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error("Member not found");
    }

    const actingMember = await getActingMember(ctx, args.clerkId);
    const adminUser = actingMember.role === "admin";
    const isOwnProfile = actingMember._id === args.memberId;

    if (!adminUser && !isOwnProfile) {
      throw new Error("Forbidden: You can only update your own profile");
    }

    if (!adminUser) {
      if (args.data.role !== undefined) {
        throw new Error("Forbidden: Only admins can change roles");
      }
      if (args.data.account !== undefined) {
        throw new Error("Forbidden: Only admins can modify account balances");
      }
      if (args.data.isActive !== undefined) {
        throw new Error("Forbidden: Only admins can change active status");
      }
    }

    if (!options.skipValidation) {
      const validation = validateMemberData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      if (args.data.email && args.data.email !== member.email) {
        const normalized = normalize.email(args.data.email);
        const existingMember = await ctx.db
          .query("members")
          .withIndex("by_email", (q) => q.eq("email", normalized))
          .first();

        if (existingMember && existingMember._id !== args.memberId) {
          throw new Error("Member with this email already exists");
        }

        const raw = args.data.email.trim();
        if (raw && raw !== normalized) {
          const existingRaw = await ctx.db
            .query("members")
            .withIndex("by_email", (q) => q.eq("email", raw))
            .first();
          if (existingRaw && existingRaw._id !== args.memberId) {
            throw new Error("Member with this email already exists");
          }
        }
      }
    }

    const updateData: Partial<MemberDoc> = {
      ...args.data,
      ...(args.data.email ? { email: normalize.email(args.data.email) } : {}),
    };

    if (options.recordLogin) {
      updateData.lastLoginAt = Date.now();
    }

    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

    await ctx.db.patch(args.memberId, updateData);

    const didNameChange =
      (updateData.firstname !== undefined &&
        updateData.firstname !== member.firstname) ||
      (updateData.lastname !== undefined &&
        updateData.lastname !== member.lastname);

    if (didNameChange) {
      const effectiveEmail = updateData.email ?? member.email;
      const effectiveFirst = updateData.firstname ?? member.firstname;
      const effectiveLast = updateData.lastname ?? member.lastname;
      const effectiveDisplayName =
        args.data.displayName ?? readOptionalDisplayName(member);

      const nextTourCardDisplayName = generateDisplayName(
        typeof effectiveDisplayName === "string"
          ? effectiveDisplayName
          : undefined,
        effectiveFirst,
        effectiveLast,
        effectiveEmail,
      );

      const currentYear = new Date().getFullYear();
      const seasonsForYear = await ctx.db
        .query("seasons")
        .withIndex("by_year", (q) => q.eq("year", currentYear))
        .collect();

      const currentSeason =
        seasonsForYear.length > 0
          ? seasonsForYear.reduce((best, s) =>
              s.number > best.number ? s : best,
            )
          : null;

      const tourCardsToUpdate = currentSeason
        ? await ctx.db
            .query("tourCards")
            .withIndex("by_member_season", (q) =>
              q.eq("memberId", args.memberId).eq("seasonId", currentSeason._id),
            )
            .collect()
        : await ctx.db
            .query("tourCards")
            .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
            .collect();

      if (tourCardsToUpdate.length > 0) {
        const candidates = currentSeason
          ? tourCardsToUpdate
          : [
              tourCardsToUpdate.reduce((best, tc) =>
                tc._creationTime > best._creationTime ? tc : best,
              ),
            ];

        for (const tc of candidates) {
          if (tc.displayName === nextTourCardDisplayName) continue;
          await ctx.db.patch(tc._id, {
            displayName: nextTourCardDisplayName,
            updatedAt: Date.now(),
          });
        }
      }
    }

    const changes = computeChanges(member, updateData);
    if (Object.keys(changes).length > 0) {
      await logAudit(ctx, {
        entityType: "members",
        entityId: args.memberId,
        action: "updated",
        changes,
        metadata: {
          isOwnProfile,
          isAdmin: adminUser,
        },
      });
    }

    const updatedMember = await ctx.db.get(args.memberId);
    if (!updatedMember) throw new Error("Failed to retrieve updated member");

    if (options.returnEnhanced) {
      return await enhanceMember(ctx, updatedMember, {
        includeFriends: options.includeFriends,
        includeTourCards: options.includeTourCards,
        includeTeams: options.includeTeams,
      });
    }

    return updatedMember;
  },
});

export const getMyTournamentHistory = query({
  args: {
    options: v.optional(
      v.object({
        limit: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const member = await getActingMember(ctx, undefined);
    const limit = args.options?.limit;

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();

    if (tourCards.length === 0) {
      return [];
    }

    const teamsNested = await Promise.all(
      tourCards.map((tc) =>
        ctx.db
          .query("teams")
          .withIndex("by_tour_card", (q) => q.eq("tourCardId", tc._id))
          .collect(),
      ),
    );
    const teams = teamsNested.flat();

    const tournamentIds = Array.from(new Set(teams.map((t) => t.tournamentId)));

    const tournaments = await Promise.all(
      tournamentIds.map((id) => ctx.db.get(id)),
    );

    const tournamentById = new Map(
      tournaments
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .map((t) => [t._id, t]),
    );

    const tourCardById = new Map(tourCards.map((tc) => [tc._id, tc]));

    const rows = teams
      .map((team) => {
        const tournament = tournamentById.get(team.tournamentId);
        const tourCard = tourCardById.get(team.tourCardId);
        if (!tournament || !tourCard) return null;

        return {
          teamId: team._id,
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          tournamentStartDate: tournament.startDate,
          tournamentEndDate: tournament.endDate,
          seasonId: tournament.seasonId,
          tourCardId: tourCard._id,
          tourCardDisplayName: tourCard.displayName,
          teamName: tourCard.displayName,
          points: team.points,
          position: team.position,
          earnings: team.earnings,
          updatedAt: team.updatedAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        const aTime = a.tournamentStartDate ?? 0;
        const bTime = b.tournamentStartDate ?? 0;
        if (aTime !== bTime) return bTime - aTime;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });

    return limit !== undefined ? rows.slice(0, limit) : rows;
  },
});

/**
 * Recomputes `members.isActive` based on recent participation.
 *
 * Definition:
 * - Active if the member has no tourCards (signed up but never played)
 * - Active if the member has a tourCard in either of the two most recent seasons BEFORE the current season
 * - Otherwise inactive
 */
export const recomputeMemberActiveFlags = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const seasons = await ctx.db.query("seasons").collect();

    const sortedSeasons = seasons.slice().sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.number !== b.number) return b.number - a.number;

      const aStart = a.startDate ?? 0;
      const bStart = b.startDate ?? 0;
      if (aStart !== bStart) return bStart - aStart;

      return b._creationTime - a._creationTime;
    });

    const currentSeason = sortedSeasons[0] ?? null;
    const previousTwoSeasons = sortedSeasons.slice(1, 3);
    const activeSeasonIds = new Set(previousTwoSeasons.map((s) => s._id));

    const tourCards = await ctx.db.query("tourCards").collect();
    const membersWithAnyTourCard = new Set<string>();
    const membersWithRecentTourCard = new Set<string>();

    for (const tc of tourCards) {
      membersWithAnyTourCard.add(tc.memberId);
      if (activeSeasonIds.has(tc.seasonId)) {
        membersWithRecentTourCard.add(tc.memberId);
      }
    }

    const members = await ctx.db.query("members").collect();

    let updated = 0;
    let activeCount = 0;
    let inactiveCount = 0;
    const now = Date.now();

    for (const m of members) {
      const hasAny = membersWithAnyTourCard.has(m._id);
      const hasRecent = membersWithRecentTourCard.has(m._id);
      const nextIsActive = hasRecent || !hasAny;

      if (m.isActive !== nextIsActive) {
        await ctx.db.patch(m._id, { isActive: nextIsActive, updatedAt: now });
        updated += 1;
      }

      if (nextIsActive) activeCount += 1;
      else inactiveCount += 1;
    }

    return {
      ok: true,
      currentSeasonId: currentSeason?._id ?? null,
      activeSeasonIds: [...activeSeasonIds],
      membersTotal: members.length,
      updated,
      activeCount,
      inactiveCount,
    } as const;
  },
});

export const normalizeMemberNamesAndTourCardDisplayNames = mutation({
  args: {
    options: v.optional(
      v.object({
        dryRun: v.optional(v.boolean()),
        limit: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const dryRun = args.options?.dryRun ?? false;
    const limit = args.options?.limit;

    const membersAll = await ctx.db.query("members").collect();
    const members =
      typeof limit === "number" ? membersAll.slice(0, limit) : membersAll;

    const tourCards = await ctx.db.query("tourCards").collect();
    const tourCardsByMemberId = new Map<string, (typeof tourCards)[number][]>();

    for (const tc of tourCards) {
      const list = tourCardsByMemberId.get(tc.memberId);
      if (list) list.push(tc);
      else tourCardsByMemberId.set(tc.memberId, [tc]);
    }

    let membersUpdated = 0;
    let tourCardsUpdated = 0;
    const now = Date.now();

    const examples: Array<{
      memberId: string;
      email: string;
      before: { firstname: string; lastname: string };
      after: { firstname: string; lastname: string };
      tourCardsUpdated: number;
    }> = [];

    for (const m of members) {
      const beforeFirst = m.firstname ?? "";
      const beforeLast = m.lastname ?? "";

      const afterFirst = normalizePersonName(beforeFirst);
      const afterLast = normalizePersonName(beforeLast);

      const memberChanged =
        beforeFirst !== afterFirst || beforeLast !== afterLast;
      if (memberChanged) {
        if (!dryRun) {
          await ctx.db.patch(m._id, {
            firstname: afterFirst || undefined,
            lastname: afterLast || undefined,
            updatedAt: now,
          });
        }
        membersUpdated += 1;
      }

      const fullName = generateFullName(afterFirst, afterLast);
      if (!fullName) continue;

      const memberTourCards = tourCardsByMemberId.get(m._id) ?? [];
      let memberTourCardsUpdated = 0;

      for (const tc of memberTourCards) {
        if (tc.displayName === fullName) continue;
        if (!dryRun) {
          await ctx.db.patch(tc._id, { displayName: fullName, updatedAt: now });
        }
        tourCardsUpdated += 1;
        memberTourCardsUpdated += 1;
      }

      if (
        (memberChanged || memberTourCardsUpdated > 0) &&
        examples.length < 15
      ) {
        examples.push({
          memberId: m._id,
          email: m.email,
          before: { firstname: beforeFirst, lastname: beforeLast },
          after: { firstname: afterFirst, lastname: afterLast },
          tourCardsUpdated: memberTourCardsUpdated,
        });
      }
    }

    return {
      ok: true,
      dryRun,
      membersScanned: members.length,
      membersUpdated,
      tourCardsScanned: tourCards.length,
      tourCardsUpdated,
      examples,
    } as const;
  },
});

/**
 * Delete members (hard delete only)
 *
 * This function always performs a hard delete (permanent removal from database).
 * The softDelete option is kept for backward compatibility but is ignored.
 *
 * @example
 * Delete member
 * const result = await ctx.runMutation(api.functions.members.deleteMembers, {
 *   memberId: "member123"
 * });
 *
 * Delete with data migration and friendship cleanup
 * const result = await ctx.runMutation(api.functions.members.deleteMembers, {
 *   memberId: "member123",
 *   options: {
 *     cascadeDelete: true,
 *     transferToMember: "newMember456",
 *     removeFriendships: true
 *   }
 * });
 */
export const deleteMembers = mutation({
  args: {
    adminClerkId: v.optional(v.string()),
    memberId: v.id("members"),
    options: v.optional(
      v.object({
        softDelete: v.optional(v.boolean()),
        cascadeDelete: v.optional(v.boolean()),
        transferToMember: v.optional(v.id("members")),
        removeFriendships: v.optional(v.boolean()),
        returnDeletedData: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<DeleteResponse<MemberDoc>> => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error("Member not found");
    }

    let transferredCount = 0;
    let deletedMemberData: MemberDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedMemberData = member;
    }

    if (options.transferToMember) {
      const targetMember = await ctx.db.get(options.transferToMember);
      if (!targetMember) {
        throw new Error("Target member for data transfer not found");
      }

      const memberTourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect();

      for (const tourCard of memberTourCards) {
        await ctx.db.patch(tourCard._id, {
          memberId: targetMember._id,
          updatedAt: Date.now(),
        });
        transferredCount++;
      }
    }

    if (options.removeFriendships) {
      const allMembers = await ctx.db
        .query("members")
        .paginate({ cursor: null, numItems: 1000 });

      if (!allMembers.isDone) {
        throw new Error(
          "Member has too many potential friendships to clean up in one operation. " +
            "Database has >1000 members. Please use admin batch cleanup tool or contact support.",
        );
      }

      for (const otherMember of allMembers.page) {
        if (
          otherMember._id !== args.memberId &&
          otherMember.friends.includes(args.memberId)
        ) {
          const updatedFriends = otherMember.friends.filter(
            (friendId) => friendId !== args.memberId,
          );
          await ctx.db.patch(otherMember._id, {
            friends: updatedFriends,
            updatedAt: Date.now(),
          });
        }
      }
    }

    if (options.cascadeDelete && !options.transferToMember) {
      const memberTourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect();

      for (const tourCard of memberTourCards) {
        await ctx.db.delete(tourCard._id);
      }
      const allMembers = await ctx.db
        .query("members")
        .paginate({ cursor: null, numItems: 1000 });

      if (!allMembers.isDone) {
        throw new Error(
          "Member has too many potential friendships to clean up in one operation. " +
            "Database has >1000 members. Please use admin batch cleanup tool or contact support.",
        );
      }

      for (const otherMember of allMembers.page) {
        if (
          otherMember._id !== args.memberId &&
          otherMember.friends.includes(args.memberId)
        ) {
          const updatedFriends = otherMember.friends.filter(
            (friendId) => friendId !== args.memberId,
          );
          await ctx.db.patch(otherMember._id, {
            friends: updatedFriends,
            updatedAt: Date.now(),
          });
        }
      }
    }

    await ctx.db.delete(args.memberId);

    await logAudit(ctx, {
      entityType: "members",
      entityId: args.memberId,
      action: "deleted",
      metadata: extractDeleteMetadata(
        { deleted: true, transferredCount },
        options,
      ),
    });

    return {
      success: true,
      deleted: true,
      deactivated: false,
      transferredCount: transferredCount > 0 ? transferredCount : undefined,
      deletedData: deletedMemberData,
    };
  },
});

/**
 * Get optimized members based on query options using indexes
 */
async function getOptimizedMembers(
  ctx: DatabaseContext,
  options: MemberOptimizedQueryOptions,
): Promise<MemberDoc[]> {
  const filter = options.filter || {};

  if (filter.clerkId) {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", filter.clerkId!))
      .first();
    return member ? [member] : [];
  }

  if (filter.email) {
    const normalized = normalize.email(filter.email);
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();

    if (member) return [member];

    const raw = filter.email.trim();
    if (raw && raw !== normalized) {
      const memberRaw = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", raw))
        .first();
      return memberRaw ? [memberRaw] : [];
    }

    return [];
  }

  if (filter.role) {
    return await ctx.db
      .query("members")
      .withIndex("by_role", (q) => q.eq("role", filter.role!))
      .collect();
  }

  if (options.adminOnly) {
    return await ctx.db
      .query("members")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
  }

  return await ctx.db.query("members").collect();
}

/**
 * Apply comprehensive filters to members
 */
function applyFilters(
  members: MemberDoc[],
  filter: MemberFilterOptions,
): MemberDoc[] {
  return members.filter((member) => {
    if (filter.hasBalance !== undefined) {
      const hasBalance = member.account > 0;
      if (hasBalance !== filter.hasBalance) {
        return false;
      }
    }

    if (filter.minBalance !== undefined && member.account < filter.minBalance) {
      return false;
    }

    if (filter.maxBalance !== undefined && member.account > filter.maxBalance) {
      return false;
    }

    if (filter.hasFriends !== undefined) {
      const hasFriends = member.friends.length > 0;
      if (hasFriends !== filter.hasFriends) {
        return false;
      }
    }

    if (filter.isOnline !== undefined) {
      const memberIsOnline = isOnline(member.lastLoginAt);
      if (memberIsOnline !== filter.isOnline) {
        return false;
      }
    }

    if (
      filter.joinedAfter !== undefined &&
      member._creationTime < filter.joinedAfter
    ) {
      return false;
    }

    if (
      filter.joinedBefore !== undefined &&
      member._creationTime > filter.joinedBefore
    ) {
      return false;
    }

    if (filter.lastLoginAfter !== undefined) {
      if (!member.lastLoginAt || member.lastLoginAt < filter.lastLoginAfter) {
        return false;
      }
    }

    if (filter.lastLoginBefore !== undefined) {
      if (!member.lastLoginAt || member.lastLoginAt > filter.lastLoginBefore) {
        return false;
      }
    }

    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [
        member.firstname || "",
        member.lastname || "",
        member.email,
      ]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    if (
      filter.createdAfter !== undefined &&
      member._creationTime < filter.createdAfter
    ) {
      return false;
    }

    if (
      filter.createdBefore !== undefined &&
      member._creationTime > filter.createdBefore
    ) {
      return false;
    }

    if (
      filter.updatedAfter !== undefined &&
      (member.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }

    if (
      filter.updatedBefore !== undefined &&
      (member.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
function getSortFunction(sort: MemberSortOptions): MemberSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "firstname":
      return (a: MemberDoc, b: MemberDoc) =>
        (a.firstname || "").localeCompare(b.firstname || "") * sortOrder;
    case "lastname":
      return (a: MemberDoc, b: MemberDoc) =>
        (a.lastname || "").localeCompare(b.lastname || "") * sortOrder;
    case "email":
      return (a: MemberDoc, b: MemberDoc) =>
        a.email.localeCompare(b.email) * sortOrder;
    case "account":
      return (a: MemberDoc, b: MemberDoc) =>
        (a.account - b.account) * sortOrder;
    case "role":
      return (a: MemberDoc, b: MemberDoc) =>
        a.role.localeCompare(b.role) * sortOrder;
    case "createdAt":
      return (a: MemberDoc, b: MemberDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: MemberDoc, b: MemberDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    case "lastLoginAt":
      return (a: MemberDoc, b: MemberDoc) =>
        ((a.lastLoginAt || 0) - (b.lastLoginAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single member with related data
 */
async function enhanceMember(
  ctx: DatabaseContext,
  member: MemberDoc,
  enhance: MemberEnhancementOptions,
): Promise<EnhancedMemberDoc> {
  const enhanced: EnhancedMemberDoc = {
    ...member,
    fullName: generateFullName(member.firstname, member.lastname),
    formattedBalance: formatCents(member.account),
    hasBalance: member.account > 0,
    isOnline: isOnline(member.lastLoginAt),
    daysSinceLastLogin: calculateDaysSinceLastLogin(member.lastLoginAt),
    friendCount: member.friends.length,
  };

  if (enhance.includeFriends && member.friends.length > 0) {
    const friendMembers = await Promise.all(
      member.friends.map(async (friendId) => {
        if (typeof friendId === "string") {
          const byClerk = await ctx.db
            .query("members")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", friendId))
            .first();
          if (byClerk) return byClerk;
          return await ctx.db
            .query("members")
            .withIndex("by_email", (q) => q.eq("email", friendId))
            .first();
        } else {
          return await ctx.db.get(friendId);
        }
      }),
    );
    enhanced.friendMembers = friendMembers.filter(
      (f): f is MemberDoc => f !== null,
    );
  }

  if (enhance.includeTourCards) {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();
    enhanced.tourCards = tourCards;
  }

  if (enhance.includeTeams) {
    const memberTourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();

    const teams = await ctx.db.query("teams").collect();
    const memberTeams = teams.filter((team) =>
      memberTourCards.some((tc) => tc._id === team.tourCardId),
    );
    enhanced.teams = memberTeams;
  }

  if (enhance.includeTransactions) {
    enhanced.transactions = [];
  }

  return enhanced;
}

/**
 * Generate analytics for members
 */
async function generateAnalytics(
  _ctx: DatabaseContext,
  members: MemberDoc[],
): Promise<AnalyticsResult> {
  const now = Date.now();
  const weekAgo = now - 7 * TIME.MS_PER_DAY;

  const activeMembers = members;
  const onlineMembers = members.filter((m) => isOnline(m.lastLoginAt));
  const recentlyActiveMembers = members.filter(
    (m) => m.lastLoginAt && m.lastLoginAt > weekAgo,
  );

  return {
    total: members.length,
    active: activeMembers.length,
    inactive: 0,
    statistics: {
      totalBalance: members.reduce((sum, m) => sum + m.account, 0),
      averageBalance:
        members.length > 0
          ? members.reduce((sum, m) => sum + m.account, 0) / members.length
          : 0,
      membersWithBalance: members.filter((m) => m.account > 0).length,
      adminCount: members.filter((m) => m.role === "admin").length,
      moderatorCount: members.filter((m) => m.role === "moderator").length,
      regularCount: members.filter((m) => m.role === "regular").length,
      onlineMembers: onlineMembers.length,
      recentlyActive: recentlyActiveMembers.length,
      averageFriends:
        members.length > 0
          ? members.reduce((sum, m) => sum + m.friends.length, 0) /
            members.length
          : 0,
    },
    breakdown: members.reduce(
      (acc, member) => {
        acc[member.role] = (acc[member.role] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}

/**
 * Returns counts for all documents that reference a member and would be moved during a merge.
 */
export const adminGetMemberMergePreview = query({
  args: {
    sourceMemberId: v.id("members"),
    targetMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const source = await ctx.db.get(args.sourceMemberId);
    if (!source) {
      return {
        ok: false,
        error: "Source member not found",
      } as const;
    }

    const target = args.targetMemberId
      ? await ctx.db.get(args.targetMemberId)
      : null;

    if (args.targetMemberId && !target) {
      return {
        ok: false,
        error: "Target member not found",
      } as const;
    }

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    const pushSubscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    const auditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    const allMembers = await ctx.db.query("members").collect();
    const sourceId = String(args.sourceMemberId);

    let friendRefCount = 0;
    for (const m of allMembers) {
      if (String(m._id) === sourceId) continue;
      if (m.friends.some((f) => String(f) === sourceId)) {
        friendRefCount += 1;
      }
    }

    const sourceClerkId =
      typeof source.clerkId === "string" ? source.clerkId : null;
    const clerkIdOwner = sourceClerkId
      ? await ctx.db
          .query("members")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", sourceClerkId))
          .first()
      : null;

    return {
      ok: true,
      source: {
        _id: source._id,
        clerkId: source.clerkId ?? null,
        email: source.email,
        displayName: readOptionalDisplayName(source) ?? null,
        firstname: source.firstname ?? null,
        lastname: source.lastname ?? null,
        role: source.role,
        isActive: source.isActive ?? null,
        account: source.account,
      },
      target: target
        ? {
            _id: target._id,
            clerkId: target.clerkId ?? null,
            email: target.email,
            displayName: readOptionalDisplayName(target) ?? null,
            firstname: target.firstname ?? null,
            lastname: target.lastname ?? null,
            role: target.role,
            isActive: target.isActive ?? null,
            account: target.account,
          }
        : null,
      counts: {
        tourCards: tourCards.length,
        transactions: transactions.length,
        pushSubscriptions: pushSubscriptions.length,
        auditLogs: auditLogs.length,
        membersReferencingAsFriend: friendRefCount,
      },
      warnings: {
        sourceMissingClerkId: !sourceClerkId,
        clerkIdAlsoOnDifferentMember:
          !!sourceClerkId &&
          !!clerkIdOwner &&
          String(clerkIdOwner._id) !== String(source._id),
        targetAlreadyHasDifferentClerkId:
          !!target &&
          !!sourceClerkId &&
          !!target.clerkId &&
          target.clerkId !== sourceClerkId,
      },
    } as const;
  },
});

/**
 * Merges two member records by moving all `memberId` references from the source member to the target member,
 * copying the source `clerkId` onto the target member, then deleting the source member.
 */
export const adminMergeMembers = mutation({
  args: {
    sourceMemberId: v.id("members"),
    targetMemberId: v.id("members"),
    options: v.optional(
      v.object({
        overwriteTargetClerkId: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (String(args.sourceMemberId) === String(args.targetMemberId)) {
      throw new Error("Source and target members must be different");
    }

    const source = await ctx.db.get(args.sourceMemberId);
    if (!source) {
      throw new Error("Source member not found");
    }

    const target = await ctx.db.get(args.targetMemberId);
    if (!target) {
      throw new Error("Target member not found");
    }

    const sourceClerkId =
      typeof source.clerkId === "string" ? source.clerkId.trim() : "";
    if (!sourceClerkId) {
      throw new Error("Source member has no clerkId to merge");
    }

    const overwriteTargetClerkId = !!args.options?.overwriteTargetClerkId;

    if (
      target.clerkId &&
      target.clerkId !== sourceClerkId &&
      !overwriteTargetClerkId
    ) {
      throw new Error(
        "Target member already has a different clerkId. Enable overwriteTargetClerkId to replace it.",
      );
    }

    const clerkIdOwner = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", sourceClerkId))
      .first();

    if (clerkIdOwner && String(clerkIdOwner._id) !== String(source._id)) {
      throw new Error("Another member already has the source clerkId");
    }

    const targetPatch: Record<string, unknown> = {
      clerkId: sourceClerkId,
      account: target.account + source.account,
      isActive: (target.isActive ?? false) || (source.isActive ?? false),
      updatedAt: Date.now(),
    };

    if (!target.firstname && source.firstname) {
      targetPatch.firstname = source.firstname;
    }
    if (!target.lastname && source.lastname) {
      targetPatch.lastname = source.lastname;
    }
    const targetDisplayName = readOptionalDisplayName(target);
    const sourceDisplayName = readOptionalDisplayName(source);
    if (!targetDisplayName && sourceDisplayName) {
      targetPatch.displayName = sourceDisplayName;
    }

    await ctx.db.patch(args.targetMemberId, targetPatch);

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    for (const tc of tourCards) {
      await ctx.db.patch(tc._id, { memberId: args.targetMemberId });
    }

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    for (const tx of transactions) {
      await ctx.db.patch(tx._id, { memberId: args.targetMemberId });
    }

    const pushSubscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    for (const ps of pushSubscriptions) {
      await ctx.db.patch(ps._id, { memberId: args.targetMemberId });
    }

    const auditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    for (const al of auditLogs) {
      await ctx.db.patch(al._id, { memberId: args.targetMemberId });
    }

    const allMembers = await ctx.db.query("members").collect();
    const sourceId = String(args.sourceMemberId);
    const targetId = String(args.targetMemberId);

    let membersUpdatedForFriends = 0;
    for (const m of allMembers) {
      if (String(m._id) === sourceId) continue;

      if (!m.friends.some((f) => String(f) === sourceId)) continue;

      const nextFriends = m.friends
        .map((f) => (String(f) === sourceId ? targetId : f))
        .filter(
          (f, idx, arr) =>
            arr.findIndex((x) => String(x) === String(f)) === idx,
        );

      await ctx.db.patch(m._id, {
        friends: nextFriends,
        updatedAt: Date.now(),
      });
      membersUpdatedForFriends += 1;
    }

    const remainingTourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();
    const remainingTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();
    const remainingPushSubscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();
    const remainingAuditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_member", (q) => q.eq("memberId", args.sourceMemberId))
      .collect();

    if (
      remainingTourCards.length > 0 ||
      remainingTransactions.length > 0 ||
      remainingPushSubscriptions.length > 0 ||
      remainingAuditLogs.length > 0
    ) {
      throw new Error("Merge incomplete: source member still has references");
    }

    await ctx.db.delete(args.sourceMemberId);

    return {
      ok: true,
      sourceMemberId: args.sourceMemberId,
      targetMemberId: args.targetMemberId,
      moved: {
        tourCards: tourCards.length,
        transactions: transactions.length,
        pushSubscriptions: pushSubscriptions.length,
        auditLogs: auditLogs.length,
        membersUpdatedForFriends,
      },
    } as const;
  },
});

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
      await requireAdminByClerkId(ctx as unknown as AuthCtx, actingClerkId);
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
