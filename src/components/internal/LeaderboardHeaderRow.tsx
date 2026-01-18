"use client";

import { useMemo } from "react";

/**
 * Renders the column header row for leaderboard listings.
 *
 * Behavior:
 * - Labels adapt based on whether the tournament is complete.
 * - Labels adapt based on whether the active tour is PGA vs PGC.
 *
 * @param props.tournamentOver - Whether the tournament is complete.
 * @param props.activeTourShortForm - Short label for the currently active tour (e.g. "PGA").
 * @returns A responsive grid header matching the listing row layout.
 */
export function LeaderboardHeaderRow(props: {
  tournamentOver: boolean;
  activeTourShortForm: string;
}) {
  if (!props.activeTourShortForm.trim()) {
    return <LeaderboardHeaderRowSkeleton />;
  }

  const model = useLeaderboardHeaderRow(props);

  return (
    <div className="mx-auto grid max-w-4xl grid-flow-row grid-cols-10 text-center sm:grid-cols-33">
      <div className="col-span-2 place-self-center font-varela text-sm font-bold sm:col-span-5">
        Rank
      </div>
      <div className="col-span-4 place-self-center font-varela text-base font-bold sm:col-span-10">
        Name
      </div>
      <div className="col-span-2 place-self-center font-varela text-sm font-bold sm:col-span-5">
        Score
      </div>
      <div className="col-span-1 place-self-center font-varela text-2xs sm:col-span-2">
        {model.col4Label}
      </div>
      <div className="col-span-1 place-self-center font-varela text-2xs sm:col-span-2">
        {model.col5Label}
      </div>
      <div className="col-span-1 hidden sm:flex" />
      <div className="col-span-1 hidden place-self-center font-varela text-2xs sm:col-span-2 sm:flex">
        R1
      </div>
      <div className="col-span-1 hidden place-self-center font-varela text-2xs sm:col-span-2 sm:flex">
        R2
      </div>
      <div className="col-span-1 hidden place-self-center font-varela text-2xs sm:col-span-2 sm:flex">
        R3
      </div>
      <div className="col-span-1 hidden place-self-center font-varela text-2xs sm:col-span-2 sm:flex">
        R4
      </div>
    </div>
  );
}

/**
 * Derives labels for the leaderboard header row.
 *
 * @param args.tournamentOver - Whether the tournament is complete.
 * @param args.activeTourShortForm - Short label for the active tour.
 * @returns Column labels for the variable columns.
 */
function useLeaderboardHeaderRow(args: {
  tournamentOver: boolean;
  activeTourShortForm: string;
}) {
  return useMemo(() => {
    const isPga = args.activeTourShortForm === "PGA";

    const col4Label = args.tournamentOver
      ? isPga
        ? "Group"
        : "Points"
      : "Today";

    const col5Label = args.tournamentOver ? (isPga ? "Rating" : "$$") : "Thru";

    return { col4Label, col5Label };
  }, [args.activeTourShortForm, args.tournamentOver]);
}

/**
 * Loading UI for `LeaderboardHeaderRow`.
 */
function LeaderboardHeaderRowSkeleton() {
  return (
    <div className="mx-auto h-8 w-full max-w-4xl rounded-md bg-slate-100" />
  );
}
