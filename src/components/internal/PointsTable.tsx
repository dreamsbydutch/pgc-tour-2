import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { TierDoc } from "../../../convex/types/types";
import { useSeasonIdOrCurrent } from "@/hooks/useSeasonIdOrCurrent";
import type { PointsTableProps } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRank } from "@/lib/utils";

/**
 * Displays the points distribution table used in the Rulebook Scoring section.
 *
 * Data source:
 * - Convex query `api.functions.tiers.getTiers`, filtered by `seasonId`.
 * - `seasonId` defaults via `useSeasonIdOrCurrent` when omitted.
 *
 * Render states:
 * - When `loading` is true (or data is not yet ready), renders the internal skeleton.
 * - When tiers are available, renders a 35-row points table for Standard/Elevated/Major.
 *
 * @param props - `PointsTableProps`.
 * @returns A points distribution table or a skeleton while loading.
 */
export function PointsTable({ seasonId, loading }: PointsTableProps) {
  const { sortedTiers, isLoading } = usePointsTable({ seasonId });

  if (loading || isLoading) return <PointsTableSkeleton />;
  if (!sortedTiers || sortedTiers.length === 0) return <PointsTableSkeleton />;

  return (
    <>
      <div className="mt-4 text-center font-varela font-bold">
        Points Distributions
      </div>
      <Table className="mx-auto w-3/4 text-center font-varela">
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 px-2 py-1 text-center text-xs font-bold">
              Finish
            </TableHead>
            {sortedTiers.map((tier) => (
              <TableHead
                className="h-8 px-2 py-1 text-center text-xs font-bold"
                key={`points-${tier.key}`}
              >
                {tier.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array(35)
            .fill(1)
            .map((_obj, i) => (
              <TableRow key={i}>
                <TableCell className="px-2 py-1 text-sm font-bold">
                  {formatRank(i + 1)}
                </TableCell>
                {sortedTiers.map((tier) => (
                  <TableCell
                    className="border-l px-2 py-1 text-center text-xs"
                    key={`points-${tier.key}`}
                  >
                    {formatNumber(tier.points[i] ?? 0)}
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
 * Fetches and normalizes tier data for `PointsTable`.
 *
 * @param params - `seasonId` to filter tiers; falls back to the current season when omitted.
 * @returns Derived table data ordered by tier name and a loading flag.
 */
function usePointsTable({ seasonId }: Pick<PointsTableProps, "seasonId">) {
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

  const sortedTiers = useMemo(() => {
    if (!tiers || tiers.length === 0) return [];

    const tierRows = tiers.map((tier) => ({
      key: tier._id,
      name: tier.name,
      points: tier.points,
    }));

    const tierOrder = ["Standard", "Elevated", "Major"];
    return [...tierRows]
      .filter((tier) => tierOrder.includes(tier.name))
      .sort((a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name));
  }, [tiers]);

  return {
    sortedTiers,
    isLoading: tiers === undefined,
  };
}

/**
 * Loading UI for `PointsTable`.
 */
function PointsTableSkeleton() {
  const tierCount = 3;
  const rowCount = 35;
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
