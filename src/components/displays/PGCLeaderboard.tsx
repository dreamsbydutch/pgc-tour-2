"use client";

import { ReactNode, useMemo, useState } from "react";
import {
  cn,
  formatMoney,
  formatNumberToPercentage,
  formatTeeTimeTimeOfDay,
  formatToPar,
  isPlayerCut,
} from "@/lib";
import { MoveDown, MoveHorizontal, MoveUp, Table } from "lucide-react";
import { TableBody, TableHeader, TableRow } from "@/components/ui";
import {
  EnhancedTournamentGolferDoc,
  TeamDoc,
  TourCardDoc,
  TournamentDoc,
} from "convex/types/types";
import { calculateScoreForSorting } from "convex/utils";

/**
 * Renders the PGC leaderboard listing for the active tour (or playoff bracket).
 *
 * Data:
 * - Receives already-shaped team rows from the parent screen (`LeaderboardViewModel`).
 * - Filters/sorts rows via `filterTeamRowsByTour`.
 *
 * @param props.teams - PGC team rows.
 * @param props.tournament - Tournament metadata used to determine display state.
 * @param props.allGolfers - PGA golfer rows, used to expand a team into golfer details.
 * @param props.viewer - Viewer context (for highlighting the viewer's team and friends).
 * @param props.activeTourId - Active tour identifier.
 * @param props.variant - Leaderboard variant (regular/playoff/historical).
 * @param props.isPreTournament - When true, disables row expansion.
 * @returns A sequence of clickable leaderboard rows.
 */
export function PGCLeaderboard(props: {
  teams: (TeamDoc & {
    tourCard?: TourCardDoc;
    teamGolfers?: EnhancedTournamentGolferDoc[];
    posChange: number;
  })[];
  tournament: TournamentDoc;
  activeTourId: string;
  variant: "regular" | "playoff";
}) {
  if (!props.teams || props.teams.length === 0) {
    return <PGCLeaderboardSkeleton />;
  }
  let sorted = [...props.teams]
    .sort((a, b) => (a.thru ?? 0) - (b.thru ?? 0))
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    );

  if (props.variant === "playoff") {
    const playoffLevel =
      props.activeTourId === "gold"
        ? 1
        : props.activeTourId === "silver"
          ? 2
          : 1;
    sorted = sorted.filter((t) => (t.tourCard?.playoff ?? 0) === playoffLevel);
  } else {
    sorted = sorted.filter(
      (t) => (t.tourCard?.tourId ?? "") === props.activeTourId,
    );
  }

  return (
    <>
      {sorted.map((team) => (
        <LeaderboardListing
          key={team._id}
          tournament={props.tournament}
          team={team}
        />
      ))}
    </>
  );
}

/**
 * Loading UI for `PGCLeaderboard`.
 */
function PGCLeaderboardSkeleton() {
  return <div className="h-24 w-full rounded-md bg-slate-100" />;
}

/**
 * Renders a single leaderboard row (PGA golfer or PGC team) with an optional expandable panel.
 *
 * Behavior:
 * - Highlights the viewer's row and friends' rows (PGC only) via `getLeaderboardRowClass`.
 * - Shows position change when allowed by tournament state.
 * - Toggles an expandable dropdown on click unless `isPreTournament` is true.
 * - Expand content:
 *   - PGA: golfer stats panel.
 *   - PGC: team golfer table.
 *
 * @param props - `LeaderboardListingProps`.
 * @returns A clickable row plus an optional dropdown panel.
 */
function LeaderboardListing({
  tournament,
  team,
}: {
  tournament: {
    currentRound?: number | undefined;
    livePlay?: boolean | null;
    name: string;
  };
  team: TeamDoc & {
    posChange: number;
    tourCard?: { displayName: string };
    teamGolfers?: EnhancedTournamentGolferDoc[];
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isCut = isPlayerCut(team.position);
  const isUser = false;
  const isFriend = false;
  const onToggleOpen = () => setIsOpen((v) => !v);
  const rowClass = getLeaderboardRowClass({
    isCut,
    isUser,
    isFriend,
  });
  return (
    <div
      onClick={onToggleOpen}
      className="mx-auto my-0.5 grid max-w-4xl cursor-pointer grid-flow-row grid-cols-10 rounded-md text-center"
    >
      <div className={rowClass}>
        <div className="col-span-2 flex place-self-center font-varela text-base sm:col-span-5">
          {team.position ?? "-"}
          {(tournament.currentRound ?? 0) >= 2 ? (
            <PositionChange posChange={team.posChange} />
          ) : null}
        </div>

        <div className="col-span-4 flex items-center justify-center place-self-center font-varela text-lg sm:col-span-10">
          {team.tourCard?.displayName}
        </div>

        <div className="col-span-2 place-self-center font-varela text-base sm:col-span-5">
          {formatToPar(team.score)}
        </div>

        <ScoreDisplay
          team={team}
          tournamentComplete={
            (tournament.currentRound ?? 0) >= 4 && !tournament.livePlay
          }
        />
      </div>

      {isOpen ? (
        <div className="col-span-10 mx-auto mb-2 w-full max-w-4xl rounded-md border border-gray-300 bg-white shadow-md">
          <TeamGolfersTable
            tournament={tournament}
            teamGolfers={team.teamGolfers}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders a table of PGA golfers for a selected PGC team.
 *
 * Behavior:
 * - Locates golfers for the team by matching `team.golferApiIds` against `allGolfers`.
 * - Keeps cut/withdrawn golfers at the bottom of the table.
 * - Uses tournament name to apply divider borders matching historical grouping rules.
 *
 * @param props.team - The PGC team row.
 * @param props.tournament - Tournament metadata.
 * @param props.allGolfers - All PGA golfer rows (source for team golfers).
 * @returns A compact table of golfers on the team.
 */
function TeamGolfersTable(props: {
  tournament: { name: string; currentRound?: number | undefined };
  teamGolfers?: EnhancedTournamentGolferDoc[];
}) {
  const sortedTeamGolfers = useTeamGolfersTable(props.teamGolfers!);

  const GolferScoreCells = ({ golfer }: { golfer: EnhancedTournamentGolferDoc }) => {
    if (isPlayerCut(golfer.position)) {
      return (
        <>
          <td className="text-xs">-</td>
          <td className="text-xs">-</td>
        </>
      );
    }

    if (golfer.thru === 0 || golfer.thru === null) {
      const teeTimeDisplay =
        props.tournament.currentRound === 1
          ? golfer.roundOneTeeTime
          : props.tournament.currentRound === 2
            ? golfer.roundTwoTeeTime
            : props.tournament.currentRound === 3
              ? golfer.roundThreeTeeTime
              : golfer.roundFourTeeTime;
      return (
        <td className="text-xs" colSpan={2}>
          {formatTeeTimeTimeOfDay(teeTimeDisplay) ?? "-"}
        </td>
      );
    }

    return (
      <>
        <td className="text-xs">{formatToPar(golfer.today)}</td>
        <td className="text-xs">{golfer.thru === 18 ? "F" : golfer.thru}</td>
      </>
    );
  };

  return (
    <Table className="scrollbar-hidden mx-auto w-full max-w-3xl border border-gray-700 text-center font-varela">
      <TableHeader>
        <TableRow className="bg-gray-700 font-bold text-gray-100 hover:bg-gray-700">
          <td className="px-0.5 text-xs">Pos</td>
          <td className="px-0.5 text-xs">Player</td>
          <td className="px-0.5 text-xs">Score</td>
          <td className="px-0.5 text-2xs">Today</td>
          <td className="px-0.5 text-2xs">Thru</td>
          <td className="hidden px-0.5 text-2xs md:table-cell">R1</td>
          <td className="hidden px-0.5 text-2xs md:table-cell">R2</td>
          <td className="hidden px-0.5 text-2xs md:table-cell">R3</td>
          <td className="hidden px-0.5 text-2xs md:table-cell">R4</td>
          <td className="hidden px-0.5 text-2xs xs:table-cell">Make Cut</td>
          <td className="hidden px-0.5 text-2xs xs:table-cell">Usage</td>
          <td className="px-0.5 text-2xs">Group</td>
        </TableRow>
      </TableHeader>

      <TableBody>
        {sortedTeamGolfers.map((golfer, i) => {
          const borderClasses: string[] = [];
          if (props.tournament.name === "TOUR Championship") {
            if (i === 2 || i === 9)
              borderClasses.push("border-b border-gray-700");
          } else if (props.tournament.name === "BMW Championship") {
            if (i === 4 || i === 9)
              borderClasses.push("border-b border-gray-700");
          } else {
            if (i === 9) borderClasses.push("border-b border-gray-700");
          }

          return (
            <TableRow
              key={golfer._id}
              className={cn(
                isPlayerCut(golfer.position) && "text-gray-400",
                borderClasses.join(" "),
              )}
            >
              <td className="px-1 text-xs">{golfer.position ?? "-"}</td>
              <td className="whitespace-nowrap px-1 text-sm">
                {golfer.playerName}
              </td>
              <td className="px-1 text-sm">{formatToPar(golfer.score)}</td>
              <GolferScoreCells golfer={golfer} />
              <td className="hidden border-l border-gray-300 text-xs md:table-cell">
                {golfer.roundOne ?? "-"}
              </td>
              <td className="hidden border-gray-300 text-xs md:table-cell">
                {golfer.roundTwo ?? "-"}
              </td>
              <td className="hidden border-gray-300 text-xs md:table-cell">
                {golfer.roundThree ?? "-"}
              </td>
              <td className="hidden border-gray-300 text-xs md:table-cell">
                {golfer.roundFour ?? "-"}
              </td>
              <td className="hidden border-l border-gray-300 text-xs xs:table-cell">
                {golfer.makeCut === 0 || golfer.makeCut === null
                  ? "-"
                  : formatNumberToPercentage(golfer.makeCut)}
              </td>
              <td className="hidden border-gray-300 text-xs xs:table-cell">
                {formatNumberToPercentage(golfer.usage)}
              </td>
              <td className="border-gray-300 text-xs">{golfer.group ?? "-"}</td>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Computes the list of golfers to display for a team.
 *
 * @param args.teamGolfers - Team golfers.
 * @param args.tournament - Tournament info.
 * @returns Ordered rows with cut golfers last.
 */
function useTeamGolfersTable(teamGolfers: EnhancedTournamentGolferDoc[]) {
  return useMemo(() => {
    const nonCut = teamGolfers.filter((g) => !isPlayerCut(g.position));
    const cut = teamGolfers.filter((g) => isPlayerCut(g.position));

    const toTimeMs = (teeTime?: string | null) => {
      if (!teeTime) return Number.POSITIVE_INFINITY;
      const ms = new Date(teeTime).getTime();
      return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
    };
    const sortByLive = (
      rows: {
        thru?: number;
        teeTimeDisplay?: string | null;
        playerName?: string;
        today?: number;
        score?: number;
      }[],
    ) => {
      return [...rows].sort((a, b) => {
        const aStarted = typeof a.thru === "number" && a.thru > 0;
        const bStarted = typeof b.thru === "number" && b.thru > 0;
        if (aStarted !== bStarted) return aStarted ? -1 : 1;

        if (!aStarted && !bStarted) {
          const ta = toTimeMs(a.teeTimeDisplay ?? null);
          const tb = toTimeMs(b.teeTimeDisplay ?? null);
          if (ta !== tb) return ta - tb;
          return (a.playerName ?? "").localeCompare(b.playerName ?? "");
        }

        const aToday =
          typeof a.today === "number" ? a.today : Number.POSITIVE_INFINITY;
        const bToday =
          typeof b.today === "number" ? b.today : Number.POSITIVE_INFINITY;
        if (aToday !== bToday) return aToday - bToday;

        const aThru =
          typeof a.thru === "number" ? a.thru : Number.NEGATIVE_INFINITY;
        const bThru =
          typeof b.thru === "number" ? b.thru : Number.NEGATIVE_INFINITY;
        if (aThru !== bThru) return bThru - aThru;

        const aScore =
          typeof a.score === "number" ? a.score : Number.POSITIVE_INFINITY;
        const bScore =
          typeof b.score === "number" ? b.score : Number.POSITIVE_INFINITY;
        if (aScore !== bScore) return aScore - bScore;

        return (a.playerName ?? "").localeCompare(b.playerName ?? "");
      });
    };

    const sortedNonCut = sortByLive(nonCut);
    const sortedCut = [...cut].sort((a, b) =>
      (a.playerName ?? "").localeCompare(b.playerName ?? ""),
    );

    return [...sortedNonCut, ...sortedCut] as EnhancedTournamentGolferDoc[];
  }, [teamGolfers]);
}

function ScoreDisplay(props: {
  team: {
    position?: string | undefined;
    today?: number | undefined;
    thru?: number | undefined;
    points?: number | undefined;
    earnings?: number | undefined;
    roundOne?: number | undefined;
    roundTwo?: number | undefined;
    roundThree?: number | undefined;
    roundFour?: number | undefined;
  };
  tournamentComplete: boolean;
}) {
  return (
    <>
      <ScoreCell
        value={
          isPlayerCut(props.team.position)
            ? "-"
            : props.tournamentComplete
              ? props.team.points
              : props.team.today
        }
        className="col-span-1 sm:col-span-2"
      />
      <ScoreCell
        value={
          isPlayerCut(props.team.position)
            ? "-"
            : props.tournamentComplete
              ? formatMoney(props.team.earnings ?? 0, false)
              : props.team.thru
        }
        className="col-span-1 sm:col-span-2"
      />
      <div className="col-span-1 hidden sm:flex" />
      <ScoreCell
        value={props.team.roundOne ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.team.roundTwo ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.team.roundThree ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.team.roundFour ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
    </>
  );
}

function getLeaderboardRowClass(args: {
  isCut: boolean;
  isUser: boolean;
  isFriend: boolean;
}): string {
  const classes = [
    "col-span-10 grid grid-flow-row grid-cols-10 py-0.5 sm:grid-cols-33",
  ];
  if (args.isUser) classes.push("bg-slate-200 font-semibold");
  else if (args.isFriend) classes.push("bg-slate-100");
  if (args.isCut) classes.push("text-gray-400");
  return classes.join(" ");
}
function ScoreCell(args: {
  value: ReactNode;
  className?: string;
  hiddenOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "place-self-center font-varela text-sm sm:col-span-2",
        args.className,
        args.hiddenOnMobile ? "hidden sm:flex" : undefined,
      )}
    >
      {args.value}
    </div>
  );
}
function PositionChange({ posChange }: { posChange: number }) {
  if (posChange === 0) {
    return (
      <span className="ml-1 inline-flex items-center text-xs text-muted-foreground">
        <MoveHorizontal className="h-3 w-3" />
      </span>
    );
  }

  const isPositive = posChange > 0;
  const Icon = isPositive ? MoveUp : MoveDown;
  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center text-xs",
        isPositive ? "text-green-700" : "text-red-700",
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(posChange)}
    </span>
  );
}
