import { getCurrentMember } from "./auth";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const TOUR_CARD_SELF_SERVICE_CLOSED_MESSAGE =
  "Tour card changes closed when the season's first event started.";

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
  const member = await getCurrentMember(ctx);
  if (member._id !== tourCard.memberId) {
    throw new Error("Forbidden: You can only access your own tour card");
  }
}

export async function getTourCardSelfServiceDeadline(
  ctx: QueryCtx | MutationCtx,
  seasonId: Id<"seasons">,
): Promise<Doc<"tournaments"> | null> {
  const tournaments = await ctx.db
    .query("tournaments")
    .withIndex("by_season_start_date", (q) => q.eq("seasonId", seasonId))
    .order("asc")
    .take(100);

  return (
    tournaments.find((tournament) => tournament.status !== "cancelled") ?? null
  );
}

export async function requireTourCardSelfServiceOpen(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
): Promise<void> {
  const deadline = await getTourCardSelfServiceDeadline(ctx, seasonId);
  if (deadline && Date.now() >= deadline.startDate) {
    throw new Error(TOUR_CARD_SELF_SERVICE_CLOSED_MESSAGE);
  }
}

export async function hasTourCardFeeForSeason(
  ctx: MutationCtx,
  args: {
    member: Doc<"members">;
    seasonId: Id<"seasons">;
  },
): Promise<boolean> {
  const { member, seasonId } = args;

  const existing = await ctx.db
    .query("transactions")
    .withIndex("by_member_season_type", (q) =>
      q
        .eq("memberId", member._id)
        .eq("seasonId", seasonId)
        .eq("transactionType", "TourCardFee"),
    )
    .first();

  return isCompletedTourCardFee(existing);
}
