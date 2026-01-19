import { useMemo } from "react";

import { api, useQuery } from "@/convex";
import type { TierDoc } from "../../../convex/types/types";
import { useSeasonIdOrCurrent } from "@/hooks";
import type { PayoutsTableProps } from "@/lib";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";
import { Skeleton } from "@/ui";
import { cn, formatMoney, formatRank } from "@/lib";

/**
 * Displays the payouts distribution table used in the Rulebook Scoring section.
 *
 * Data source:
 * - Convex query `api.functions.tiers.getTiers`, filtered by `seasonId`.
 * - `seasonId` defaults via `useSeasonIdOrCurrent` when omitted.
 *
 * Behavior:
 * - Orders tiers as Standard → Elevated → Major → Playoff.
 * - If the Playoff tier has more than 75 payout entries, inserts a derived "Silver"
 *   tier containing payouts 76+.
 *
 * Render states:
 * - When `loading` is true (or data is not yet ready), renders the internal skeleton.
 * - When tiers are available, renders a 30-row payout table.
 *
 * @param props - `PayoutsTableProps`.
 * @returns A payout distribution table or a skeleton while loading.
 */
export function PayoutsTable({ seasonId, loading }: PayoutsTableProps) {
  const { tiersWithSilver, isLoading } = usePayoutsTable({ seasonId });

  if (loading || isLoading) return <PayoutsTableSkeleton />;
  if (!tiersWithSilver || tiersWithSilver.length === 0)
    return <PayoutsTableSkeleton />;

  return (
    <>
      <div className="mt-4 text-center font-varela font-bold">
        Payouts Distributions
      </div>
      <Table className="mx-auto w-3/4 text-center font-varela">
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 px-2 py-1 text-center text-xs font-bold">
              Finish
            </TableHead>
            {tiersWithSilver.map((tier) => (
              <TableHead
                className={cn(
                  "h-8 px-2 py-1 text-center text-xs font-bold",
                  tier.name === "Playoff" &&
                    "border-l border-l-gray-500 bg-yellow-50 bg-opacity-50",
                  tier.name === "Silver" && "bg-gray-100 bg-opacity-50",
                )}
                key={`payouts-${tier.key}`}
              >
                {tier.name === "Playoff" ? "Gold" : tier.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array(30)
            .fill(1)
            .map((_obj, i) => (
              <TableRow key={i}>
                <TableCell className="px-2 py-1 text-sm font-bold">
                  {formatRank(i + 1)}
                </TableCell>
                {tiersWithSilver.map((tier) => (
                  <TableCell
                    className={cn(
                      "border-l px-2 py-1 text-center text-xs",
                      tier.name === "Playoff" &&
                        "border-l-gray-500 bg-yellow-50 bg-opacity-50",
                      tier.name === "Silver" && "bg-gray-100 bg-opacity-50",
                    )}
                    key={`payouts-${tier.key}`}
                  >
                    {!tier.payouts[i] || tier.payouts[i] === 0
                      ? "-"
                      : formatMoney(tier.payouts[i] ?? 0)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </>
  );
}

/**
 * Fetches and prepares tier payout data for `PayoutsTable`.
 *
 * @param params - `seasonId` to filter tiers; falls back to the current season when omitted.
 * @returns Ordered tiers (with optional derived Silver tier) and a loading flag.
 */
function usePayoutsTable({ seasonId }: Pick<PayoutsTableProps, "seasonId">) {
  const resolvedSeasonId = useSeasonIdOrCurrent(seasonId);

  const tiersResult = useQuery(
    api.functions.tiers.getTiers,
    resolvedSeasonId
      ? { options: { filter: { seasonId: resolvedSeasonId } } }
      : "skip",
  );

  const tiers = useMemo(() => {
    const fallback: TierDoc[] = [];

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

    if (
      tiersResult &&
      typeof tiersResult === "object" &&
      "_id" in tiersResult
    ) {
      return [tiersResult as TierDoc];
    }

    return fallback;
  }, [tiersResult]);

  const tiersWithSilver = useMemo(() => {
    if (!tiers || tiers.length === 0) return [];

    const tierRows = tiers.map((tier) => ({
      key: tier._id as string,
      name: tier.name,
      payouts: tier.payouts,
      points: tier.points,
    }));

    const tierOrder = ["Standard", "Elevated", "Major", "Playoff"];
    const sortedTiers = [...tierRows].sort(
      (a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name),
    );

    const playoffTier = sortedTiers.find((t) => t.name === "Playoff");
    const next = [...sortedTiers];

    if (playoffTier && playoffTier.payouts.length > 75) {
      const silverTier = {
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
    tiersWithSilver,
    isLoading: tiers === undefined,
  };
}

/**
 * Loading UI for `PayoutsTable`.
 */
function PayoutsTableSkeleton() {
  const tierCount = 4;
  const rowCount = 30;
  const tierArray = Array.from({ length: tierCount });
  const rowArray = Array.from({ length: rowCount });

  return (
    <div className="flex w-full flex-col items-center">
      <div className="mb-2 mt-4 w-1/3">
        <Skeleton className="h-6 w-full" />
      </div>
      <div className="mx-auto w-3/4">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-center font-varela">
            <thead>
              <tr>
                <th>
                  <Skeleton className="mx-auto h-4 w-12" />
                </th>
                {tierArray.map((_, i) => (
                  <th key={i}>
                    <Skeleton className="mx-auto h-4 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowArray.map((_, rowIdx) => (
                <tr key={rowIdx}>
                  <td>
                    <Skeleton className="mx-auto h-4 w-10" />
                  </td>
                  {tierArray.map((_, colIdx) => (
                    <td key={colIdx}>
                      <Skeleton className="mx-auto h-4 w-16" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
