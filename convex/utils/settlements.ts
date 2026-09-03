import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const NEXT_SEASON_CARD_CENTS = 10_000;

export type SettlementItemKind =
  | "transfer"
  | "charity"
  | "league"
  | "nextSeasonCard";

export async function getOfficialMemberSeasonEarnings(
  ctx: QueryCtx | MutationCtx,
  memberId: Id<"members">,
  seasonId: Id<"seasons">,
): Promise<number> {
  const cards = await ctx.db
    .query("tourCards")
    .withIndex("by_member_season", (query) =>
      query.eq("memberId", memberId).eq("seasonId", seasonId),
    )
    .take(100);

  return cards.reduce(
    (total, card) => total + Math.max(0, Math.round(card.earnings)),
    0,
  );
}

export function getSettlementAmounts(args: {
  earningsCents: number;
  accountCents: number;
  creditedEarningsCents?: number;
}) {
  const earningsCents = Math.max(0, Math.round(args.earningsCents));
  const creditedEarningsCents = Math.min(
    earningsCents,
    Math.max(0, Math.round(args.creditedEarningsCents ?? 0)),
  );
  const projectedAccountCents =
    Math.round(args.accountCents) + earningsCents - creditedEarningsCents;
  const seasonEarningsAvailableCents = Math.min(
    earningsCents,
    Math.max(0, projectedAccountCents),
  );
  return {
    accountOffsetCents: earningsCents - seasonEarningsAvailableCents,
    availableCents: Math.max(0, projectedAccountCents),
  };
}

export async function getCompletedSeasonWinningsCredit(
  ctx: QueryCtx | MutationCtx,
  memberId: Id<"members">,
  seasonId: Id<"seasons">,
): Promise<number> {
  const winnings = await ctx.db
    .query("transactions")
    .withIndex("by_member_season_type", (query) =>
      query
        .eq("memberId", memberId)
        .eq("seasonId", seasonId)
        .eq("transactionType", "TournamentWinnings"),
    )
    .take(100);

  return winnings
    .filter(
      (transaction) =>
        transaction.status === undefined || transaction.status === "completed",
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function isSettlementSeasonComplete(args: {
  season: Doc<"seasons">;
  appState: Doc<"appState"> | null;
  now: number;
}): boolean {
  if (
    args.appState?.currentSeasonId === args.season._id &&
    args.appState.seasonPhase === "completed"
  ) {
    return true;
  }
  return (
    typeof args.season.endDate === "number" && args.season.endDate <= args.now
  );
}

export function settlementItemAmount(
  request: Doc<"settlementRequests">,
  item: SettlementItemKind,
): number {
  if (item === "transfer") return request.transferCents;
  if (item === "charity") return request.charityCents;
  if (item === "league") return request.leagueCents;
  return request.nextSeasonCardCents;
}

export function settlementItemCompleted(
  request: Doc<"settlementRequests">,
  item: SettlementItemKind,
): boolean {
  if (item === "transfer") return request.transferCompletedAt !== undefined;
  if (item === "charity") return request.charityCompletedAt !== undefined;
  if (item === "league") return request.leagueCompletedAt !== undefined;
  return request.nextSeasonCardCompletedAt !== undefined;
}

export function areAllSettlementItemsComplete(
  request: Doc<"settlementRequests">,
): boolean {
  const items: SettlementItemKind[] = [
    "transfer",
    "charity",
    "league",
    "nextSeasonCard",
  ];
  return items.every(
    (item) =>
      settlementItemAmount(request, item) === 0 ||
      settlementItemCompleted(request, item),
  );
}

export function requirePositiveIntegerCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number of cents`);
  }
  return value;
}

export function normalizePayoutEmail(value: string | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid e-transfer email address");
  }
  return trimmed;
}
