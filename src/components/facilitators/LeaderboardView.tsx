"use client";

import {
  LeaderboardHeader,
  ToursToggle,
  PGCLeaderboard,
  PGALeaderboard,
} from "@/displays";
import {
  EnhancedTournamentGolferDoc,
  EnhancedTournamentTeamDoc,
  TourCardDoc,
  TourDoc,
  TournamentDoc,
} from "convex/types/types";

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
  tournament: TournamentDoc;
  tours: TourDoc[];
  teams: EnhancedTournamentTeamDoc[];
  golfers: EnhancedTournamentGolferDoc[];
  allTournaments: TournamentDoc[];
  userTourCard?: TourCardDoc | null;
  onTournamentChange: (tournamentId: string) => void;
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  variant: "regular" | "playoff";
  isPreTournament?: boolean;
}) {
  const activeTourShortForm =
    props.tours?.find((t) => t._id === props.activeTourId)?.shortForm ?? "";

  const tournamentOver = (props.tournament.currentRound ?? 0) === 5;

  const leaderboardTeams = props.teams.map((t) => {
    const teamGolfers = props.golfers.filter((g) =>
      t.golferIds.includes(g.apiId ?? 0),
    );
    const posChange =
      +(t.pastPosition?.replace("T", "") ?? 0) -
      +(t.position?.replace("T", "") ?? 0);
    return {
      ...t,
      teamGolfers,
      posChange,
    };
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <LeaderboardHeader
        tournament={props.tournament}
        allTournaments={props.allTournaments}
        onTournamentChange={props.onTournamentChange}
      />
      <div className="mx-auto mt-2 w-full max-w-4xl md:w-11/12 lg:w-8/12">
        <div className="text-end text-xs text-muted-foreground">
          {formatLeaderboardLastUpdated(
            props.tournament.leaderboardLastUpdatedAt,
          )}
        </div>
        <ToursToggle
          tours={[
            ...props.tours,
            {
              _id: "pga",
              shortForm: "PGA",
              logoUrl:
                "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPHn0reMa1Sl6K8NiXDVstIvkZcpyWUmEoY3xj",
            },
          ]}
          activeTourId={props.activeTourId}
          onChangeTourId={props.onChangeTourId}
        />
        <LeaderboardHeaderRow
          tournamentOver={tournamentOver}
          activeTourShortForm={activeTourShortForm}
        />
        {props.activeTourId !== "pga" ? (
          <PGCLeaderboard
            teams={leaderboardTeams}
            tournament={props.tournament}
            activeTourId={props.activeTourId}
            variant={props.variant}
          />
        ) : (
          <>
            <PGALeaderboard
              golfers={props.golfers}
              tournament={props.tournament}
              currentTeam={
                leaderboardTeams.find(
                  (t) => t.tourCardId === props.userTourCard?._id,
                ) ?? undefined
              }
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
  activeTourShortForm: string;
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
          ? props.activeTourShortForm === "PGA"
            ? "Group"
            : "Points"
          : "Today"}
      </div>
      <div className="col-span-1 place-self-center font-varela text-2xs sm:col-span-2">
        {props.tournamentOver
          ? props.activeTourShortForm === "PGA"
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
