"use client";

import { useMemo } from "react";

import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardTournamentLite,
} from "@/lib";
import {
  cn,
  formatTeeTimeTimeOfDay,
  formatPercentageDisplay,
  formatToPar,
  isPlayerCut,
} from "@/lib";

import { Table, TableBody, TableHeader, TableRow } from "@/ui";

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
export function TeamGolfersTable(props: {
  team: LeaderboardTeamRow;
  tournament: LeaderboardTournamentLite;
  allGolfers: LeaderboardPgaRow[];
}) {
  const model = useTeamGolfersTable({
    team: props.team,
    tournament: props.tournament,
    allGolfers: props.allGolfers,
  });

  if (model.rows.length === 0) {
    return <TeamGolfersTableSkeleton />;
  }

  const GolferScoreCells = ({ golfer }: { golfer: LeaderboardPgaRow }) => {
    if (isPlayerCut(golfer.position)) {
      return (
        <>
          <td className="text-xs">-</td>
          <td className="text-xs">-</td>
        </>
      );
    }

    if (golfer.thru === 0 || golfer.thru === null) {
      return (
        <td className="text-xs" colSpan={2}>
          {formatTeeTimeTimeOfDay(golfer.teeTimeDisplay) ?? "-"}
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
        {model.rows.map((golfer, i) => {
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
              key={golfer.id}
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
                  : formatPercentageDisplay(golfer.makeCut)}
              </td>
              <td className="hidden border-gray-300 text-xs xs:table-cell">
                {formatPercentageDisplay(golfer.usage)}
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
 * @param args.team - Team row.
 * @param args.allGolfers - All PGA rows.
 * @returns Ordered rows with cut golfers last.
 */
function useTeamGolfersTable(args: {
  team: LeaderboardTeamRow;
  tournament: LeaderboardTournamentLite;
  allGolfers: LeaderboardPgaRow[];
}) {
  return useMemo(() => {
    const teamGolfers = args.allGolfers.filter((g) =>
      args.team.golferApiIds.includes(g.apiId),
    );

    const nonCut = teamGolfers.filter((g) => !isPlayerCut(g.position));
    const cut = teamGolfers.filter((g) => isPlayerCut(g.position));

    const toTimeMs = (teeTime?: string | null) => {
      if (!teeTime) return Number.POSITIVE_INFINITY;
      const ms = new Date(teeTime).getTime();
      return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
    };

    const sortByLive = (rows: LeaderboardPgaRow[]) => {
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

        const aToday = typeof a.today === "number" ? a.today : Number.POSITIVE_INFINITY;
        const bToday = typeof b.today === "number" ? b.today : Number.POSITIVE_INFINITY;
        if (aToday !== bToday) return aToday - bToday;

        const aThru = typeof a.thru === "number" ? a.thru : Number.NEGATIVE_INFINITY;
        const bThru = typeof b.thru === "number" ? b.thru : Number.NEGATIVE_INFINITY;
        if (aThru !== bThru) return bThru - aThru;

        const aScore = typeof a.score === "number" ? a.score : Number.POSITIVE_INFINITY;
        const bScore = typeof b.score === "number" ? b.score : Number.POSITIVE_INFINITY;
        if (aScore !== bScore) return aScore - bScore;

        return (a.playerName ?? "").localeCompare(b.playerName ?? "");
      });
    };

    const sortedNonCut = sortByLive(nonCut);
    const sortedCut = [...cut].sort((a, b) =>
      (a.playerName ?? "").localeCompare(b.playerName ?? ""),
    );

    return { rows: [...sortedNonCut, ...sortedCut] };
  }, [args.allGolfers, args.team.golferApiIds, args.tournament.currentRound]);
}

/**
 * Loading UI for `TeamGolfersTable`.
 */
function TeamGolfersTableSkeleton() {
  return <div className="h-40 w-full rounded-md bg-slate-100" />;
}
