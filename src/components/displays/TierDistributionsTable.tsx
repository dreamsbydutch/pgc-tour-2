"use client";

import type { TierDistributionsTableProps } from "@/lib";
import { cn, formatMoney, formatNumber, formatRank } from "@/lib";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";
import { Skeleton } from "@/ui";

/**
 * Renders the rulebook tier distribution tables (points or payouts).
 *
 * This is a leaf/pure UI component. Fetch/prepare tiers outside (e.g. `useRulebookTierTables`)
 * and pass them in via `props.tiers`.
 *
 * Render behavior:
 * - `kind: "points"`: renders a 35-row points table.
 * - `kind: "payouts"`: renders a 30-row payouts table, with special styling for Playoff/Gold and Silver.
 * - When `loading` is true or `tiers` are missing/empty, renders a skeleton.
 *
 * @param props - `TierDistributionsTableProps`.
 * @returns A distribution table or a skeleton while loading.
 */
export function TierDistributionsTable(props: TierDistributionsTableProps) {
  const defaultTierCount = props.kind === "points" ? 3 : 4;
  const rowCount = props.kind === "points" ? 35 : 30;

  if (props.loading) {
    return (
      <TierDistributionsTableSkeleton
        tierCount={defaultTierCount}
        rowCount={rowCount}
      />
    );
  }

  if (props.kind === "points") {
    const pointsTiers = props.tiers;
    if (!pointsTiers || pointsTiers.length === 0) {
      return (
        <TierDistributionsTableSkeleton
          tierCount={defaultTierCount}
          rowCount={rowCount}
        />
      );
    }

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
              {pointsTiers.map((tier) => (
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
            {Array(rowCount)
              .fill(1)
              .map((_obj, i) => (
                <TableRow key={i}>
                  <TableCell className="px-2 py-1 text-sm font-bold">
                    {formatRank(i + 1)}
                  </TableCell>
                  {pointsTiers.map((tier) => (
                    <TableCell
                      className="border-l px-2 py-1 text-center text-xs"
                      key={`points-${tier.key}-${i}`}
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

  const payoutsTiers = props.tiers;
  if (!payoutsTiers || payoutsTiers.length === 0) {
    return (
      <TierDistributionsTableSkeleton
        tierCount={defaultTierCount}
        rowCount={rowCount}
      />
    );
  }

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
            {payoutsTiers.map((tier) => (
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
          {Array(rowCount)
            .fill(1)
            .map((_obj, i) => (
              <TableRow key={i}>
                <TableCell className="px-2 py-1 text-sm font-bold">
                  {formatRank(i + 1)}
                </TableCell>
                {payoutsTiers.map((tier) => (
                  <TableCell
                    className={cn(
                      "border-l px-2 py-1 text-center text-xs",
                      tier.name === "Playoff" &&
                        "border-l-gray-500 bg-yellow-50 bg-opacity-50",
                      tier.name === "Silver" && "bg-gray-100 bg-opacity-50",
                    )}
                    key={`payouts-${tier.key}-${i}`}
                  >
                    {!tier.payouts[i] || tier.payouts[i] === 0
                      ? "-"
                      : formatMoney(tier.payouts[i] ?? 0,true)}
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
 * Loading UI for `TierDistributionsTable`.
 */
function TierDistributionsTableSkeleton(props: {
  tierCount: number;
  rowCount: number;
}) {
  const tierArray = Array.from({ length: props.tierCount });
  const rowArray = Array.from({ length: props.rowCount });

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
