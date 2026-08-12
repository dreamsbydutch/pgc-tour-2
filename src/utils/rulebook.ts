import type { TierPayoutsRow, TierPointsRow } from "@/types";
import { PLAYOFF_SILVER_PAYOUT_OFFSET } from "./constants";
import type { TierDoc } from "convex/types/types";

export function buildRulebookPointsTiers(tiers: TierDoc[] | undefined) {
  const order = ["Standard", "Elevated", "Major"];
  return (tiers ?? [])
    .map(
      (tier): TierPointsRow => ({
        key: String(tier._id),
        name: tier.name,
        points: tier.points,
      }),
    )
    .filter((tier) => order.includes(tier.name))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

export function buildRulebookPayoutsTiers(tiers: TierDoc[] | undefined) {
  const order = ["Standard", "Elevated", "Major", "Playoff"];
  const rows = (tiers ?? [])
    .map(
      (tier): TierPayoutsRow => ({
        key: String(tier._id),
        name: tier.name,
        payouts: tier.payouts,
      }),
    )
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const playoffTier = rows.find((tier) => tier.name === "Playoff");
  if (
    !playoffTier ||
    playoffTier.payouts.length <= PLAYOFF_SILVER_PAYOUT_OFFSET
  )
    return rows;
  const playoffIndex = rows.indexOf(playoffTier);
  rows.splice(playoffIndex + 1, 0, {
    ...playoffTier,
    key: "silver-tier",
    name: "Silver",
    payouts: playoffTier.payouts.slice(PLAYOFF_SILVER_PAYOUT_OFFSET),
  });
  return rows;
}
