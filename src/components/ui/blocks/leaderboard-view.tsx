"use client";

import { useMemo } from "react";

import { ToursToggle } from "@/ui";
import { Skeleton } from "@/ui";
import type { LeaderboardViewProps } from "@/lib/types";
import { LeaderboardHeaderRow } from "@/ui";
import { PGALeaderboard } from "@/ui";
import { PGCLeaderboard } from "@/ui";

/**
 * Renders the tournament leaderboard body (tour toggle + column header + rows).
 *
 * Data sources:
 * - This component does not fetch directly; it receives a `LeaderboardViewModel` from the route.
 *
 * Render states:
 * - `model.kind === "loading"`: shows a skeleton.
 * - `model.kind === "error"`: shows an error message.
 * - `model.kind === "ready"`: renders the tour toggle, header row, and either PGA or PGC rows.
 *
 * @param props - `LeaderboardViewProps`.
 * @returns A responsive leaderboard view.
 */
export function LeaderboardView(props: LeaderboardViewProps) {
  const model = useLeaderboardView(props);

  if (model.kind === "loading") {
    return <LeaderboardViewSkeleton />;
  }

  if (model.kind === "error") {
    return (
      <div className="mx-auto mt-8 w-full max-w-4xl">
        <div className="flex items-center justify-center py-12">
          <div className="text-lg font-semibold text-red-600">
            Error: {model.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-2 w-full max-w-4xl md:w-11/12 lg:w-8/12">
      <ToursToggle
        tours={model.toggleTours}
        activeTourId={props.activeTourId}
        onChangeTourId={props.onChangeTourId}
      />

      <LeaderboardHeaderRow
        tournamentOver={model.tournamentOver}
        activeTourShortForm={model.activeTourShortForm}
      />

      {props.activeTourId === "pga" ? (
        <PGALeaderboard
          golfers={model.pgaRows}
          tournament={model.tournament}
          viewer={model.viewer}
          isPreTournament={props.isPreTournament}
        />
      ) : (
        <PGCLeaderboard
          teams={model.pgcRows}
          tournament={model.tournament}
          allGolfers={model.pgaRows}
          viewer={model.viewer}
          activeTourId={props.activeTourId}
          variant={props.variant}
          isPreTournament={props.isPreTournament}
        />
      )}
    </div>
  );
}

/**
 * Builds derived UI state for `LeaderboardView`.
 *
 * @param props - `LeaderboardViewProps`.
 * @returns Display-ready values for the view header and active listing.
 */
function useLeaderboardView(props: LeaderboardViewProps) {
  return useMemo(() => {
    if (props.model.kind === "loading") return { kind: "loading" as const };
    if (props.model.kind === "error") {
      return { kind: "error" as const, message: props.model.message };
    }

    const activeTourShortForm =
      props.model.toggleTours.find((t) => t.id === props.activeTourId)
        ?.shortForm ?? "";

    const tournamentOver = (props.model.tournament.currentRound ?? 0) === 5;

    return {
      kind: "ready" as const,
      toggleTours: props.model.toggleTours,
      tournament: props.model.tournament,
      pgaRows: props.model.pgaRows,
      pgcRows: props.model.pgcRows,
      viewer: props.model.viewer,
      activeTourShortForm,
      tournamentOver,
    };
  }, [props.activeTourId, props.model]);
}

/**
 * Loading UI for `LeaderboardView`.
 */
function LeaderboardViewSkeleton() {
  return (
    <div className="mx-auto mt-2 w-full max-w-4xl md:w-11/12 lg:w-8/12">
      <div className="mb-3 flex items-center justify-center">
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="mb-2 h-8 w-full" />
      <Skeleton className="mb-1 h-8 w-full" />
      <Skeleton className="mb-1 h-8 w-full" />
      <Skeleton className="mb-1 h-8 w-full" />
    </div>
  );
}
