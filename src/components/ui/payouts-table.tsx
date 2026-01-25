"use client";

import type { PayoutsTableProps } from "@/lib/types";
import { cn, formatMoney, formatRank } from "@/lib";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Skeleton } from "./skeleton";

/**
 * Displays the payouts distribution table used in the Rulebook Scoring section.
 *
 * This is a leaf/pure UI component. Fetch/prepare tiers outside (e.g.
 * `useRulebookTierTables`) and pass them in as `tiers`.
 *
 * @param props - `PayoutsTableProps`.
 * @returns A payout distribution table or a skeleton while loading.
 */
export function PayoutsTable(props: PayoutsTableProps) {
  if (props.loading) return <PayoutsTableSkeleton />;
  const tiers = props.tiers;
  if (!tiers || tiers.length === 0) return <PayoutsTableSkeleton />;

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
            {tiers.map((tier) => (
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
                {tiers.map((tier) => (
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
