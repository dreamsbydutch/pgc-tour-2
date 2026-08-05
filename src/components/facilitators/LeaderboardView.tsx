"use client";

import {
  LeaderboardHeader,
  ToursToggle,
  PGCLeaderboard,
  PGALeaderboard,
  TournamentPulseStrip,
} from "@/displays";
import {
  filterMajorChampionBadgesByMemberId,
  useAnalytics,
  useLeaderboardStandingsProjection,
  useTournamentPulseStrip,
} from "@/hooks";
import { Skeleton } from "@/ui";
import { cn } from "@/utils/app";
import { resolveTournamentLeaderboardState } from "@/utils";
import type {
  PgaLeaderboardDto,
  PgaLeaderboardGolfer,
  PgcLeaderboardTeam,
  PgcLeaderboardTourCard,
  TournamentShellDto,
  TournamentShell,
  TournamentShellTour,
  ViewerMemberDto,
  ViewerTourCardDto,
} from "@/types";

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
  tournament: TournamentShell;
  tours: TournamentShellTour[];
  tourCards: PgcLeaderboardTourCard[];
  teams: PgcLeaderboardTeam[];
  golfers: PgaLeaderboardGolfer[];
  viewerTeam?: PgaLeaderboardDto["viewerTeam"];
  allTournaments: TournamentShell[];
  userTourCard?: ViewerTourCardDto | null;
  viewerMember?: ViewerMemberDto | null;
  onTournamentChange: (tournamentId: string) => void;
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  variant: "regular" | "playoff";
  isPreTournament?: boolean;
  majorChampionBadgesByMemberId: TournamentShellDto["majorChampionBadgesByMemberId"];
  freshness: "live" | "stale";
}) {
  const { trackLeaderboardTabChanged } = useAnalytics();
  const activeTourShortForm =
    props.tours?.find((t) => t._id === props.activeTourId)?.shortForm ?? "";
  const viewerFriendIds = new Set(
    (props.viewerMember?.friends ?? []).map((friendId) => String(friendId)),
  );
  const standingsSnapshots = useLeaderboardStandingsProjection({
    tournament: props.tournament,
    variant: props.variant,
    tours: props.tours,
    tourCards: props.tourCards,
    teams: props.teams,
  });

  const tournamentOver = props.tournament.status === "completed";
  const leaderboardState = resolveTournamentLeaderboardState({
    status: props.tournament.status,
    startDate: props.tournament.startDate,
    endDate: props.tournament.endDate,
    freshness: props.freshness,
  });
  const leaderboardStatus = {
    live: { label: "Live", dotClassName: "bg-emerald-500" },
    reconnecting: { label: "Reconnecting", dotClassName: "bg-amber-500" },
    final: { label: "Final", dotClassName: "bg-slate-400" },
    upcoming: { label: "Upcoming", dotClassName: "bg-sky-500" },
    cancelled: { label: "Cancelled", dotClassName: "bg-slate-400" },
  }[leaderboardState];
  const filteredMajorChampionBadgesByMemberId =
    filterMajorChampionBadgesByMemberId({
      badgesByMemberId: props.majorChampionBadgesByMemberId,
      hiddenTournamentIds: tournamentOver ? [] : [String(props.tournament._id)],
    });

  const leaderboardTeams = props.teams.map((t) => {
    const posChange =
      +(t.pastPosition?.replace("T", "") ?? 0) -
      +(t.position?.replace("T", "") ?? 0);
    return {
      ...t,
      posChange,
    };
  });
  const tournamentPulse = useTournamentPulseStrip({
    tournament: props.tournament,
    activeTourId: props.activeTourId,
    variant: props.variant,
    teams: leaderboardTeams,
    currentTourCardId: props.userTourCard?._id ?? null,
    viewerMemberId: props.viewerMember?._id ?? null,
    friendIds: viewerFriendIds,
    standingsSnapshots,
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <LeaderboardHeader
        tournament={props.tournament}
        allTournaments={props.allTournaments}
        onTournamentChange={props.onTournamentChange}
      />
      <div className="mx-auto mt-2 w-full max-w-4xl md:w-11/12 lg:w-8/12">
        <div
          className="flex items-center justify-end gap-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              leaderboardStatus.dotClassName,
            )}
            aria-hidden="true"
          />
          <span>
            {leaderboardStatus.label} ·{" "}
            {formatLeaderboardLastUpdated(
              props.tournament.leaderboardLastUpdatedAt,
            )}
          </span>
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
          onChangeTourId={(nextTourId) => {
            trackLeaderboardTabChanged(nextTourId === "pga" ? "pga" : "pgc");
            props.onChangeTourId(nextTourId);
          }}
        />
        {tournamentPulse ? (
          <TournamentPulseStrip model={tournamentPulse} />
        ) : null}
        <LeaderboardHeaderRow
          tournamentOver={tournamentOver}
          activeTourShortForm={activeTourShortForm}
        />
        {props.activeTourId !== "pga" && props.teams.length === 0 ? (
          <LeaderboardEmptyState label="No PGC teams are available for this tournament yet." />
        ) : props.activeTourId === "pga" && props.golfers.length === 0 ? (
          <LeaderboardEmptyState label="No PGA scores are available for this tournament yet." />
        ) : props.activeTourId !== "pga" ? (
          <PGCLeaderboard
            teams={leaderboardTeams}
            tournament={props.tournament}
            activeTourId={props.activeTourId}
            variant={props.variant}
            currentTourCardId={props.userTourCard?._id ?? null}
            friendIds={viewerFriendIds}
            standingsSnapshots={standingsSnapshots}
            majorChampionBadgesByMemberId={
              filteredMajorChampionBadgesByMemberId
            }
          />
        ) : (
          <>
            <PGALeaderboard
              golfers={props.golfers}
              tournament={props.tournament}
              currentTeam={props.viewerTeam ?? undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}

function LeaderboardEmptyState({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      {label}
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
          <div className="col-span-5 row-span-2 space-y-3 place-self-center text-center">
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
