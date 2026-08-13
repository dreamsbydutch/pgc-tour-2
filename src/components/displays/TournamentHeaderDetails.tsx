"use client";

import { useTournamentCourseStats } from "@/hooks";
import type { TournamentHeaderModel } from "@/types";
import {
  cn,
  formatGolfDisplayNumber,
  formatMoney,
  formatToPar,
} from "@/utils/app";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui";
import { RefreshCw } from "lucide-react";

export default function TournamentHeaderDetails(props: {
  awardsOpen: boolean;
  courseOpen: boolean;
  onAwardsOpenChange: (open: boolean) => void;
  onCourseOpenChange: (open: boolean) => void;
  tournament: TournamentHeaderModel;
}) {
  return (
    <>
      <TournamentAwardsDialog
        open={props.awardsOpen}
        onOpenChange={props.onAwardsOpenChange}
        tournament={props.tournament}
      />
      <TournamentCourseDialog
        open={props.courseOpen}
        onOpenChange={props.onCourseOpenChange}
        tournament={props.tournament}
      />
    </>
  );
}

export function TournamentAwardsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament: TournamentHeaderModel;
}) {
  const tier = props.tournament.tier;
  const rowCount = Math.max(
    tier?.points.length ?? 0,
    tier?.payouts.length ?? 0,
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>Points &amp; payouts</DialogTitle>
          <DialogDescription>
            {props.tournament.name}
            {tier ? ` · ${tier.name} Tournament` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-7rem)] overflow-y-auto px-6 pb-6">
          {tier && rowCount > 0 ? (
            <table className="w-full text-center text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 text-left font-semibold">Finish</th>
                  <th className="px-2 py-2 font-semibold">Points</th>
                  <th className="px-2 py-2 text-right font-semibold">Payout</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }).map((_, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-2 py-2 text-left font-medium">
                      {index + 1}
                    </td>
                    <td className="px-2 py-2">{tier.points[index] ?? "-"}</td>
                    <td className="px-2 py-2 text-right">
                      {tier.payouts[index]
                        ? formatMoney(tier.payouts[index] ?? 0, true)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No points or payout breakdown has been published for this
              tournament.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TournamentCourseDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament: TournamentHeaderModel;
}) {
  const { data, rows, loading, error, reload } = useTournamentCourseStats(
    props.tournament._id,
    props.open,
  );
  const course = props.tournament.course;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{course?.name ?? "Course details"}</DialogTitle>
          <DialogDescription>
            {[course?.location, course ? `Par ${course.par}` : null]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-7rem)] overflow-auto px-6 pb-6">
          {loading ? (
            <div
              className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading DataGolf course scoring…
            </div>
          ) : error ? (
            <CourseStatsUnavailable message={error} onRetry={reload} />
          ) : data?.status === "available" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Round {data.round} · DataGolf live scoring</span>
                {data.lastUpdated && <span>Updated {data.lastUpdated}</span>}
              </div>
              <div className="min-w-[680px] overflow-hidden rounded-md border">
                <table className="w-full text-center text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Hole</th>
                      <th className="px-3 py-2">Par</th>
                      <th className="px-3 py-2">Yards</th>
                      <th className="px-3 py-2">Average</th>
                      <th className="px-3 py-2">To par</th>
                      <th className="px-3 py-2 text-emerald-700">Under par</th>
                      <th className="px-3 py-2">Par</th>
                      <th className="px-3 py-2 text-red-700">Over par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.hole} className="border-t">
                        <td className="px-3 py-2 text-left font-semibold">
                          {row.hole}
                        </td>
                        <td className="px-3 py-2">{row.par}</td>
                        <td className="px-3 py-2">{row.yardage}</td>
                        <td className="px-3 py-2">
                          {formatGolfDisplayNumber(row.average)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 font-semibold tabular-nums",
                            row.relativeToPar < 0 && "text-emerald-700",
                            row.relativeToPar > 0 && "text-red-700",
                          )}
                        >
                          {formatRelativeToPar(row.relativeToPar)}
                        </td>
                        <td className="px-3 py-2">
                          {formatPercent(row.underParPercent)}
                        </td>
                        <td className="px-3 py-2">
                          {formatPercent(row.parPercent)}
                        </td>
                        <td className="px-3 py-2">
                          {formatPercent(row.overParPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Under par includes birdies and eagles; over par includes bogeys
                and doubles or worse. Percentages use players who completed each
                hole.
              </p>
            </>
          ) : (
            <CourseStatsUnavailable
              message="Live hole-by-hole course scoring is only available around the current tournament, while DataGolf is publishing that event's feed."
              onRetry={reload}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CourseStatsUnavailable(props: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{props.message}</p>
      <button
        type="button"
        className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        onClick={props.onRetry}
      >
        Try again
      </button>
    </div>
  );
}

function formatRelativeToPar(value: number): string {
  return formatToPar(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
