import { ChevronDown } from "lucide-react";

import { formatMoney } from "@/lib";

/**
 * Renders a compact, collapsible table that shows a rank → points/payouts mapping.
 *
 * This is a presentational-only component used by standings/playoff screens.
 * It does not fetch data; it formats and displays whatever arrays are provided.
 *
 * @param props.title - Label shown in the `<summary>` row.
 * @param props.points - Points awarded for each rank (1-indexed display).
 * @param props.payouts - Payout (cents) awarded for each rank (1-indexed display).
 * @returns A `<details>` element containing the mapping grid.
 */
export function PointsAndPayoutsDetails(props: {
  title: string;
  points: number[];
  payouts: number[];
}) {
  const rowCount = Math.min(props.points.length, props.payouts.length);

  return (
    <details className="rounded-md border p-2">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        {props.title}
        <ChevronDown className="h-4 w-4" />
      </summary>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="font-medium">Rank</div>
        <div className="col-span-1 font-medium">Points</div>
        <div className="col-span-1 font-medium">Payout</div>
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className="contents">
            <div className="text-muted-foreground">{i + 1}</div>
            <div className="text-muted-foreground">{props.points[i]}</div>
            <div className="text-muted-foreground">
              {formatMoney(props.payouts[i] ?? 0,true)}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
