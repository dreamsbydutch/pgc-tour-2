"use client";

import { Id } from "@/convex";
import {
  LeaderboardHeader,
  ToursToggle,
  PGCLeaderboard,
  PGALeaderboard,
} from "@/displays";
import { Tournament } from "@/lib";

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
export function LeaderboardView(props: {
  tournament: Tournament;
  activeTourId: Id<"tours"> | "pga" | "gold" | "silver";
  onTournamentChange: (tournamentId: string) => void;
  onChangeTourId: (tourId: string) => void;
  userTourCard?: { _id: Id<"tourCards"> };
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <LeaderboardHeader
        tournament={props.tournament}
        onTournamentChange={props.onTournamentChange}
      />
      <div className="mx-auto mt-2 w-full max-w-4xl md:w-11/12 lg:w-8/12">
        <div className="text-end text-xs text-muted-foreground">
          {formatLeaderboardLastUpdated(
            props.tournament.leaderboardLastUpdatedAt,
          )}
        </div>
        <ToursToggle
          tournament={props.tournament}
          activeTourId={props.activeTourId}
          onChangeTourId={props.onChangeTourId}
        />
        <LeaderboardHeaderRow
          tournamentOver={props.tournament.status === "completed"}
          activeTourId={props.activeTourId}
        />
        {props.activeTourId !== "pga" ? (
          <PGCLeaderboard
            tournament={props.tournament}
            activeTourId={props.activeTourId}
          />
        ) : (
          <>
            <PGALeaderboard
              tournament={props.tournament}
              userTourCard={props.userTourCard}
            />
          </>
        )}
      </div>
    </div>
  );
}

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
function LeaderboardHeaderRow(props: {
  tournamentOver: boolean;
  activeTourId: Id<"tours"> | "pga" | "gold" | "silver";
}) {
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
        {props.tournamentOver
          ? props.activeTourId === "pga"
            ? "Group"
            : "Points"
          : "Today"}
      </div>
      <div className="col-span-1 place-self-center font-varela text-2xs sm:col-span-2">
        {props.tournamentOver
          ? props.activeTourId === "pga"
            ? "Rating"
            : "$$"
          : "Thru"}
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
function formatLeaderboardLastUpdated(
  value: number | null | undefined,
): string {
  if (value == null) return "Last updated: —";

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Last updated: —";

  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);

  return `Last updated: ${formatted}`;
}
