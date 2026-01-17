import { MoveDownIcon, MoveHorizontalIcon, MoveUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { formatPercentageDisplay } from "../utils/format";
import { getCountryFlagNode } from "../utils/countryFlag";
import { isPlayerCut } from "../utils/leaderboardUtils";
import type { LeaderboardPgaRow } from "../utils/types";

export function PositionChange({ posChange }: { posChange: number }) {
  if (posChange === 0) {
    return (
      <span className="ml-1 flex items-center justify-center text-3xs">
        <MoveHorizontalIcon className="w-2" />
      </span>
    );
  }

  const isPositive = posChange > 0;
  const Icon = isPositive ? MoveUpIcon : MoveDownIcon;
  const colorClass = isPositive ? "text-green-900" : "text-red-900";

  return (
    <span
      className={cn(
        "ml-0.5 flex items-center justify-center text-2xs",
        colorClass,
      )}
    >
      <Icon className="w-2" />
      {Math.abs(posChange)}
    </span>
  );
}

export function CountryFlagDisplay({
  country,
  position,
}: {
  country: string | null;
  position: string | null;
}) {
  return (
    <div className="col-span-2 row-span-2 flex items-center justify-center text-sm font-bold">
      <div
        className={cn("w-[55%] max-w-8", isPlayerCut(position) && "opacity-40")}
      >
        {getCountryFlagNode(country)}
      </div>
    </div>
  );
}

export function GolferStatsGrid({ golfer }: { golfer: LeaderboardPgaRow }) {
  return (
    <>
      <div className="col-span-6 text-sm font-bold sm:hidden">Rounds</div>
      <div className="col-span-2 text-sm font-bold sm:hidden">Usage</div>
      <div className="col-span-2 text-sm font-bold sm:hidden">Group</div>
      <div className="col-span-6 text-lg sm:hidden">
        {[golfer.roundOne, golfer.roundTwo, golfer.roundThree, golfer.roundFour]
          .filter((v): v is number => typeof v === "number")
          .join(" / ")}
      </div>
      <div className="col-span-2 text-lg sm:hidden">
        {formatPercentageDisplay(golfer.usage)}
      </div>
      <div className="col-span-2 text-lg sm:hidden">
        {golfer.group === 0 ? "-" : (golfer.group ?? "-")}
      </div>
      <div className="col-span-3 text-sm font-bold sm:col-span-2">Make Cut</div>
      <div className="col-span-3 text-sm font-bold sm:col-span-2">Top Ten</div>
      <div className="col-span-2 text-sm font-bold">Win</div>
      <div className="col-span-2 text-sm font-bold">WGR</div>
      <div className="col-span-2 text-sm font-bold">Rating</div>
      <div className="col-span-2 hidden text-sm font-bold sm:grid">Usage</div>
      <div className="col-span-2 hidden text-sm font-bold sm:grid">Group</div>

      <div className="col-span-3 text-lg sm:col-span-2">
        {formatPercentageDisplay(golfer.makeCut)}
      </div>
      <div className="col-span-3 text-lg sm:col-span-2">
        {formatPercentageDisplay(golfer.topTen)}
      </div>
      <div className="col-span-2 text-lg">
        {formatPercentageDisplay(golfer.win)}
      </div>
      <div className="col-span-2 text-lg">
        {golfer.worldRank ? `#${golfer.worldRank}` : "-"}
      </div>
      <div className="col-span-2 text-lg">{golfer.rating ?? "-"}</div>
      <div className="col-span-2 hidden text-lg sm:grid">
        {formatPercentageDisplay(golfer.usage)}
      </div>
      <div className="col-span-2 hidden text-lg sm:grid">
        {golfer.group === 0 ? "-" : (golfer.group ?? "-")}
      </div>
    </>
  );
}

export function LeaderboardHeaderRow({
  tournamentOver,
  activeTourShortForm,
}: {
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
        {tournamentOver
          ? activeTourShortForm === "PGA"
            ? "Group"
            : "Points"
          : "Today"}
      </div>
      <div className="col-span-1 place-self-center font-varela text-2xs sm:col-span-2">
        {tournamentOver
          ? activeTourShortForm === "PGA"
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
