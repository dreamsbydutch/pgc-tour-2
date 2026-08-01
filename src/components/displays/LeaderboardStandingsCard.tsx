import { cn } from "@/lib";
import type {
  LeaderboardStandingsCardProps,
  PlayoffDestination,
  StandingsSnapshotColumnProps,
} from "@/types";
import { Card, CardContent } from "@/ui";

const destinationPresentation: Record<
  PlayoffDestination,
  { label: string; textClass: string }
> = {
  gold: {
    label: "Gold",
    textClass: "text-amber-700",
  },
  silver: {
    label: "Silver",
    textClass: "text-slate-500",
  },
  out: {
    label: "Out",
    textClass: "text-red-600",
  },
};

function SnapshotColumn(props: StandingsSnapshotColumnProps) {
  const presentation = destinationPresentation[props.value.destination];
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0">
      <div className="font-varela text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[10px]">
        {props.label}
      </div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            "shrink-0 font-varela text-lg font-semibold leading-none sm:text-xl",
            presentation.textClass,
          )}
        >
          {props.value.position}
        </span>
        <span
          className={cn(
            "shrink-0 font-varela text-[9px] font-semibold uppercase tracking-wide sm:text-[10px]",
            presentation.textClass,
          )}
        >
          {presentation.label}
        </span>
        <span className="ml-auto truncate font-varela text-[10px] text-muted-foreground sm:text-xs">
          {props.value.points.toLocaleString()} pts
        </span>
      </div>
      {props.startingStrokes !== undefined ? (
        <div className="mt-0.5 truncate font-varela text-[9px] leading-none text-muted-foreground sm:text-[10px]">
          Projected start:{" "}
          <span className={cn("font-semibold", presentation.textClass)}>
            {props.startingStrokes === null
              ? "—"
              : props.startingStrokes.toFixed(1)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function LeaderboardStandingsCard(props: LeaderboardStandingsCardProps) {
  return (
    <Card className="mx-2 my-1 overflow-hidden border-slate-200/70 bg-slate-50/30 shadow-none">
      <CardContent className="px-2 py-1.5 sm:px-3 sm:py-2">
        <div className="grid grid-cols-2 divide-x divide-slate-200/80">
          <SnapshotColumn
            label="Before tournament"
            value={props.snapshot.beforeTournament}
          />
          {props.snapshot.live ? (
            <SnapshotColumn
              label="Live projection"
              value={props.snapshot.live}
              startingStrokes={
                props.snapshot.live.destination === "out"
                  ? undefined
                  : props.snapshot.live.startingStrokes
              }
            />
          ) : (
            <div className="min-w-0 px-2 last:pr-0">
              <div className="font-varela text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[10px]">
                Live projection
              </div>
              <div className="mt-1 truncate font-varela text-[10px] font-medium text-muted-foreground sm:text-xs">
                Awaiting live update
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
