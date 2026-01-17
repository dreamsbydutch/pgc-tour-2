/**
 * Transactions - Basic CRUD
 */

import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin, requireOwnResource } from "../auth";

type TransactionType = Parameters<
  typeof toSignedAmountCents
>[0]["transactionType"];
type TransactionStatus = "pending" | "completed" | "failed" | "cancelled";

const transactionTypeValidator = v.union(
  v.literal("TourCardFee"),
  v.literal("TournamentWinnings"),
  v.literal("Withdrawal"),
  v.literal("Deposit"),
  v.literal("LeagueDonation"),
  v.literal("CharityDonation"),
  v.literal("Payment"),
  v.literal("Refund"),
  v.literal("Adjustment"),
);

const transactionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

function isDebitType(type: string): boolean {
  return (
    type === "TourCardFee" ||
    type === "Withdrawal" ||
    type === "LeagueDonation" ||
    type === "CharityDonation"
  );
}

function isCreditType(type: string): boolean {
  return (
    type === "TournamentWinnings" ||
    type === "Deposit" ||
    type === "Refund" ||
    type === "Payment"
  );
}

function toSignedAmountCents(args: {
  transactionType:
    | "TourCardFee"
    | "TournamentWinnings"
    | "Withdrawal"
    | "Deposit"
    | "LeagueDonation"
    | "CharityDonation"
    | "Payment"
    | "Refund"
    | "Adjustment";
  amountCents: number;
}): number {
  const { transactionType, amountCents } = args;

  if (!Number.isFinite(amountCents) || amountCents === 0) {
    throw new Error("Amount must be non-zero (in cents)");
  }

  if (transactionType !== "Adjustment") {
    const abs = Math.abs(Math.trunc(amountCents));
    if (abs === 0) throw new Error("Amount must be non-zero (in cents)");

    if (isDebitType(transactionType)) return -abs;
    if (isCreditType(transactionType)) return abs;

    throw new Error(`Unhandled transaction type: ${transactionType}`);
  }

  const signed = Math.trunc(amountCents);
  if (signed === 0) throw new Error("Adjustment amount must be non-zero");
  return signed;
}

async function requireOwnMemberResource(
  ctx: Parameters<typeof requireOwnResource>[0],
  memberId: Id<"members">,
) {
  const member = await ctx.db.get(memberId);
  if (!member) throw new Error("Member not found");
  if (!member.clerkId) {
    await requireAdmin(ctx);
    return;
  }
  await requireOwnResource(ctx, member.clerkId);
}

/**
 * Resolve a member id from a Clerk user id (or return null if not found).
 */
async function getMemberIdByClerkId(
  ctx: Parameters<typeof requireOwnResource>[0],
  clerkId: string,
): Promise<Id<"members"> | null> {
  const member = await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
  return member?._id ?? null;
}

export const createTransactions = mutation({
  args: {
    data: v.object({
      memberId: v.id("members"),
      seasonId: v.id("seasons"),
      amount: v.number(),
      transactionType: transactionTypeValidator,
      status: v.optional(transactionStatusValidator),
      processedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const member = await ctx.db.get(args.data.memberId);
    if (!member) throw new Error("Member not found");

    const status = args.data.status ?? "completed";
    const signedAmount = toSignedAmountCents({
      transactionType: args.data.transactionType,
      amountCents: args.data.amount,
    });
    const processedAt =
      args.data.processedAt ??
      (status === "completed" ? Date.now() : undefined);

    const transactionId = await ctx.db.insert("transactions", {
      memberId: args.data.memberId,
      seasonId: args.data.seasonId,
      amount: signedAmount,
      transactionType: args.data.transactionType,
      status,
      processedAt,
      updatedAt: Date.now(),
    });

    if (status === "completed") {
      await ctx.db.patch(member._id, {
        account: member.account + signedAmount,
        updatedAt: Date.now(),
      });
    }

    return await ctx.db.get(transactionId);
  },
});

/**
 * Get transactions (WARNING: Can grow large)
 *
 * @deprecated For large datasets, use getTransactionsPage for cursor-based pagination
 * This endpoint uses .collect() and may hit scale limits as transactions grow.
 */
export const getTransactions = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("transactions")),
        ids: v.optional(v.array(v.id("transactions"))),
        filter: v.optional(
          v.object({
            clerkId: v.optional(v.string()),
            memberId: v.optional(v.id("members")),
            seasonId: v.optional(v.id("seasons")),
            transactionType: v.optional(transactionTypeValidator),
            status: v.optional(transactionStatusValidator),
          }),
        ),
        limit: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.filter?.clerkId) {
      await requireOwnResource(ctx, options.filter.clerkId);
    }

    if (options.filter?.memberId) {
      await requireOwnMemberResource(ctx, options.filter.memberId);
    }

    if (options.id) {
      return await ctx.db.get(options.id);
    }

    if (options.ids) {
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      return docs.filter(Boolean);
    }

    const filter = options.filter || {};

    let memberId = filter.memberId;
    if (!memberId && filter.clerkId) {
      memberId = (await getMemberIdByClerkId(ctx, filter.clerkId)) ?? undefined;
    }

    let results;
    if (memberId && filter.seasonId) {
      results = await ctx.db
        .query("transactions")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", memberId).eq("seasonId", filter.seasonId!),
        )
        .collect();
    } else if (memberId) {
      results = await ctx.db
        .query("transactions")
        .withIndex("by_member", (q) => q.eq("memberId", memberId))
        .collect();
    } else if (filter.seasonId) {
      results = await ctx.db
        .query("transactions")
        .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
        .collect();
    } else if (filter.transactionType) {
      results = await ctx.db
        .query("transactions")
        .withIndex("by_type", (q) =>
          q.eq("transactionType", filter.transactionType!),
        )
        .collect();
    } else if (filter.status) {
      results = await ctx.db
        .query("transactions")
        .withIndex("by_status", (q) => q.eq("status", filter.status!))
        .collect();
    } else {
      results = await ctx.db.query("transactions").collect();
    }

    if (filter.transactionType) {
      results = results.filter(
        (t) => t.transactionType === filter.transactionType,
      );
    }
    if (filter.status) {
      results = results.filter((t) => t.status === filter.status);
    }

    if (options.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return results;
  },
});

/**
 * Get transactions with cursor-based pagination (recommended)
 *
 * Returns cursor-paginated results to handle large transaction tables efficiently.
 * Use this instead of getTransactions for production queries.
 *
 * @example
 * Get user's transactions
 * const page = await ctx.runQuery(api.functions.transactions.getTransactionsPage, {
 *   paginationOpts: { numItems: 50, cursor: null },
 *   filter: { clerkId: "user_123", seasonId: "season_456" }
 * });
 */
export const getTransactionsPage = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
      id: v.optional(v.number()),
    }),
    filter: v.optional(
      v.object({
        clerkId: v.optional(v.string()),
        memberId: v.optional(v.id("members")),
        seasonId: v.optional(v.id("seasons")),
        transactionType: v.optional(transactionTypeValidator),
        status: v.optional(transactionStatusValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const filter = args.filter || {};

    if (filter.clerkId) {
      await requireOwnResource(ctx, filter.clerkId);
    }

    if (filter.memberId) {
      await requireOwnMemberResource(ctx, filter.memberId);
    }

    let memberId = filter.memberId;
    if (!memberId && filter.clerkId) {
      memberId = (await getMemberIdByClerkId(ctx, filter.clerkId)) ?? undefined;
      if (!memberId) {
        return { page: [], isDone: true, continueCursor: null };
      }
    }

    if (memberId && filter.seasonId) {
      return await ctx.db
        .query("transactions")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", memberId).eq("seasonId", filter.seasonId!),
        )
        .paginate(args.paginationOpts);
    }

    if (memberId) {
      return await ctx.db
        .query("transactions")
        .withIndex("by_member", (q) => q.eq("memberId", memberId))
        .paginate(args.paginationOpts);
    }

    if (filter.seasonId) {
      return await ctx.db
        .query("transactions")
        .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
        .paginate(args.paginationOpts);
    }

    if (filter.transactionType) {
      return await ctx.db
        .query("transactions")
        .withIndex("by_type", (q) =>
          q.eq("transactionType", filter.transactionType!),
        )
        .paginate(args.paginationOpts);
    }

    if (filter.status) {
      return await ctx.db
        .query("transactions")
        .withIndex("by_status", (q) => q.eq("status", filter.status!))
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("transactions")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const updateTransactions = mutation({
  args: {
    transactionId: v.id("transactions"),
    data: v.object({
      memberId: v.optional(v.id("members")),
      seasonId: v.optional(v.id("seasons")),
      amount: v.optional(v.number()),
      transactionType: v.optional(transactionTypeValidator),
      status: v.optional(transactionStatusValidator),
      processedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db.get(args.transactionId);
    if (!existing) return null;

    const nextMemberId = args.data.memberId ?? existing.memberId;
    const nextMember = nextMemberId ? await ctx.db.get(nextMemberId) : null;
    if (nextMemberId && !nextMember) throw new Error("Member not found");

    const nextTransactionType = (args.data.transactionType ??
      existing.transactionType) as TransactionType;
    const nextRawAmount = args.data.amount ?? existing.amount;

    const nextStoredAmount =
      args.data.amount !== undefined || args.data.transactionType !== undefined
        ? toSignedAmountCents({
            transactionType: nextTransactionType,
            amountCents: nextRawAmount,
          })
        : existing.amount;

    const nextStatus = (args.data.status ?? existing.status) as
      | TransactionStatus
      | undefined;

    const prevEffectiveDelta =
      existing.status === "completed" ? existing.amount : 0;
    const nextEffectiveDelta =
      nextStatus === "completed" ? nextStoredAmount : 0;

    const prevMemberId = existing.memberId;

    if (prevMemberId && nextMemberId && prevMemberId === nextMemberId) {
      const member = await ctx.db.get(prevMemberId);
      if (!member) throw new Error("Member not found");
      const net = nextEffectiveDelta - prevEffectiveDelta;
      if (net !== 0) {
        await ctx.db.patch(member._id, {
          account: member.account + net,
          updatedAt: Date.now(),
        });
      }
    } else {
      if (prevMemberId && prevEffectiveDelta !== 0) {
        const prevMember = await ctx.db.get(prevMemberId);
        if (!prevMember) throw new Error("Member not found");
        await ctx.db.patch(prevMember._id, {
          account: prevMember.account - prevEffectiveDelta,
          updatedAt: Date.now(),
        });
      }

      if (nextMemberId && nextEffectiveDelta !== 0) {
        if (!nextMember) throw new Error("Member not found");
        await ctx.db.patch(nextMember._id, {
          account: nextMember.account + nextEffectiveDelta,
          updatedAt: Date.now(),
        });
      }
    }

    const nextProcessedAt =
      args.data.processedAt ??
      (nextStatus === "completed" && existing.status !== "completed"
        ? Date.now()
        : existing.processedAt);

    await ctx.db.patch(args.transactionId, {
      ...args.data,
      memberId: nextMemberId,
      amount: nextStoredAmount,
      status: nextStatus,
      processedAt: nextProcessedAt,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(args.transactionId);
  },
});

/**
 * Admin migration helper: backfill `memberId` on legacy transactions that only have `clerkId`.
 * Does not modify account balances.
 */
export const adminBackfillTransactionMemberIds = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const limit = args.limit ?? 500;
    const candidates = await ctx.db.query("transactions").collect();

    let scanned = 0;
    let updated = 0;
    for (const t of candidates) {
      if (scanned >= limit) break;
      scanned += 1;

      const hasMemberId = (t as unknown as { memberId?: Id<"members"> })
        .memberId;
      if (hasMemberId) continue;

      const legacyClerkId = (t as unknown as { clerkId?: string }).clerkId;
      if (!legacyClerkId) continue;

      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", legacyClerkId))
        .first();
      if (!member) continue;

      await ctx.db.patch(t._id, {
        memberId: member._id,
        updatedAt: Date.now(),
      });
      updated += 1;
    }

    return { scanned, updated };
  },
});

export const deleteTransactions = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db.get(args.transactionId);
    if (!existing) return null;
    await ctx.db.delete(args.transactionId);
    return existing;
  },
});
