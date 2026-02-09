/**
 * Member Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation, action, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../utils/auth";
import { internal } from "../_generated/api";
import {
  logAudit,
  computeChanges,
  extractDeleteMetadata,
} from "../utils/auditLog";
import { processData } from "../utils/batchProcess";
import {
  applyFilters,
  buildFullName,
  calculateDaysSinceLastLogin,
  enhanceMember,
  fetchClerkUsers,
  generateAnalytics,
  generateFullName,
  generateDisplayName,
  getActingMember,
  getSortFunction,
  getOptimizedMembers,
  isOnline,
  pickPrimaryEmail,
  readOptionalDisplayName,
  applyWhereConditions,
  buildOrderByComparator,
} from "../utils/members";
import { membersValidators } from "../validators/members";
import type { DeleteResponse, MemberDoc } from "../types/types";

import type { ClerkUser, ClerkUserRow } from "../types/members";
import { formatCents, normalize } from "../utils";

export const getIsAdminByClerkId_Internal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return {
      ok: true,
      isAdmin: Boolean(member && member.role === "admin"),
    } as const;
  },
});

export const getEnhancedMembersLinkInfo_Internal = internalQuery({
  args: {
    clerkIds: v.array(v.string()),
    emails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const linkedByClerkId: Record<string, string> = {};
    const suggestedByEmail: Record<
      string,
      { memberId: string; email: string }
    > = {};

    const uniqueClerkIds = Array.from(
      new Set(args.clerkIds.map((c) => c.trim())),
    ).filter(Boolean);
    const uniqueEmails = Array.from(
      new Set(args.emails.map((e) => e.trim())),
    ).filter(Boolean);

    for (const clerkId of uniqueClerkIds) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
        .first();
      if (member) linkedByClerkId[clerkId] = member._id;
    }

    for (const email of uniqueEmails) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();

      if (member && !member.clerkId) {
        suggestedByEmail[email] = { memberId: member._id, email: member.email };
      }
    }

    return { ok: true, linkedByClerkId, suggestedByEmail } as const;
  },
});

/**
 * Fetches a page of Clerk users and enriches each row with member linking info.
 *
 * This is intended for admin tooling: it returns Clerk users along with:
 * - `linkedMemberId` when there is a `members` row with matching `members.clerkId`.
 * - `suggestedMemberId` when there is an *unlinked* member whose email matches the Clerk user.
 *
 * Auth:
 * - If the action is called without an authenticated Convex identity, it uses `args.clerkId`
 *   and verifies the member is an admin.
 *
 * @param ctx Convex action context.
 * @param args.clerkId Optional acting Clerk id (used only for fallback admin checks).
 * @param args.options Pagination options.
 * @returns A page of Clerk-user rows with linking suggestions.
 */
export const getEnhancedMembers = action({
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
    users: Array<{
      clerkId: string;
      email: string | null;
      fullName: string;
      linkedMemberId: string | null;
      suggestedMemberId: string | null;
      suggestedMemberEmail: string | null;
    }>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();

    const passedClerkId = args.clerkId?.trim();
    if (identity && passedClerkId && identity.subject !== passedClerkId) {
      throw new Error("Unauthorized: Clerk ID mismatch");
    }

    const effectiveClerkId = (identity?.subject ?? passedClerkId ?? "").trim();
    if (!effectiveClerkId) {
      throw new Error("Unauthorized: You must be signed in");
    }

    const adminCheck = await ctx.runQuery(
      internal.functions.members.getIsAdminByClerkId_Internal,
      { clerkId: effectiveClerkId },
    );
    if (!adminCheck.isAdmin) {
      throw new Error("Forbidden: Admin access required");
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

    const normalizedEmails = users
      .map((u) =>
        typeof u.email === "string" ? normalize.email(u.email) : null,
      )
      .filter((e): e is string => typeof e === "string" && e.trim().length > 0);

    const linkInfo = await ctx.runQuery(
      internal.functions.members.getEnhancedMembersLinkInfo_Internal,
      {
        clerkIds: users.map((u) => u.clerkId),
        emails: normalizedEmails,
      },
    );

    const enhanced = users.map((u) => {
      const linkedMemberId = linkInfo.linkedByClerkId[u.clerkId] ?? null;
      if (linkedMemberId) {
        return {
          ...u,
          linkedMemberId,
          suggestedMemberId: null,
          suggestedMemberEmail: null,
        };
      }

      const normalizedEmail =
        typeof u.email === "string" ? normalize.email(u.email) : null;
      const suggestion =
        normalizedEmail && normalizedEmail.trim().length > 0
          ? (linkInfo.suggestedByEmail[normalizedEmail] ?? null)
          : null;

      return {
        ...u,
        linkedMemberId: null,
        suggestedMemberId: suggestion ? suggestion.memberId : null,
        suggestedMemberEmail: suggestion ? suggestion.email : null,
      };
    });

    return {
      ok: true,
      offset,
      limit,
      fetched: clerkUsers.length,
      users: enhanced,
    };
  },
});

/**
 * Creates a new member.
 *
 * Auth:
 * - Requires an admin (via `requireAdmin`).
 *
 * Validation:
 * - By default, validates the incoming payload and enforces uniqueness for both `clerkId` and `email`.
 * - Set `options.skipValidation` to bypass validation/uniqueness checks.
 *
 * Options:
 * - `initialBalance` overrides `data.account`.
 * - `recordLogin` sets `lastLoginAt` to now.
 * - `returnEnhanced` returns an enriched member via `enhanceMember`.
 *
 * @param ctx Convex mutation context.
 * @param args.data Core member fields.
 * @param args.options Optional behavior flags.
 * @returns The created member document, or an enhanced member when `returnEnhanced` is true.
 *
 * @example
 * const member = await ctx.runMutation(api.functions.members.createMembers, {
 *   data: { clerkId: "user_123", email: "test@example.com", firstname: "Pat" },
 *   options: { initialBalance: 2500, returnEnhanced: true, includeFriends: true },
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
      const validation = membersValidators.validateMemberData(data);

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
 *
 * Generic where + orderBy (filter/sort by arbitrary fields)
 *
 * Supported derived fields in `where`/`orderBy`:
 * - `fullName`, `formattedBalance`, `effectiveDisplayName`, `hasBalance`, `isOnline`,
 *   `daysSinceLastLogin`, `friendCount`
 * const result = await ctx.runQuery(api.functions.members.getMembers, {
 *   options: {
 *     where: [
 *       { field: "email", op: "contains", value: "@example.com", caseInsensitive: true },
 *       { field: "hasBalance", op: "eq", value: true },
 *     ],
 *     orderBy: [
 *       { field: "account", direction: "desc" },
 *       { field: "lastname", direction: "asc", caseInsensitive: true },
 *     ],
 *     pagination: { limit: 100, offset: 0 },
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
        where: v.optional(
          v.array(
            v.object({
              field: v.string(),
              op: v.optional(
                v.union(
                  v.literal("eq"),
                  v.literal("neq"),
                  v.literal("in"),
                  v.literal("gt"),
                  v.literal("gte"),
                  v.literal("lt"),
                  v.literal("lte"),
                  v.literal("contains"),
                  v.literal("startsWith"),
                  v.literal("endsWith"),
                  v.literal("includes"),
                  v.literal("exists"),
                ),
              ),
              value: v.optional(
                v.union(
                  v.string(),
                  v.number(),
                  v.boolean(),
                  v.null(),
                  v.id("members"),
                ),
              ),
              values: v.optional(
                v.array(
                  v.union(
                    v.string(),
                    v.number(),
                    v.boolean(),
                    v.null(),
                    v.id("members"),
                  ),
                ),
              ),
              caseInsensitive: v.optional(v.boolean()),
            }),
          ),
        ),
        orderBy: v.optional(
          v.array(
            v.object({
              field: v.string(),
              direction: v.optional(
                v.union(v.literal("asc"), v.literal("desc")),
              ),
              nulls: v.optional(v.union(v.literal("first"), v.literal("last"))),
              caseInsensitive: v.optional(v.boolean()),
            }),
          ),
        ),
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

    members = applyWhereConditions(members, options.where);
    members = applyFilters(members, options.filter || {});

    const processedMembers = processData(members, {
      sort:
        options.orderBy && options.orderBy.length > 0
          ? buildOrderByComparator(options.orderBy)
          : getSortFunction(options.sort || {}),
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
 * Updates a member by `memberId`.
 *
 * Auth:
 * - Admins can update any member.
 * - Non-admins can only update their own member record.
 * - Non-admins cannot change: `role`, `account`, or `isActive`.
 *
 * Validation:
 * - By default, validates the patch payload and enforces email uniqueness.
 * - Set `options.skipValidation` to bypass validation/uniqueness checks.
 *
 * Side effects:
 * - When first/last name changes, the member’s tour card display name may be updated for the current season
 *   (or the latest tour card) to keep UI-facing names consistent.
 * - Writes an audit log entry when changes are applied.
 *
 * @param ctx Convex mutation context.
 * @param args.clerkId Optional acting Clerk id (used to resolve the acting member).
 * @param args.memberId Member document id to update.
 * @param args.data Patch object.
 * @param args.options Optional behavior flags.
 * @returns The updated member document, or an enhanced member when `returnEnhanced` is true.
 *
 * @example
 * const updated = await ctx.runMutation(api.functions.members.updateMembers, {
 *   memberId,
 *   data: { firstname: "Pat", lastname: "Golfer" },
 * });
 *
 * @example
 * const updated = await ctx.runMutation(api.functions.members.updateMembers, {
 *   clerkId,
 *   memberId,
 *   data: { account: 50000 },
 *   options: { returnEnhanced: true, includeFriends: true },
 * });
 */
export const updateMembers = mutation({
  args: {
    clerkId: v.optional(v.string()),
    memberId: v.id("members"),
    data: v.object({
      clerkId: v.optional(v.string()),
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
      if (args.data.clerkId !== undefined) {
        throw new Error("Forbidden: Only admins can change clerkId");
      }
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
      const validation = membersValidators.validateMemberData(args.data);
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
      ...(args.data.clerkId ? { clerkId: args.data.clerkId.trim() } : {}),
    };

    if (adminUser && args.data.clerkId !== undefined) {
      const nextClerkId = args.data.clerkId.trim();
      if (!nextClerkId) {
        throw new Error("clerkId cannot be empty");
      }

      const existing = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", nextClerkId))
        .first();

      if (existing && existing._id !== args.memberId) {
        throw new Error("That Clerk user is already linked to a member.");
      }
    }

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

/**
 * Deletes (or deactivates) a member.
 *
 * Auth:
 * - Requires an admin (via `requireAdmin`).
 *
 * Modes:
 * - Soft delete: when `options.softDelete` is true, the member is deactivated (`isActive: false`) and retained.
 * - Hard delete (default): deletes the member document.
 *
 * Data handling options (hard-delete mode only):
 * - `transferToMember`: moves the member’s `tourCards`, `transactions`, and `pushSubscriptions` to the target.
 * - `cascadeDelete`: deletes the member’s `tourCards` (and their `teams`), `transactions`, and `pushSubscriptions`.
 * - `transferToMember` and `cascadeDelete` are mutually exclusive.
 * - `removeFriendships`: removes references from other members’ `friends` arrays (guarded to <= 1000 members).
 *
 * @param ctx Convex mutation context.
 * @param args.memberId Member document id to delete/deactivate.
 * @param args.options Optional behavior flags.
 * @returns A structured delete response with `deleted`/`deactivated` and optional `deletedData`.
 *
 * @example
 * const result = await ctx.runMutation(api.functions.members.deleteMembers, {
 *   memberId,
 *   options: { softDelete: true, returnDeletedData: true },
 * });
 *
 * @example
 * const result = await ctx.runMutation(api.functions.members.deleteMembers, {
 *   memberId,
 *   options: { transferToMember: targetMemberId, removeFriendships: true },
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

    if (
      options.transferToMember &&
      options.transferToMember === args.memberId
    ) {
      throw new Error("Cannot transfer data to the same member");
    }

    if (options.transferToMember && options.cascadeDelete) {
      throw new Error(
        "Cannot use transferToMember and cascadeDelete at the same time",
      );
    }

    const transferTarget = options.transferToMember
      ? await ctx.db.get(options.transferToMember)
      : null;
    if (options.transferToMember && !transferTarget) {
      throw new Error("Transfer target member not found");
    }

    let transferredCount = 0;
    let deletedMemberData: MemberDoc | undefined = undefined;
    if (options.returnDeletedData) {
      deletedMemberData = member;
    }

    if (options.softDelete) {
      await ctx.db.patch(args.memberId, {
        isActive: false,
        updatedAt: Date.now(),
      });

      await logAudit(ctx, {
        entityType: "members",
        entityId: args.memberId,
        action: "deleted",
        metadata: extractDeleteMetadata({ deleted: false }, options),
      });

      return {
        success: true,
        deleted: false,
        deactivated: true,
        deletedData: deletedMemberData,
      };
    }

    if (options.transferToMember) {
      const memberTourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .collect();

      for (const tourCard of memberTourCards) {
        await ctx.db.patch(tourCard._id, {
          memberId: options.transferToMember,
          updatedAt: Date.now(),
        });
        transferredCount += 1;
      }

      const memberTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .collect();

      for (const transaction of memberTransactions) {
        await ctx.db.patch(transaction._id, {
          memberId: options.transferToMember,
          updatedAt: Date.now(),
        });
        transferredCount += 1;
      }

      const subscriptions = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .collect();

      for (const subscription of subscriptions) {
        await ctx.db.patch(subscription._id, {
          memberId: options.transferToMember,
          updatedAt: Date.now(),
        });
        transferredCount += 1;
      }
    }

    if (options.cascadeDelete) {
      const memberTourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .collect();

      for (const tourCard of memberTourCards) {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
          .collect();
        for (const team of teams) {
          await ctx.db.delete(team._id);
        }

        await ctx.db.delete(tourCard._id);
      }

      const memberTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .collect();
      for (const transaction of memberTransactions) {
        await ctx.db.delete(transaction._id);
      }

      const subscriptions = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .collect();
      for (const subscription of subscriptions) {
        await ctx.db.delete(subscription._id);
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
