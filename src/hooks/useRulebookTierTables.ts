import { useMemo } from "react";

import type { TierDoc } from "../../convex/types/types";
import { api, useQuery } from "@/convex";
import { useSeasonIdOrCurrent } from "./useSeasonIdOrCurrent";
import type { TierPayoutsRow, TierPointsRow } from "@/lib/types";
import type { Id } from "@/convex";

function normalizeTierDocs(tiersResult: unknown): TierDoc[] | undefined {
  if (tiersResult === undefined) return undefined;

  if (Array.isArray(tiersResult)) {
    return tiersResult.filter((tier) => tier !== null) as TierDoc[];
  }

  if (
    tiersResult &&
    typeof tiersResult === "object" &&
    "tiers" in tiersResult
  ) {
    return (tiersResult as { tiers: TierDoc[] }).tiers;
  }

  if (tiersResult && typeof tiersResult === "object" && "_id" in tiersResult) {
    return [tiersResult as TierDoc];
  }

  return [];
}

/**
 * Fetches and prepares tier data for the rulebook tier distribution tables.
 *
 * The UI tables live in `src/components/ui/*` and are purely prop-driven.
 * This hook owns the Convex query + tier normalization/sorting.
 *
 * @param seasonId - Optional season id; defaults to the current season.
 * @returns Derived tier rows for payouts/points and a loading flag.
 */
export function useRulebookTierTables(seasonId?: Id<"seasons">) {
  const resolvedSeasonId = useSeasonIdOrCurrent(seasonId);

  const tiersResult = useQuery(
    api.functions.tiers.getTiers,
    resolvedSeasonId
      ? { options: { filter: { seasonId: resolvedSeasonId } } }
      : "skip",
  );

  const tiers = useMemo(() => normalizeTierDocs(tiersResult), [tiersResult]);

  const pointsTiers = useMemo((): TierPointsRow[] => {
    if (!tiers || tiers.length === 0) return [];

    const tierRows = tiers.map((tier) => ({
      key: String(tier._id),
      name: tier.name,
      points: tier.points,
    }));

    const tierOrder = ["Standard", "Elevated", "Major"];
    return [...tierRows]
      .filter((tier) => tierOrder.includes(tier.name))
      .sort((a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name));
  }, [tiers]);

  const payoutsTiers = useMemo((): TierPayoutsRow[] => {
    if (!tiers || tiers.length === 0) return [];

    const tierRows = tiers.map((tier) => ({
      key: String(tier._id),
      name: tier.name,
      payouts: tier.payouts,
    }));

    const tierOrder = ["Standard", "Elevated", "Major", "Playoff"];
    const sorted = [...tierRows].sort(
      (a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name),
    );

    const playoffTier = sorted.find((t) => t.name === "Playoff");
    const next = [...sorted];

    if (playoffTier && playoffTier.payouts.length > 75) {
      const silverTier: TierPayoutsRow = {
        ...playoffTier,
        key: "silver-tier",
        name: "Silver",
        payouts: playoffTier.payouts.slice(75),
      };

      const playoffIndex = next.findIndex((t) => t.name === "Playoff");
      next.splice(playoffIndex + 1, 0, silverTier);
    }

    return next;
  }, [tiers]);

  return {
    pointsTiers,
    payoutsTiers,
    isLoading: tiers === undefined,
  };
}
