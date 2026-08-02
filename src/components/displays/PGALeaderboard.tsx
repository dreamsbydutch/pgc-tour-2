"use client";

import { Fragment, ReactNode, useState } from "react";
import {
  cn,
  formatLeaderboardThruDisplay,
  formatNumberToPercentage,
  parseRankFromPositionString,
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
import { api, Id, useQuery } from "@/convex";
import type { EspnHoleScore, EspnHoleScorecard } from "@/types";
import { getCompletedHoleSegmentTotal } from "@/utils";

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
  nonCut
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    )
    .sort(
      (a, b) =>
        parseRankFromPositionString(a.position) -
        parseRankFromPositionString(b.position),
    );
  cut
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    )
    .sort((a, b) => (a.group ?? 999) - (b.group ?? 999))
    .sort(
      (a, b) =>
        parseRankFromPositionString(a.position) -
        parseRankFromPositionString(b.position),
    );
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
                golferId: golfer.golferId,
                position: golfer.position ?? "-",
                playerName: golfer.playerName ?? "",
                score: golfer.score,
                apiId: golfer.apiId ?? -1,
                country: golfer.country ?? null,
                roundOne: golfer.roundOne,
                roundTwo: golfer.roundTwo,
                roundThree: golfer.roundThree,
                roundFour: golfer.roundFour,
                posChange: golfer.posChange ?? 0,
                worldRank: golfer.worldRank ?? 501,
                rating: golfer.rating ?? -1,
                group: golfer.group ?? 0,
                thru: golfer.thru,
                today: golfer.today,
                makeCut: golfer.makeCut ?? 0,
                topTen: golfer.topTen ?? 0,
                win: golfer.win ?? 0,
                usage: golfer.usage ?? 0,
                teeTimeDisplay,
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
  tournament: {
    _id: Id<"tournaments">;
    currentRound?: number | undefined;
    livePlay?: boolean | null;
    status?: TournamentDoc["status"];
  };
  team?: {
    _id: string;
    golferIds: number[];
  };
  golfer: {
    golferId: Id<"golfers">;
    position: string;
    playerName: string;
    score: number | null | undefined;
    apiId: number;
    country: string | null;
    roundOne: number | null | undefined;
    roundTwo: number | null | undefined;
    roundThree: number | null | undefined;
    roundFour: number | null | undefined;
    posChange: number;
    worldRank: number;
    rating: number;
    group: number;
    thru: number | null | undefined;
    today: number | null | undefined;
    makeCut: number;
    topTen: number;
    win: number;
    usage: number;
    teeTimeDisplay: string | number | null | undefined;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const holeScorecard = useQuery(
    api.functions.espnGolf.getPlayerHoleScorecard,
    isOpen
      ? { tournamentId: tournament._id, golferId: golfer.golferId }
      : "skip",
  );
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
          tournamentComplete={tournament.status === "completed"}
        />
      </div>

      {isOpen ? (
        <div className="col-span-10 mx-auto mb-2 w-full max-w-4xl rounded-md border border-gray-300 bg-white shadow-md">
          <PGADropdown
            golfer={golfer}
            currentTeamGolferIds={team?.golferIds}
            holeScorecard={holeScorecard}
          />
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
    roundOne: number | null | undefined;
    roundTwo: number | null | undefined;
    roundThree: number | null | undefined;
    roundFour: number | null | undefined;
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
  holeScorecard:
    | {
        rounds: Array<{
          round: number;
          totalStrokes?: number;
          holes: Array<{
            hole: number;
            strokes: number;
            relativeToPar: number;
          }>;
        }>;
      }
    | null
    | undefined;
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
      <PGAHoleScorecard scorecard={props.holeScorecard} />
    </div>
  );
}

/** Minimal, horizontally scrollable four-round PGA scorecard. */
export function PGAHoleScorecard(props: {
  scorecard: EspnHoleScorecard | null | undefined;
  caption?: string;
}) {
  if (props.scorecard === undefined) {
    return (
      <div className="mt-3 border-t pt-3 text-center text-xs text-muted-foreground">
        Loading hole-by-hole scoring...
      </div>
    );
  }
  if (props.scorecard === null) {
    return (
      <div className="mt-3 border-t pt-3 text-center text-xs text-muted-foreground">
        Hole-by-hole scoring unavailable.
      </div>
    );
  }

  const rounds = new Map(
    props.scorecard.rounds.map((round) => [round.round, round]),
  );
  const pars = new Map<number, number>();
  for (const round of props.scorecard.rounds) {
    for (const score of round.holes) {
      if (!pars.has(score.hole)) {
        pars.set(score.hole, score.strokes - score.relativeToPar);
      }
    }
  }
  const frontPar = totalWhenComplete(
    Array.from({ length: 9 }, (_, index) => pars.get(index + 1)),
  );
  const backPar = totalWhenComplete(
    Array.from({ length: 9 }, (_, index) => pars.get(index + 10)),
  );
  const totalPar =
    frontPar !== undefined && backPar !== undefined
      ? frontPar + backPar
      : undefined;
  return (
    <div
      className="mt-2 max-w-full overflow-x-auto border-t pt-2"
      onClick={(event) => event.stopPropagation()}
      aria-label="Hole-by-hole scorecard"
    >
      <table className="mx-auto min-w-[540px] table-fixed border-collapse border border-gray-400 text-center font-varela text-[8px] [-webkit-text-size-adjust:none] [text-size-adjust:none] sm:min-w-[716px] sm:text-[10px]">
        <caption className="sr-only">
          {props.caption ?? "Golfer scores for holes 1 through 18"}
        </caption>
        <thead>
          <tr className="text-muted-foreground">
            <th
              className="w-6 border border-r-2 border-gray-300 border-r-gray-400 bg-gray-50/70 py-0.5 font-medium sm:w-8"
              scope="col"
            >
              Rd
            </th>
            {Array.from({ length: 9 }, (_, index) => (
              <th
                className="w-6 border border-gray-200 py-0.5 font-medium sm:w-8"
                scope="col"
                key={index + 1}
              >
                {index + 1}
              </th>
            ))}
            <ScorecardSummaryHeader label="OUT" />
            {Array.from({ length: 9 }, (_, index) => (
              <th
                className="w-6 border border-gray-200 py-0.5 font-medium sm:w-8"
                scope="col"
                key={index + 10}
              >
                {index + 10}
              </th>
            ))}
            <ScorecardSummaryHeader label="IN" />
            <ScorecardSummaryHeader label="TOT" />
          </tr>
          <tr className="bg-gray-50/70 text-[7px] text-muted-foreground sm:text-[9px]">
            <th
              className="border border-r-2 border-gray-300 border-r-gray-400 py-0.5 font-normal"
              scope="row"
            >
              Par
            </th>
            {Array.from({ length: 9 }, (_, index) => (
              <td className="border border-gray-200 py-0.5" key={index + 1}>
                {formatScorecardNumber(pars.get(index + 1))}
              </td>
            ))}
            <ScorecardSummaryCell value={frontPar} />
            {Array.from({ length: 9 }, (_, index) => (
              <td className="border border-gray-200 py-0.5" key={index + 10}>
                {formatScorecardNumber(pars.get(index + 10))}
              </td>
            ))}
            <ScorecardSummaryCell value={backPar} />
            <ScorecardSummaryCell value={totalPar} />
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4].map((roundNumber) => {
            const round = rounds.get(roundNumber);
            const holes = new Map(
              round?.holes.map((hole) => [hole.hole, hole]) ?? [],
            );
            const frontTotal = getCompletedHoleSegmentTotal(
              Array.from(
                { length: 9 },
                (_, index) => holes.get(index + 1),
              ),
            );
            const backTotal = getCompletedHoleSegmentTotal(
              Array.from(
                { length: 9 },
                (_, index) => holes.get(index + 10),
              ),
            );
            const roundTotal =
              round?.totalStrokes ??
              (frontTotal !== undefined && backTotal !== undefined
                ? frontTotal + backTotal
                : undefined);
            return (
              <tr key={roundNumber}>
                <th
                  className="border border-r-2 border-gray-300 border-r-gray-400 bg-gray-50/60 py-1 font-medium text-muted-foreground sm:py-1.5"
                  scope="row"
                >
                  R{roundNumber}
                </th>
                {Array.from({ length: 9 }, (_, index) => {
                  const holeNumber = index + 1;
                  return (
                    <HoleScoreCell
                      key={holeNumber}
                      score={holes.get(holeNumber)}
                    />
                  );
                })}
                <ScorecardSummaryCell value={frontTotal} />
                {Array.from({ length: 9 }, (_, index) => {
                  const holeNumber = index + 10;
                  return (
                    <HoleScoreCell
                      key={holeNumber}
                      score={holes.get(holeNumber)}
                    />
                  );
                })}
                <ScorecardSummaryCell value={backTotal} />
                <ScorecardSummaryCell value={roundTotal} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScorecardSummaryHeader(props: { label: "OUT" | "IN" | "TOT" }) {
  return (
    <th
      className="w-7 border border-x-2 border-gray-400 bg-gray-100/80 py-0.5 font-semibold sm:w-9"
      scope="col"
    >
      {props.label}
    </th>
  );
}

function ScorecardSummaryCell(props: { value: number | undefined }) {
  return (
    <td className="border border-x-2 border-gray-400 bg-gray-100/80 px-0 py-0.5 font-semibold">
      {formatScorecardNumber(props.value)}
    </td>
  );
}

function totalWhenComplete(values: Array<number | undefined>) {
  return values.length > 0 && values.every((value) => value !== undefined)
    ? (values as number[]).reduce((total, value) => total + value, 0)
    : undefined;
}

function formatScorecardNumber(value: number | undefined) {
  if (value === undefined) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function HoleScoreCell(props: { score?: EspnHoleScore }) {
  const completion = props.score?.completion;
  const completionPercent =
    completion && completion.total > 0
      ? Math.max(
          0,
          Math.min(100, (completion.completed / completion.total) * 100),
        )
      : 0;
  const completionLabel = completion
    ? `${completion.completed} of ${completion.total} golfers finished this hole`
    : undefined;

  return (
    <td
      className="h-6 border border-gray-200 py-0.5 sm:h-8"
      data-completion={completionLabel}
      style={
        completion
          ? {
              backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.12) ${completionPercent}%, transparent ${completionPercent}%)`,
            }
          : undefined
      }
      title={completionLabel}
    >
      <HoleScoreMark score={props.score} />
      {completionLabel ? (
        <span className="sr-only">{completionLabel}</span>
      ) : null}
    </td>
  );
}

function HoleScoreMark(props: { score?: EspnHoleScore }) {
  if (!props.score) {
    return <span className="text-gray-300">-</span>;
  }
  const relative = props.score.relativeToPar;
  const description =
    relative <= -2
      ? "eagle or better"
      : relative < 0
        ? relative === -1
          ? "birdie"
          : "under-par average"
        : relative === 0
          ? "par"
          : relative >= 2
            ? "double bogey or worse"
            : relative === 1
              ? "bogey"
              : "over-par average";
  const shape =
    relative <= -1.5
      ? "double-circle"
      : relative < 0
        ? "circle"
        : relative >= 1.5
          ? "double-square"
          : relative > 0
            ? "square"
            : "none";
  const isDouble = shape === "double-circle" || shape === "double-square";
  const isCircle = shape === "circle" || shape === "double-circle";
  return (
    <span
      aria-label={`${props.score.strokes} strokes, ${description}${props.score.synthetic ? ", estimated WD penalty score" : ""}`}
      data-score-shape={shape}
      data-synthetic={props.score.synthetic ? "true" : undefined}
      title={
        props.score.synthetic
          ? "Estimated score added for the WD/DQ +8 penalty"
          : undefined
      }
      className={cn(
        "mx-auto inline-flex h-4 w-4 items-center justify-center text-[8px] leading-none text-foreground sm:h-5 sm:w-5 sm:text-[10px]",
        shape !== "none" && "border border-current",
        isCircle && "rounded-full",
        props.score.synthetic &&
          "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
      )}
    >
      {isDouble ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-3 w-3 items-center justify-center border border-current sm:h-4 sm:w-4",
            isCircle && "rounded-full",
          )}
        >
          {formatScorecardNumber(props.score.strokes)}
        </span>
      ) : (
        formatScorecardNumber(props.score.strokes)
      )}
    </span>
  );
}

function ScoreDisplay(props: {
  golfer: {
    position: string;
    group: number;
    rating: number;
    roundOne: number | null | undefined;
    roundTwo: number | null | undefined;
    roundThree: number | null | undefined;
    roundFour: number | null | undefined;
    thru: number | null | undefined;
    today: number | null | undefined;
    teeTimeDisplay: string | number | null | undefined;
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
          value={
            typeof props.golfer.roundOne === "number" &&
            props.golfer.roundOne > 0
              ? props.golfer.roundOne
              : "-"
          }
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={
            typeof props.golfer.roundTwo === "number" &&
            props.golfer.roundTwo > 0
              ? props.golfer.roundTwo
              : "-"
          }
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={
            typeof props.golfer.roundThree === "number" &&
            props.golfer.roundThree > 0
              ? props.golfer.roundThree
              : "-"
          }
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={
            typeof props.golfer.roundFour === "number" &&
            props.golfer.roundFour > 0
              ? props.golfer.roundFour
              : "-"
          }
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
          value={
            typeof props.golfer.roundOne === "number" &&
            props.golfer.roundOne > 0
              ? props.golfer.roundOne
              : "-"
          }
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={
            typeof props.golfer.roundTwo === "number" &&
            props.golfer.roundTwo > 0
              ? props.golfer.roundTwo
              : "-"
          }
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={
            typeof props.golfer.roundThree === "number" &&
            props.golfer.roundThree > 0
              ? props.golfer.roundThree
              : "-"
          }
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={
            typeof props.golfer.roundFour === "number" &&
            props.golfer.roundFour > 0
              ? props.golfer.roundFour
              : "-"
          }
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
            value={formatToPar(props.golfer.today)}
            className="col-span-1 sm:col-span-2"
          />
          <ScoreCell
            value={formatLeaderboardThruDisplay({ thru: props.golfer.thru })}
            className="col-span-1 sm:col-span-2"
          />
        </>
      )}
      <div className="col-span-1 hidden sm:flex" />
      <ScoreCell
        value={
          typeof props.golfer.roundOne === "number" && props.golfer.roundOne > 0
            ? props.golfer.roundOne
            : "-"
        }
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={
          typeof props.golfer.roundTwo === "number" && props.golfer.roundTwo > 0
            ? props.golfer.roundTwo
            : "-"
        }
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={
          typeof props.golfer.roundThree === "number" &&
          props.golfer.roundThree > 0
            ? props.golfer.roundThree
            : "-"
        }
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={
          typeof props.golfer.roundFour === "number" &&
          props.golfer.roundFour > 0
            ? props.golfer.roundFour
            : "-"
        }
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
