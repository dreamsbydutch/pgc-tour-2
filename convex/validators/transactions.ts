import { v } from "convex/values";

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

const vSumMode = v.union(v.literal("completed"), v.literal("all"));

export const transactionsValidators = {
  args: {
    createTransactions: {
      data: v.object({
        memberId: v.id("members"),
        seasonId: v.id("seasons"),
        amount: v.number(),
        transactionType: transactionTypeValidator,
        status: v.optional(transactionStatusValidator),
        processedAt: v.optional(v.number()),
      }),
    },

    getTransactions: {
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

    getTransactionsPage: {
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

    updateTransactions: {
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

    adminBackfillTransactionMemberIds: {
      limit: v.optional(v.number()),
    },

    deleteTransactions: {
      transactionId: v.id("transactions"),
    },

    adminGetMemberAccountAudit: {
      options: v.optional(
        v.object({
          sumMode: v.optional(vSumMode),
        }),
      ),
    },

    adminGetMemberLedgerForAudit: {
      memberId: v.id("members"),
      options: v.optional(
        v.object({
          sumMode: v.optional(vSumMode),
        }),
      ),
    },
  },
} as const;
