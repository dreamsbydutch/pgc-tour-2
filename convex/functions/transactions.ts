/**
 * Transactions - Basic CRUD
 */

import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
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

async function requireSignedInClerkId(
  ctx: Parameters<typeof requireOwnResource>[0],
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: You must be signed in");
  }
  return identity.subject;
}

async function getActingMember(
  ctx: Parameters<typeof requireOwnResource>[0],
): Promise<Doc<"members">> {
  const clerkId = await requireSignedInClerkId(ctx);
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

function requirePositiveIntegerCents(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number`);
  const cents = Math.trunc(value);
  if (cents !== value) throw new Error(`${label} must be an integer (cents)`);
  if (cents <= 0) throw new Error(`${label} must be greater than 0`);
  return cents;
}

function requirePositiveCentsFromDollarsString(value: string, label: string) {
  const trimmed = value.trim();
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!cleaned) throw new Error(`${label} is required`);
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`${label} must be a dollar amount like 25.00`);
  }

  const [dollarsPart, centsPartRaw] = cleaned.split(".");
  const dollars = Number.parseInt(dollarsPart, 10);
  const centsPart = (centsPartRaw ?? "").padEnd(2, "0");
  const cents = centsPart ? Number.parseInt(centsPart, 10) : 0;

  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error(`${label} must be a dollar amount like 25.00`);
  }
  if (!Number.isFinite(cents) || cents < 0 || cents > 99) {
    throw new Error(`${label} must be a dollar amount like 25.00`);
  }

  const total = dollars * 100 + cents;
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }
  return total;
}

function requirePositiveCents(args: {
  amountCents?: number;
  amountDollars?: string;
}) {
  const amountDollars = args.amountDollars?.trim();
  if (amountDollars) {
    return requirePositiveCentsFromDollarsString(amountDollars, "Amount");
  }
  if (typeof args.amountCents === "number") {
    return requirePositiveIntegerCents(args.amountCents, "Amount");
  }
  throw new Error("Amount is required");
}

function readOptionalNonNegativeCents(args: {
  amountCents?: number;
  amountDollars?: string;
}): number {
  const amountDollars = args.amountDollars?.trim();
  if (amountDollars) {
    return requirePositiveCentsFromDollarsString(amountDollars, "Amount");
  }
  if (typeof args.amountCents === "number") {
    if (!Number.isFinite(args.amountCents)) throw new Error("Amount must be a number");
    const cents = Math.trunc(args.amountCents);
    if (cents !== args.amountCents) {
      throw new Error("Amount must be an integer (cents)");
    }
    if (cents < 0) throw new Error("Amount must be non-negative");
    return cents;
  }
  return 0;
}

function requireValidEmail(value: string, label: string) {
  const trimmed = value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) throw new Error(`${label} is invalid`);
  return trimmed;
}

async function getPendingWithdrawalSumCents(
  ctx: Parameters<typeof requireOwnResource>[0],
  memberId: Id<"members">,
): Promise<number> {
  const pending = await ctx.db
    .query("transactions")
    .withIndex("by_member_status_type", (q) =>
      q
        .eq("memberId", memberId)
        .eq("status", "pending")
        .eq("transactionType", "Withdrawal"),
    )
    .collect();

  return pending.reduce((sum, t) => sum + t.amount, 0);
}

export const getMyBalanceSummary = query({
  args: {},
  handler: async (ctx) => {
    const member = await getActingMember(ctx);
    const pendingWithdrawalCents = await getPendingWithdrawalSumCents(
      ctx,
      member._id,
    );
    return {
      accountCents: member.account,
      pendingWithdrawalCents,
      availableCents: member.account + pendingWithdrawalCents,
    };
  },
});

export const createMyWithdrawalAndDonations = mutation({
  args: {
    seasonId: v.id("seasons"),
    payoutEmail: v.optional(v.string()),
    withdrawalAmountCents: v.optional(v.number()),
    withdrawalAmountDollars: v.optional(v.string()),
    leagueDonationCents: v.optional(v.number()),
    leagueDonationDollars: v.optional(v.string()),
    charityDonationCents: v.optional(v.number()),
    charityDonationDollars: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await getActingMember(ctx);

    const withdrawalCents = readOptionalNonNegativeCents({
      amountCents: args.withdrawalAmountCents,
      amountDollars: args.withdrawalAmountDollars,
    });
    const leagueCents = readOptionalNonNegativeCents({
      amountCents: args.leagueDonationCents,
      amountDollars: args.leagueDonationDollars,
    });
    const charityCents = readOptionalNonNegativeCents({
      amountCents: args.charityDonationCents,
      amountDollars: args.charityDonationDollars,
    });

    if (withdrawalCents === 0 && leagueCents === 0 && charityCents === 0) {
      throw new Error("Enter an e-transfer amount and/or donation amount");
    }

    const payoutEmail =
      withdrawalCents > 0
        ? requireValidEmail(args.payoutEmail ?? "", "E-transfer email")
        : undefined;

    const signedWithdrawal =
      withdrawalCents > 0
        ? toSignedAmountCents({
            transactionType: "Withdrawal",
            amountCents: withdrawalCents,
          })
        : 0;
    const signedLeague =
      leagueCents > 0
        ? toSignedAmountCents({
            transactionType: "LeagueDonation",
            amountCents: leagueCents,
          })
        : 0;
    const signedCharity =
      charityCents > 0
        ? toSignedAmountCents({
            transactionType: "CharityDonation",
            amountCents: charityCents,
          })
        : 0;

    const pendingWithdrawalSum = await getPendingWithdrawalSumCents(
      ctx,
      member._id,
    );

    const signedTotal = signedWithdrawal + signedLeague + signedCharity;
    if (member.account + pendingWithdrawalSum + signedTotal < 0) {
      throw new Error("Insufficient available balance");
    }

    const now = Date.now();
    const created: {
      withdrawalId?: Id<"transactions">;
      leagueDonationId?: Id<"transactions">;
      charityDonationId?: Id<"transactions">;
    } = {};

    if (leagueCents > 0) {
      created.leagueDonationId = await ctx.db.insert("transactions", {
        memberId: member._id,
        seasonId: args.seasonId,
        amount: signedLeague,
        transactionType: "LeagueDonation",
        status: "completed",
        processedAt: now,
        updatedAt: now,
      });
    }

    if (charityCents > 0) {
      created.charityDonationId = await ctx.db.insert("transactions", {
        memberId: member._id,
        seasonId: args.seasonId,
        amount: signedCharity,
        transactionType: "CharityDonation",
        status: "completed",
        processedAt: now,
        updatedAt: now,
      });
    }

    const signedDonationTotal = signedLeague + signedCharity;
    const updatedAccountCents = member.account + signedDonationTotal;
    if (signedDonationTotal !== 0) {
      await ctx.db.patch(member._id, {
        account: updatedAccountCents,
        updatedAt: now,
      });
    }

    if (withdrawalCents > 0) {
      created.withdrawalId = await ctx.db.insert("transactions", {
        memberId: member._id,
        seasonId: args.seasonId,
        amount: signedWithdrawal,
        transactionType: "Withdrawal",
        status: "pending",
        payoutEmail,
        updatedAt: now,
      });
    }

    return {
      ok: true,
      created,
      accountCents: updatedAccountCents,
      pendingWithdrawalCents: pendingWithdrawalSum + signedWithdrawal,
      availableCents:
        updatedAccountCents + (pendingWithdrawalSum + signedWithdrawal),
    } as const;
  },
});

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

export const createMyDonationTransaction = mutation({
  args: {
    seasonId: v.id("seasons"),
    donationType: v.union(
      v.literal("LeagueDonation"),
      v.literal("CharityDonation"),
    ),
    amountCents: v.optional(v.number()),
    amountDollars: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await getActingMember(ctx);

    const amountCents = requirePositiveCents({
      amountCents: args.amountCents,
      amountDollars: args.amountDollars,
    });
    const signedAmount = toSignedAmountCents({
      transactionType: args.donationType,
      amountCents,
    });

    const pendingWithdrawalSum = await getPendingWithdrawalSumCents(
      ctx,
      member._id,
    );

    if (member.account + pendingWithdrawalSum + signedAmount < 0) {
      throw new Error("Insufficient available balance");
    }

    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      memberId: member._id,
      seasonId: args.seasonId,
      amount: signedAmount,
      transactionType: args.donationType,
      status: "completed",
      processedAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(member._id, {
      account: member.account + signedAmount,
      updatedAt: now,
    });

    return await ctx.db.get(transactionId);
  },
});

export const createMyWithdrawalRequest = mutation({
  args: {
    seasonId: v.id("seasons"),
    payoutEmail: v.string(),
    amountCents: v.optional(v.number()),
    amountDollars: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await getActingMember(ctx);

    const payoutEmail = requireValidEmail(args.payoutEmail, "E-transfer email");
    const amountCents = requirePositiveCents({
      amountCents: args.amountCents,
      amountDollars: args.amountDollars,
    });
    const signedAmount = toSignedAmountCents({
      transactionType: "Withdrawal",
      amountCents,
    });

    const pendingWithdrawalSum = await getPendingWithdrawalSumCents(
      ctx,
      member._id,
    );

    if (member.account + pendingWithdrawalSum + signedAmount < 0) {
      throw new Error("Insufficient available balance");
    }

    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      memberId: member._id,
      seasonId: args.seasonId,
      amount: signedAmount,
      transactionType: "Withdrawal",
      status: "pending",
      payoutEmail,
      updatedAt: now,
    });

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
        return { page: [], isDone: true, continueCursor: "" };
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

export const adminGetMemberAccountAudit = query({
  args: {
    options: v.optional(
      v.object({
        sumMode: v.optional(v.union(v.literal("completed"), v.literal("all"))),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const sumMode = args.options?.sumMode ?? "all";

    const members = await ctx.db.query("members").collect();

    const includedTransactions =
      sumMode === "completed"
        ? await ctx.db
            .query("transactions")
            .withIndex("by_status", (q) => q.eq("status", "completed"))
            .collect()
        : await ctx.db.query("transactions").collect();

    const includedByMember = new Map<
      Id<"members">,
      { sumCents: number; transactions?: Array<Doc<"transactions">> }
    >();

    for (const t of includedTransactions) {
      const memberId = t.memberId;
      if (!memberId) continue;

      const existing = includedByMember.get(memberId);
      if (!existing) {
        includedByMember.set(memberId, {
          sumCents: t.amount,
          transactions: sumMode === "all" ? [t] : undefined,
        });
        continue;
      }

      existing.sumCents += t.amount;
      if (sumMode === "all") {
        (existing.transactions as Array<Doc<"transactions">>).push(t);
      }
    }

    const mismatches = [] as Array<{
      member: {
        _id: Id<"members">;
        email: string;
        firstname?: string;
        lastname?: string;
        role: string;
        account: number;
        clerkId?: string;
      };
      accountCents: number;
      includedSumCents: number;
      deltaCents: number;
      transactions: Array<Doc<"transactions">>;
    }>;

    const outstandingBalances = [] as Array<{
      member: {
        _id: Id<"members">;
        email: string;
        firstname?: string;
        lastname?: string;
        role: string;
        account: number;
        clerkId?: string;
      };
      accountCents: number;
      includedSumCents: number;
      deltaCents: number;
      isMismatch: boolean;
    }>;

    for (const member of members) {
      const includedSumCents = includedByMember.get(member._id)?.sumCents ?? 0;

      const deltaCents = member.account - includedSumCents;
      const isMismatch = deltaCents !== 0;

      if (member.account !== 0) {
        outstandingBalances.push({
          member: {
            _id: member._id,
            email: member.email,
            firstname: member.firstname,
            lastname: member.lastname,
            role: member.role,
            account: member.account,
            clerkId: member.clerkId,
          },
          accountCents: member.account,
          includedSumCents,
          deltaCents,
          isMismatch,
        });
      }

      if (!isMismatch) continue;

      const allTransactions =
        sumMode === "all"
          ? (includedByMember.get(member._id)?.transactions ?? [])
          : await ctx.db
              .query("transactions")
              .withIndex("by_member", (q) => q.eq("memberId", member._id))
              .collect();

      const transactionsSorted = [...allTransactions].sort((a, b) => {
        const aTime = a.processedAt ?? a._creationTime ?? 0;
        const bTime = b.processedAt ?? b._creationTime ?? 0;
        return bTime - aTime;
      });

      mismatches.push({
        member: {
          _id: member._id,
          email: member.email,
          firstname: member.firstname,
          lastname: member.lastname,
          role: member.role,
          account: member.account,
          clerkId: member.clerkId,
        },
        accountCents: member.account,
        includedSumCents,
        deltaCents,
        transactions: transactionsSorted,
      });
    }

    mismatches.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));

    outstandingBalances.sort(
      (a, b) => Math.abs(b.accountCents) - Math.abs(a.accountCents),
    );

    return {
      sumMode,
      memberCount: members.length,
      mismatchCount: mismatches.length,
      mismatches,
      outstandingCount: outstandingBalances.length,
      outstandingBalances,
    };
  },
});

export const adminGetMemberLedgerForAudit = query({
  args: {
    memberId: v.id("members"),
    options: v.optional(
      v.object({
        sumMode: v.optional(v.union(v.literal("completed"), v.literal("all"))),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const sumMode = args.options?.sumMode ?? "all";

    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Member not found");

    const seasons = await ctx.db.query("seasons").collect();
    const seasonLabelById = new Map<Id<"seasons">, string>();
    for (const s of seasons) {
      seasonLabelById.set(s._id, `${s.year} #${s.number}`);
    }

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();

    const transactionsSorted = [...transactions].sort((a, b) => {
      const aTime = a.processedAt ?? a._creationTime ?? 0;
      const bTime = b.processedAt ?? b._creationTime ?? 0;
      return bTime - aTime;
    });

    const includedSumCents = transactions.reduce((sum, t) => {
      if (sumMode === "completed" && t.status !== "completed") return sum;
      return sum + t.amount;
    }, 0);

    const accountCents = member.account;
    const deltaCents = accountCents - includedSumCents;

    return {
      sumMode,
      member: {
        _id: member._id,
        email: member.email,
        firstname: member.firstname,
        lastname: member.lastname,
        role: member.role,
        account: member.account,
        clerkId: member.clerkId,
      },
      accountCents,
      includedSumCents,
      deltaCents,
      transactions: transactionsSorted.map((t) => ({
        ...t,
        seasonLabel: seasonLabelById.get(t.seasonId) ?? String(t.seasonId),
      })),
    };
  },
});

export const adminGetTournamentWinningsAudit = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const season = await ctx.db.get(args.seasonId);
    if (!season) throw new Error("Season not found");

    const now = Date.now();

    const tournamentsAll = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tournaments = tournamentsAll
      .filter((t) => t.status !== "cancelled" && t.endDate <= now)
      .sort((a, b) => a.endDate - b.endDate);

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const memberIdByTourCardId = new Map<Id<"tourCards">, Id<"members">>();
    for (const tc of tourCards) {
      memberIdByTourCardId.set(tc._id, tc.memberId);
    }

    const earningsByMemberByTournament = new Map<
      Id<"members">,
      Map<Id<"tournaments">, number>
    >();

    for (const tournament of tournaments) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect();

      for (const team of teams) {
        if (typeof team.earnings !== "number") continue;
        if (!Number.isFinite(team.earnings)) continue;

        const memberId = memberIdByTourCardId.get(team.tourCardId);
        if (!memberId) continue;

        const byTournament = earningsByMemberByTournament.get(memberId);
        if (!byTournament) {
          earningsByMemberByTournament.set(
            memberId,
            new Map([[tournament._id, Math.trunc(team.earnings)]]),
          );
          continue;
        }

        byTournament.set(
          tournament._id,
          (byTournament.get(tournament._id) ?? 0) + Math.trunc(team.earnings),
        );
      }
    }

    const tournamentWinningsTransactionsAll = await ctx.db
      .query("transactions")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tournamentWinningsTransactions = tournamentWinningsTransactionsAll
      .filter(
        (t) =>
          t.transactionType === "TournamentWinnings" &&
          (t.status === undefined || t.status === "completed") &&
          t.memberId,
      )
      .sort((a, b) => {
        const aTime = a.processedAt ?? a._creationTime ?? 0;
        const bTime = b.processedAt ?? b._creationTime ?? 0;
        return bTime - aTime;
      });

    const transactionsByMember = new Map<
      Id<"members">,
      Array<Doc<"transactions">>
    >();
    const transactionSumByMember = new Map<Id<"members">, number>();

    for (const t of tournamentWinningsTransactions) {
      const memberId = t.memberId as Id<"members">;
      const list = transactionsByMember.get(memberId);
      if (!list) {
        transactionsByMember.set(memberId, [t]);
      } else {
        list.push(t);
      }

      transactionSumByMember.set(
        memberId,
        (transactionSumByMember.get(memberId) ?? 0) + t.amount,
      );
    }

    const members = await ctx.db.query("members").collect();

    const mismatches = [] as Array<{
      member: {
        _id: Id<"members">;
        email: string;
        firstname?: string;
        lastname?: string;
        role: string;
        account: number;
        clerkId?: string;
      };
      tournamentEarningsTotalCents: number;
      tournamentEarningsByTournament: Array<{
        tournamentId: Id<"tournaments">;
        tournamentName: string;
        earningsCents: number;
      }>;
      tournamentWinningsTransactionSumCents: number;
      tournamentWinningsTransactions: Array<Doc<"transactions">>;
      deltaCents: number;
    }>;

    for (const member of members) {
      const byTournament =
        earningsByMemberByTournament.get(member._id) ?? new Map();
      const earningsByTournament = tournaments
        .map((tournament) => ({
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          earningsCents: byTournament.get(tournament._id) ?? 0,
        }))
        .filter((row) => row.earningsCents !== 0);

      const tournamentEarningsTotalCents = earningsByTournament.reduce(
        (sum, row) => sum + row.earningsCents,
        0,
      );

      const txSum = transactionSumByMember.get(member._id) ?? 0;

      const hasAnyRelevantData =
        tournamentEarningsTotalCents !== 0 || txSum !== 0;

      if (!hasAnyRelevantData) continue;
      if (tournamentEarningsTotalCents === txSum) continue;

      mismatches.push({
        member: {
          _id: member._id,
          email: member.email,
          firstname: member.firstname,
          lastname: member.lastname,
          role: member.role,
          account: member.account,
          clerkId: member.clerkId,
        },
        tournamentEarningsTotalCents,
        tournamentEarningsByTournament: earningsByTournament,
        tournamentWinningsTransactionSumCents: txSum,
        tournamentWinningsTransactions:
          transactionsByMember.get(member._id) ?? [],
        deltaCents: tournamentEarningsTotalCents - txSum,
      });
    }

    mismatches.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));

    return {
      seasonId: args.seasonId,
      seasonLabel: `${season.year} #${season.number}`,
      tournamentCount: tournaments.length,
      memberCount: members.length,
      mismatchCount: mismatches.length,
      mismatches,
      tournaments: tournaments.map((t) => ({
        _id: t._id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
    };
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
