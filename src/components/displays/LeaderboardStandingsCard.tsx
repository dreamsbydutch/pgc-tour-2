import { Card, CardContent, CardHeader, CardTitle } from "@/ui";
import { cn } from "@/lib";
import type {
  LeaderboardStandingsCardProps,
  PlayoffDestination,
  StandingsSnapshotColumnProps,
} from "@/types";

const destinationPresentation: Record<
  PlayoffDestination,
  { label: string; textClass: string; badgeClass: string }
> = {
  gold: {
    label: "Gold",
    textClass: "text-amber-600",
    badgeClass: "border-amber-300 bg-amber-50 text-amber-800",
  },
  silver: {
    label: "Silver",
    textClass: "text-slate-500",
    badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
  },
  out: {
    label: "Out",
    textClass: "text-red-600",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
};

function SnapshotColumn(props: StandingsSnapshotColumnProps) {
  const presentation = destinationPresentation[props.value.destination];
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center rounded-md bg-slate-50 px-2 py-3 text-center">
      <div className="font-varela text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
        {props.label}
      </div>
      <div
        className={cn(
          "mt-1 font-varela text-3xl font-bold sm:text-4xl",
          presentation.textClass,
        )}
      >
        {props.value.position}
      </div>
      <div className="font-varela text-xs text-muted-foreground sm:text-sm">
        {props.value.points.toLocaleString()} pts
      </div>
      <span
        className={cn(
          "mt-2 rounded-full border px-2 py-0.5 font-varela text-[10px] font-semibold uppercase tracking-wide",
          presentation.badgeClass,
        )}
      >
        {presentation.label}
      </span>
      {props.startingStrokes !== undefined ? (
        <div className="mt-2 font-varela text-xs text-muted-foreground">
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

function formatSnapshotTime(value: number | null): string {
  if (value === null) return "Awaiting leaderboard timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting leaderboard timestamp";
  return `Updated ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

export function LeaderboardStandingsCard(props: LeaderboardStandingsCardProps) {
  return (
    <Card className="m-2 overflow-hidden border-slate-200 shadow-none">
      <CardHeader className="space-y-0 px-3 pb-2 pt-3 text-center">
        <CardTitle className="font-varela text-sm sm:text-base">
          Standings snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="flex gap-2">
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
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md bg-slate-50 px-2 py-3 text-center">
              <div className="font-varela text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                Live projection
              </div>
              <div className="mt-2 font-varela text-sm font-semibold text-muted-foreground">
                Awaiting live update
              </div>
            </div>
          )}
        </div>
        <div className="mt-2 text-center font-varela text-[10px] text-muted-foreground sm:text-xs">
          Unofficial · {formatSnapshotTime(props.snapshot.lastUpdatedAt)}
        </div>
      </CardContent>
    </Card>
  );
}
