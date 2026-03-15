import { requireOwnResource } from "./auth";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function isCompletedTourCardFee(
  tx: Doc<"transactions"> | null,
): boolean {
  if (!tx) return false;
  return tx.status === undefined || tx.status === "completed";
}

export async function requireTourCardOwner(
  ctx: MutationCtx,
  tourCard: Doc<"tourCards">,
): Promise<void> {
  const member = await ctx.db.get(tourCard.memberId);
  const clerkId = member?.clerkId;
  if (!clerkId) {
    throw new Error("Unauthorized: Tour card owner is not linked to Clerk");
  }
  await requireOwnResource(ctx, clerkId);
}
