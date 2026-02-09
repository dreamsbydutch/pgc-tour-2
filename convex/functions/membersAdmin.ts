import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

import { requireAdmin } from "../utils/auth";
import {
  generateFullName,
  normalizePersonName,
  readOptionalDisplayName,
} from "../utils/members";

/**
 * Get members with cursor-based pagination (for large datasets).
 *
 * This is intended for admin lists where a full-table scan would be too expensive.
 *
 * @param ctx Convex query context.
 * @param args.paginationOpts Convex pagination options.
 * @param args.options.filter Optional small filter set supported by indexed queries.
 * @returns A cursor-paginated result from the members table.
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
 * Recomputes `members.isActive` based on tourCard presence for the current year and previous year.
 *
 * Definition:
 * - Active if the member has a tourCard in any season where `season.year` is equal to the most recent year
 *   in the `seasons` table, or that year minus 1.
 * - Additionally treats a member with a `clerkId` and no tourCards as active (newly created user).
 *
 * @param ctx Convex mutation context.
 * @returns Summary counts and the set of active season ids.
 */
export const recomputeMemberActiveFlags = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const seasons = await ctx.db.query("seasons").collect();

    const currentYear =
      seasons.length > 0 ? Math.max(...seasons.map((s) => s.year)) : null;
    const previousYear = currentYear !== null ? currentYear - 1 : null;

    const activeSeasonIds = new Set(
      seasons
        .filter((s) =>
          currentYear === null
            ? false
            : s.year === currentYear || s.year === previousYear,
        )
        .map((s) => s._id),
    );

    const tourCards = await ctx.db.query("tourCards").collect();
    const membersWithActiveYearTourCard = new Set<string>();
    const membersWithAnyTourCard = new Set<string>();

    for (const tc of tourCards) {
      membersWithAnyTourCard.add(tc.memberId);
      if (activeSeasonIds.has(tc.seasonId)) {
        membersWithActiveYearTourCard.add(tc.memberId);
      }
    }

    const members = await ctx.db.query("members").collect();

    let updated = 0;
    let activeCount = 0;
    let inactiveCount = 0;
    const now = Date.now();

    for (const m of members) {
      const hasClerkId =
        typeof m.clerkId === "string" && m.clerkId.trim().length > 0;
      const isNewMember = hasClerkId && !membersWithAnyTourCard.has(m._id);
      const nextIsActive =
        membersWithActiveYearTourCard.has(m._id) || isNewMember;

      if (m.isActive !== nextIsActive) {
        await ctx.db.patch(m._id, { isActive: nextIsActive, updatedAt: now });
        updated += 1;
      }

      if (nextIsActive) activeCount += 1;
      else inactiveCount += 1;
    }

    return {
      ok: true,
      currentYear,
      previousYear,
      activeSeasonIds: [...activeSeasonIds],
      membersTotal: members.length,
      updated,
      activeCount,
      inactiveCount,
    } as const;
  },
});

/**
 * Normalizes member first/last names and forces tour card display names to match the member full name.
 *
 * @param ctx Convex mutation context.
 * @param args.options.dryRun When true, does not write changes.
 * @param args.options.limit Optional cap on members scanned.
 * @returns Summary plus a small set of example before/after rows.
 */
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
 * Returns counts for all documents that reference a member and would be moved during a merge.
 *
 * @param ctx Convex query context.
 * @param args.sourceMemberId Source member id.
 * @param args.targetMemberId Optional target member id.
 * @returns Counts and warning flags for merge safety checks.
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
 *
 * @param ctx Convex mutation context.
 * @param args.sourceMemberId Source member id.
 * @param args.targetMemberId Target member id.
 * @param args.options.overwriteTargetClerkId When true, replaces a different target clerkId.
 * @returns A summary of moved documents.
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
