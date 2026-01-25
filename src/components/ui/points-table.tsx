"use client";

import type { PointsTableProps } from "@/lib/types";
import { formatNumber, formatRank } from "@/lib";

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
 * Displays the points distribution table used in the Rulebook Scoring section.
 *
 * This is a leaf/pure UI component. Fetch/prepare tiers outside (e.g.
 * `useRulebookTierTables`) and pass them in as `tiers`.
 *
 * @param props - `PointsTableProps`.
 * @returns A points distribution table or a skeleton while loading.
 */
export function PointsTable(props: PointsTableProps) {
  if (props.loading) return <PointsTableSkeleton />;
  const tiers = props.tiers;
  if (!tiers || tiers.length === 0) return <PointsTableSkeleton />;

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
            {tiers.map((tier) => (
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
                {tiers.map((tier) => (
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
