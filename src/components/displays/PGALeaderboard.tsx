"use client";

import { Fragment, ReactNode, useState } from "react";
import {
  cn,
  formatNumberToPercentage,
  formatTeeTimeTimeOfDay,
  formatToPar,
  getCountryFlagEmoji,
  isPlayerCut,
} from "@/lib";
import {
  EnhancedTournamentGolferDoc,
  TeamDoc,
  TournamentDoc,
} from "convex/types/types";
import { MoveDown, MoveHorizontal, MoveUp } from "lucide-react";
import { calculateScoreForSorting } from "convex/utils";

/**
 * Renders the PGA leaderboard listing for the current tournament.
 *
 * Data:
 * - Receives already-shaped PGA rows from the parent screen (`LeaderboardViewModel`).
 * - Sorts rows via `sortPgaRows`.
 *
 * @param props.golfers - PGA leaderboard rows.
 * @param props.tournament - Tournament metadata used to determine display state.
 * @param props.viewer - Viewer context (for highlighting the viewer's golfers).
 * @param props.isPreTournament - When true, disables row expansion.
 * @returns A sequence of clickable leaderboard rows.
 */
export function PGALeaderboard(props: {
  golfers: EnhancedTournamentGolferDoc[];
  tournament: TournamentDoc;
  currentTeam?: TeamDoc;
}) {
  const nonCut = props.golfers.filter((r) => !isPlayerCut(r.position));
  const cut = props.golfers.filter((r) => isPlayerCut(r.position));
  nonCut.sort(
    (a, b) =>
      calculateScoreForSorting(a.position, a.score) -
      calculateScoreForSorting(b.position, b.score),
  );
  cut
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    )
    .sort((a, b) => (a.group ?? 999) - (b.group ?? 999))
    .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));
  const sortedGolfers = [...nonCut, ...cut];

  return (
    <>
      {sortedGolfers.map((golfer, index) => {
        const prev = index === 0 ? null : sortedGolfers[index - 1];
        const showDivider =
          prev == null ? false : shouldRenderPgaDivider(prev, golfer);
        const teeTimeDisplay =
          props.tournament.currentRound === 1
            ? golfer.roundOneTeeTime
            : props.tournament.currentRound === 2
              ? golfer.roundTwoTeeTime
              : props.tournament.currentRound === 3
                ? golfer.roundThreeTeeTime
                : props.tournament.currentRound === 4
                  ? golfer.roundFourTeeTime
                  : "-";

        return (
          <Fragment key={golfer._id}>
            {showDivider ? <LeaderboardSectionDivider /> : null}
            <LeaderboardListing
              tournament={props.tournament}
              team={props.currentTeam}
              golfer={{
                position: golfer.position ?? "-",
                playerName: golfer.playerName ?? "",
                score: golfer.score ?? 500,
                apiId: golfer.apiId ?? -1,
                country: golfer.country ?? null,
                roundOne: golfer.roundOne ?? 0,
                roundTwo: golfer.roundTwo ?? 0,
                roundThree: golfer.roundThree ?? 0,
                roundFour: golfer.roundFour ?? 0,
                posChange: golfer.posChange ?? 0,
                worldRank: golfer.worldRank ?? 501,
                rating: golfer.rating ?? -1,
                group: golfer.group ?? 0,
                thru: golfer.thru ?? 0,
                today: golfer.today ?? 500,
                makeCut: golfer.makeCut ?? 0,
                topTen: golfer.topTen ?? 0,
                win: golfer.win ?? 0,
                usage: golfer.usage ?? 0,
                teeTimeDisplay: teeTimeDisplay ?? "-",
              }}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Determines whether to render a visual divider before the current PGA row.
 *
 * Rules:
 * - Add a divider between the last non-cut row and the first cut/WD/DQ row.
 * - Within the cut section, add a divider when `group` changes.
 */
function shouldRenderPgaDivider(
  prev: EnhancedTournamentGolferDoc,
  curr: EnhancedTournamentGolferDoc,
) {
  const prevIsCut = isPlayerCut(prev.position);
  const currIsCut = isPlayerCut(curr.position);

  if (!prevIsCut && currIsCut) return true;
  if (prevIsCut && currIsCut)
    return (prev.group ?? 999) !== (curr.group ?? 999);
  return false;
}

/**
 * Simple horizontal divider used to visually separate leaderboard row sections.
 */
function LeaderboardSectionDivider() {
  return <div className="mx-auto my-2 max-w-4xl border border-t-2" />;
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
  golfer,
}: {
  tournament: { currentRound?: number | undefined; livePlay?: boolean | null };
  team?: {
    _id: string;
    golferIds: number[];
  };
  golfer: {
    position: string;
    playerName: string;
    score: number;
    apiId: number;
    country: string | null;
    roundOne: number;
    roundTwo: number;
    roundThree: number;
    roundFour: number;
    posChange: number;
    worldRank: number;
    rating: number;
    group: number;
    thru: number;
    today: number;
    makeCut: number;
    topTen: number;
    win: number;
    usage: number;
    teeTimeDisplay: string;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isCut = isPlayerCut(golfer.position);
  const isUserGolfer = !!team?.golferIds.includes(golfer.apiId);
  const onToggleOpen = () => setIsOpen((v) => !v);
  const rowClass = getLeaderboardRowClass({
    isCut,
    isUserGolfer,
  });
  return (
    <div
      onClick={onToggleOpen}
      className="mx-auto my-0.5 grid max-w-4xl cursor-pointer grid-flow-row grid-cols-10 rounded-md text-center"
    >
      <div className={rowClass}>
        <div className="col-span-2 flex place-self-center font-varela text-base sm:col-span-5">
          {golfer.position ?? "-"}
          {(tournament.currentRound ?? 0) >= 2 ? (
            <PositionChange posChange={golfer.posChange} />
          ) : null}
        </div>

        <div className="col-span-4 flex items-center justify-center place-self-center font-varela text-lg sm:col-span-10">
          {golfer.playerName}
        </div>

        <div className="col-span-2 place-self-center font-varela text-base sm:col-span-5">
          {formatToPar(golfer.score)}
        </div>

        <ScoreDisplay
          golfer={golfer}
          tournamentComplete={
            (tournament.currentRound ?? 0) >= 4 && !tournament.livePlay
          }
        />
      </div>

      {isOpen ? (
        <div className="col-span-10 mx-auto mb-2 w-full max-w-4xl rounded-md border border-gray-300 bg-white shadow-md">
          <PGADropdown golfer={golfer} currentTeamGolferIds={team?.golferIds} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders the expandable details panel for a single PGA golfer row.
 *
 * Behavior:
 * - Applies highlighting when the golfer is on the viewer's team.
 * - Shows a country flag (emoji) when available.
 * - Displays quick stats (make cut / top ten / win / WGR / rating / usage / group).
 *
 * @param props.golfer - The PGA row to display details for.
 * @param props.currentTeamGolferIds - API ids for golfers on the viewer's team.
 * @returns A compact stats panel.
 */
function PGADropdown(props: {
  golfer: {
    apiId: number;
    country: string | null;
    roundOne: number;
    roundTwo: number;
    roundThree: number;
    roundFour: number;
    position: string;
    group: number;
    rating: number;
    makeCut: number;
    topTen: number;
    win: number;
    worldRank: number;
    usage: number;
  };
  currentTeamGolferIds?: number[];
}) {
  return (
    <div
      className={cn(
        "col-span-10 mb-2 rounded-lg p-2 pt-1",
        !!props.currentTeamGolferIds?.includes(props.golfer.apiId) &&
          "bg-slate-100",
        isPlayerCut(props.golfer.position) && "text-gray-400",
      )}
    >
      <div className="mx-auto grid max-w-2xl grid-cols-12 sm:grid-cols-16">
        <div className="col-span-2 row-span-2 flex items-center justify-center text-sm font-bold">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center overflow-hidden",
              isPlayerCut(props.golfer.position) && "opacity-40",
            )}
          >
            {getCountryFlagEmoji(props.golfer.country) ?? null}
          </div>
        </div>

        <div className="col-span-10 text-sm font-bold sm:hidden">Rounds</div>
        <div className="col-span-10 text-lg sm:hidden">
          {[
            props.golfer.roundOne,
            props.golfer.roundTwo,
            props.golfer.roundThree,
            props.golfer.roundFour,
          ]
            .filter((v): v is number => typeof v === "number")
            .join(" / ")}
        </div>

        <div className="col-span-3 text-sm font-bold sm:col-span-2">
          Make Cut
        </div>
        <div className="col-span-3 text-sm font-bold sm:col-span-2">
          Top Ten
        </div>
        <div className="col-span-2 text-sm font-bold">Win</div>
        <div className="col-span-2 text-sm font-bold">WGR</div>
        <div className="col-span-2 text-sm font-bold">Rating</div>
        <div className="col-span-2 hidden text-sm font-bold sm:grid">Usage</div>
        <div className="col-span-2 hidden text-sm font-bold sm:grid">Group</div>

        <div className="col-span-3 text-lg sm:col-span-2">
          {formatNumberToPercentage(props.golfer.makeCut)}
        </div>
        <div className="col-span-3 text-lg sm:col-span-2">
          {formatNumberToPercentage(props.golfer.topTen)}
        </div>
        <div className="col-span-2 text-lg">
          {formatNumberToPercentage(props.golfer.win)}
        </div>
        <div className="col-span-2 text-lg">
          {props.golfer.worldRank ? `#${props.golfer.worldRank}` : "-"}
        </div>
        <div className="col-span-2 text-lg">{props.golfer.rating ?? "-"}</div>
        <div className="col-span-2 hidden text-lg sm:grid">
          {formatNumberToPercentage(props.golfer.usage)}
        </div>
        <div className="col-span-2 hidden text-lg sm:grid">
          {props.golfer.group === 0 ? "-" : (props.golfer.group ?? "-")}
        </div>
      </div>
    </div>
  );
}

function ScoreDisplay(props: {
  golfer: {
    position: string;
    group: number;
    rating: number;
    roundOne: number;
    roundTwo: number;
    roundThree: number;
    roundFour: number;
    thru: number;
    today: number;
    teeTimeDisplay: string;
  };
  tournamentComplete: boolean;
}) {
  if (isPlayerCut(props.golfer.position)) {
    return (
      <>
        <ScoreCell
          value={props.golfer.group === 0 ? "-" : (props.golfer.group ?? "-")}
          className="col-span-1 sm:col-span-2"
        />
        <ScoreCell
          value={props.golfer.rating ?? "-"}
          className="col-span-1 sm:col-span-2"
        />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={props.golfer.roundOne ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundTwo ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundThree ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundFour ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
      </>
    );
  }

  if (props.tournamentComplete) {
    return (
      <>
        <ScoreCell
          value={props.golfer.group === 0 ? "-" : (props.golfer.group ?? "-")}
          className="col-span-1 sm:col-span-2"
        />
        <ScoreCell
          value={props.golfer.rating ?? "-"}
          className="col-span-1 whitespace-nowrap sm:col-span-2"
        />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={props.golfer.roundOne ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundTwo ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundThree ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundFour ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
      </>
    );
  }

  return (
    <>
      {props.golfer.thru == null || props.golfer.thru === 0 ? (
        <ScoreCell
          value={formatTeeTimeTimeOfDay(props.golfer.teeTimeDisplay) ?? "-"}
          className="col-span-2 sm:col-span-4"
        />
      ) : (
        <>
          <ScoreCell
            value={
              props.golfer.today == null ? "-" : formatToPar(props.golfer.today)
            }
            className="col-span-1 sm:col-span-2"
          />
          <ScoreCell
            value={props.golfer.thru === 18 ? "F" : (props.golfer.thru ?? "-")}
            className="col-span-1 sm:col-span-2"
          />
        </>
      )}
      <div className="col-span-1 hidden sm:flex" />
      <ScoreCell
        value={props.golfer.roundOne ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.golfer.roundTwo ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.golfer.roundThree ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.golfer.roundFour ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
    </>
  );
}
function getLeaderboardRowClass(args: {
  isCut: boolean;
  isUserGolfer: boolean;
}): string {
  const classes = [
    "col-span-10 grid grid-flow-row grid-cols-10 py-0.5 sm:grid-cols-33",
  ];
  if (args.isUserGolfer) classes.push("bg-slate-100");
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
