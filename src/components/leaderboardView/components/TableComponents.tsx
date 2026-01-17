import { cn } from "@/lib/utils";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";

import { formatPercentageDisplay, formatToPar } from "../utils/format";
import { isPlayerCut } from "../utils/leaderboardUtils";
import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardTournamentLite,
} from "../utils/types";
import { CountryFlagDisplay, GolferStatsGrid } from "./UIComponents";

export function PGADropdown({
  golfer,
  viewerTeamGolferApiIds,
}: {
  golfer: LeaderboardPgaRow;
  viewerTeamGolferApiIds?: number[] | null;
}) {
  const isUserTeamGolfer = !!viewerTeamGolferApiIds?.includes(golfer.apiId);
  const cutOrWithdrawn = isPlayerCut(golfer.position);

  return (
    <div
      className={cn(
        "col-span-10 mb-2 rounded-lg p-2 pt-1",
        isUserTeamGolfer && "bg-slate-100",
        cutOrWithdrawn && "text-gray-400",
      )}
    >
      <div className="mx-auto grid max-w-2xl grid-cols-12 sm:grid-cols-16">
        <CountryFlagDisplay
          country={golfer.country}
          position={golfer.position}
        />
        <GolferStatsGrid golfer={golfer} />
      </div>
    </div>
  );
}

function GolferScoreCells({ golfer }: { golfer: LeaderboardPgaRow }) {
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
        {golfer.teeTimeDisplay ?? "-"}
      </td>
    );
  }

  return (
    <>
      <td className="text-xs">{formatToPar(golfer.today)}</td>
      <td className="text-xs">{golfer.thru === 18 ? "F" : golfer.thru}</td>
    </>
  );
}

export function TeamGolfersTable({
  team,
  tournament,
  allGolfers,
}: {
  team: LeaderboardTeamRow;
  tournament: LeaderboardTournamentLite;
  allGolfers: LeaderboardPgaRow[];
}) {
  const teamGolfers = allGolfers.filter((g) =>
    team.golferApiIds.includes(g.apiId),
  );

  const nonCut = teamGolfers.filter((g) => !isPlayerCut(g.position));
  const cut = teamGolfers.filter((g) => isPlayerCut(g.position));

  const sorted = [...nonCut, ...cut];

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
        {sorted.map((golfer, i) => {
          const borderClasses: string[] = [];
          if (tournament.name === "TOUR Championship") {
            if (i === 2 || i === 9)
              borderClasses.push("border-b border-gray-700");
          } else if (tournament.name === "BMW Championship") {
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
