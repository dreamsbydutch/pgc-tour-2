"use client";

import {
  LeaderboardHeader,
  ToursToggle,
  PGCLeaderboard,
  PGALeaderboard,
} from "@/displays";
import {
  filterMajorChampionBadgesByMemberId,
  useCurrentSeasonMajorChampionBadges,
} from "@/hooks";
import { Skeleton } from "@/ui";
import {
  EnhancedTournamentGolferDoc,
  MemberDoc,
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
  viewerMember?: MemberDoc | null;
  onTournamentChange: (tournamentId: string) => void;
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  variant: "regular" | "playoff";
  isPreTournament?: boolean;
}) {
  const activeTourShortForm =
    props.tours?.find((t) => t._id === props.activeTourId)?.shortForm ?? "";
  const viewerFriendIds = new Set(
    (props.viewerMember?.friends ?? []).map((friendId) => String(friendId)),
  );
  const majorChampionBadgesByMemberId = useCurrentSeasonMajorChampionBadges();

  const tournamentOver = props.tournament.status === "completed";
  const filteredMajorChampionBadgesByMemberId =
    filterMajorChampionBadgesByMemberId({
      badgesByMemberId: majorChampionBadgesByMemberId,
      hiddenTournamentIds: tournamentOver ? [] : [String(props.tournament._id)],
    });

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
            currentTourCardId={props.userTourCard?._id ?? null}
            friendIds={viewerFriendIds}
            majorChampionBadgesByMemberId={filteredMajorChampionBadgesByMemberId}
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

/**
 * Loading UI for the tournament leaderboard page.
 *
 * @returns A skeleton that mirrors the leaderboard page layout.
 */
export function LeaderboardViewSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto w-full max-w-4xl md:w-11/12 lg:w-8/12">
        <div className="grid grid-cols-10 items-center border-b-2 border-gray-800 py-2">
          <div className="col-span-3 row-span-4 place-self-center px-1 py-2">
            <Skeleton className="mx-auto h-24 w-24 rounded-2xl sm:h-28 sm:w-28" />
          </div>
          <div className="col-span-5 row-span-2 place-self-center space-y-3 text-center">
            <Skeleton className="mx-auto h-8 w-48 sm:h-10 sm:w-64" />
            <Skeleton className="mx-auto h-4 w-36 sm:w-44" />
          </div>
          <div className="col-span-2 row-span-1 place-self-center">
            <Skeleton className="h-9 w-24 rounded-full md:w-36" />
          </div>
          <div className="col-span-2 row-span-1 place-self-center">
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="col-span-3 row-span-1 place-self-center">
            <Skeleton className="mx-auto h-5 w-28 sm:w-36" />
          </div>
          <div className="col-span-2 row-span-1 place-self-center">
            <Skeleton className="mx-auto h-5 w-24 sm:w-28" />
          </div>
          <div className="col-span-2 row-span-1 place-self-center">
            <Skeleton className="mx-auto h-5 w-20 sm:w-24" />
          </div>
          <div className="col-span-7 row-span-1 place-self-center">
            <Skeleton className="mx-auto h-5 w-48 sm:w-72" />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-2 w-full max-w-4xl md:w-11/12 lg:w-8/12">
        <div className="mb-3 flex justify-end">
          <Skeleton className="h-4 w-32" />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-20 rounded-full sm:w-24" />
          ))}
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-10 gap-y-2 text-center sm:grid-cols-33">
          <div className="col-span-2 sm:col-span-5">
            <Skeleton className="mx-auto h-4 w-10" />
          </div>
          <div className="col-span-4 sm:col-span-10">
            <Skeleton className="mx-auto h-4 w-16" />
          </div>
          <div className="col-span-2 sm:col-span-5">
            <Skeleton className="mx-auto h-4 w-12" />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <Skeleton className="mx-auto h-4 w-8" />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <Skeleton className="mx-auto h-4 w-8" />
          </div>
          <div className="col-span-1 hidden sm:flex" />
          <div className="col-span-1 hidden sm:flex sm:justify-center">
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="col-span-1 hidden sm:flex sm:justify-center">
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="col-span-1 hidden sm:flex sm:justify-center">
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="col-span-1 hidden sm:flex sm:justify-center">
            <Skeleton className="h-4 w-6" />
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-10 items-center rounded-md px-2 py-3 sm:grid-cols-33"
            >
              <div className="col-span-2 sm:col-span-5">
                <Skeleton className="h-5 w-10" />
              </div>
              <div className="col-span-4 sm:col-span-10">
                <Skeleton className="h-5 w-24 sm:w-36" />
              </div>
              <div className="col-span-2 sm:col-span-5">
                <Skeleton className="mx-auto h-5 w-12" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Skeleton className="mx-auto h-5 w-8" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Skeleton className="mx-auto h-5 w-8" />
              </div>
              <div className="col-span-1 hidden sm:flex" />
              <div className="col-span-1 hidden sm:flex sm:justify-center">
                <Skeleton className="h-5 w-8" />
              </div>
              <div className="col-span-1 hidden sm:flex sm:justify-center">
                <Skeleton className="h-5 w-8" />
              </div>
              <div className="col-span-1 hidden sm:flex sm:justify-center">
                <Skeleton className="h-5 w-8" />
              </div>
              <div className="col-span-1 hidden sm:flex sm:justify-center">
                <Skeleton className="h-5 w-8" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
