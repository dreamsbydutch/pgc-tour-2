import type { Id } from "../_generated/dataModel";
import { requireAdmin, requireOwnResource } from "./auth";
import type { ToSignedAmountCentsArgs } from "../types/transactions";
import { isCreditType, isDebitType } from "./validation";

export function toSignedAmountCents(args: ToSignedAmountCentsArgs): number {
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

export async function requireOwnMemberResource(
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
export async function getMemberIdByClerkId(
  ctx: Parameters<typeof requireOwnResource>[0],
  clerkId: string,
): Promise<Id<"members"> | null> {
  const member = await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
  return member?._id ?? null;
}
