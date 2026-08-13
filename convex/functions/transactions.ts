import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentMember, requireAdmin } from "../utils/auth";
import { writeAuditLog } from "../utils/audit";
import { projectMyTransaction } from "../utils/publicDtos";
import { publishNotifications } from "../utils/notifications";

export const getMyTransactions = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx);
    if (args.seasonId) {
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", member._id).eq("seasonId", args.seasonId!),
        )
        .take(500);
      return transactions.map(projectMyTransaction);
    }
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .take(500);
    return transactions.map(projectMyTransaction);
  },
});

export const createPayment = mutation({
  args: {
    memberId: v.id("members"),
    seasonId: v.id("seasons"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await getCurrentMember(ctx);
    await requireAdmin(ctx);
    if (!Number.isSafeInteger(args.amount) || args.amount === 0) {
      throw new Error(
        "Payment amount must be a non-zero integer number of cents",
      );
    }
    const [member, season] = await Promise.all([
      ctx.db.get(args.memberId),
      ctx.db.get(args.seasonId),
    ]);
    if (!member || !season) {
      throw new Error("Member or season not found");
    }
    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      memberId: member._id,
      seasonId: season._id,
      amount: args.amount,
      transactionType: "Payment",
      status: "completed",
      processedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(member._id, {
      account: member.account + args.amount,
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      memberId: actor._id,
      entityType: "transaction",
      entityId: String(transactionId),
      action: "created",
      changes: {
        targetMemberId: String(member._id),
        seasonId: String(season._id),
        amount: args.amount,
        transactionType: "Payment",
      },
    });
    await publishNotifications(ctx, {
      dedupeKey: `payment-recorded:${transactionId}`,
      category: "financial",
      recipients: [
        {
          memberId: member._id,
          title: "Your payment was recorded",
          body: "An administrator confirmed the payment on your PGC account.",
          href: "/account",
        },
      ],
    });
    const transaction = await ctx.db.get(transactionId);
    return transaction ? projectMyTransaction(transaction) : null;
  },
});
