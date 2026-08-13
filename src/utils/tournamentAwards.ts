import { PLAYOFF_SILVER_PAYOUT_OFFSET } from "./constants";

export function getPlayoffPayoutColumns(payouts: readonly number[]) {
  return {
    gold: trimUnpaidTail(payouts.slice(0, PLAYOFF_SILVER_PAYOUT_OFFSET)),
    silver: trimUnpaidTail(payouts.slice(PLAYOFF_SILVER_PAYOUT_OFFSET)),
  };
}

function trimUnpaidTail(payouts: readonly number[]) {
  let end = payouts.length;
  while (end > 0 && (payouts[end - 1] ?? 0) <= 0) {
    end -= 1;
  }
  return payouts.slice(0, end);
}
