"use client";

import { Fragment, ReactNode, useMemo, useState } from "react";
import {
  buildPgaLeaderboardRows,
  cn,
  formatLeaderboardThruDisplay,
  formatNumberToPercentage,
  formatToPar,
  getCountryFlagEmoji,
  getDataGolfStateMessage,
  isPlayerCut,
  PgaLeaderboardRow,
  shouldRenderPgaDivider,
  sortPgaRows,
  Team,
  Tournament,
} from "@/lib";
import { MoveDown, MoveHorizontal, MoveUp } from "lucide-react";
import { useDataGolf } from "@/hooks";
import { useQuery } from "convex/react";
import { api, Id } from "@/convex";

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
export function PGALeaderboard(props: { tournament: Tournament, userTourCard?: { _id: Id<"tourCards"> } }) {
  const requests = useMemo(
    () => ({
      liveResult: {
        endpoint: "fetchLiveModelPredictions" as const,
        args: {
          tournament: props.tournament,
          options: {
            tour: "pga" as const,
            oddsFormat: "percent" as const,
            sortByPosition: true,
          },
        },
      },
      historicalResult: {
        endpoint: "fetchHistoricalRoundData" as const,
        args: {
          tournament: props.tournament,
          options: {
            year: new Date().getFullYear(),
            tour: "pga",
          },
        },
      },
    }),
    [props.tournament],
  );
  const { data, errors, hasError, isLoading } = useDataGolf({
    requests,
  });
  const userTeam = useQuery(api.functions.teams.getTeams, {
    options: {
      filter: {
        tournamentId: props.tournament._id,
        tourCardId: props.userTourCard?._id,
      },
    },
  });
  const rows = buildPgaLeaderboardRows({
    tournament: props.tournament,
    liveResult: data.liveResult,
    historicalResult: data.historicalResult,
  });
  const message = getDataGolfStateMessage({
    liveResult: data.liveResult,
    historicalResult: data.historicalResult,
  });

  if (isLoading) {
    return <PGALeaderboardSkeleton />;
  }

  if (hasError) {
    return (
      <LeaderboardStatePanel
        message={
          Object.values(errors)[0] ??
          "Unable to load the PGA leaderboard from DataGolf right now."
        }
      />
    );
  }

  if (rows.length === 0) {
    return <LeaderboardStatePanel message={message} />;
  }

  const sortedGolfers = sortPgaRows(rows);

  return (
    <>
      {sortedGolfers.map((golfer, index) => {
        const prev = index === 0 ? null : sortedGolfers[index - 1];
        const showDivider =
          prev == null ? false : shouldRenderPgaDivider(prev, golfer);

        return (
          <Fragment key={golfer.apiId}>
            {showDivider ? <LeaderboardSectionDivider /> : null}
            <LeaderboardListing
              tournament={props.tournament}
              team={userTeam?.[0]}
              golfer={golfer}
            />
          </Fragment>
        );
      })}
    </>
  );
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
  team?: Pick<Team, "_id" | "golferIds">;
  golfer: PgaLeaderboardRow;
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
  golfer: PgaLeaderboardRow;
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
          {props.golfer.group == null || props.golfer.group === 0
            ? "-"
            : props.golfer.group}
        </div>
      </div>
    </div>
  );
}

function ScoreDisplay(props: {
  golfer: PgaLeaderboardRow;
  tournamentComplete: boolean;
}) {
  if (isPlayerCut(props.golfer.position)) {
    return (
      <>
        <ScoreCell
          value={
            props.golfer.group == null || props.golfer.group === 0
              ? "-"
              : props.golfer.group
          }
          className="col-span-1 sm:col-span-2"
        />
        <ScoreCell
          value={props.golfer.rating ?? "-"}
          className="col-span-1 sm:col-span-2"
        />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={props.golfer.roundOne > 0 ? props.golfer.roundOne : "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundTwo > 0 ? props.golfer.roundTwo : "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundThree > 0 ? props.golfer.roundThree : "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundFour > 0 ? props.golfer.roundFour : "-"}
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
          value={
            props.golfer.group == null || props.golfer.group === 0
              ? "-"
              : props.golfer.group
          }
          className="col-span-1 sm:col-span-2"
        />
        <ScoreCell
          value={props.golfer.rating ?? "-"}
          className="col-span-1 whitespace-nowrap sm:col-span-2"
        />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={props.golfer.roundOne > 0 ? props.golfer.roundOne : "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundTwo > 0 ? props.golfer.roundTwo : "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundThree > 0 ? props.golfer.roundThree : "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={props.golfer.roundFour > 0 ? props.golfer.roundFour : "-"}
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
          value={formatLeaderboardThruDisplay({
            thru: props.golfer.thru,
            teeTimeDisplay: props.golfer.teeTimeDisplay,
          })}
          className="col-span-2 sm:col-span-4"
        />
      ) : (
        <>
          <ScoreCell
            value={formatToPar(props.golfer.today)}
            className="col-span-1 sm:col-span-2"
          />
          <ScoreCell
            value={formatLeaderboardThruDisplay({
              thru: props.golfer.thru,
              teeTimeDisplay: props.golfer.teeTimeDisplay,
            })}
            className="col-span-1 sm:col-span-2"
          />
        </>
      )}
      <div className="col-span-1 hidden sm:flex" />
      <ScoreCell
        value={props.golfer.roundOne > 0 ? props.golfer.roundOne : "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.golfer.roundTwo > 0 ? props.golfer.roundTwo : "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.golfer.roundThree > 0 ? props.golfer.roundThree : "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={props.golfer.roundFour > 0 ? props.golfer.roundFour : "-"}
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

/**
 * Loading UI for PGA leaderboard rows while DataGolf requests are in flight.
 */
function PGALeaderboardSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-2"
      aria-busy="true"
    >
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-r from-white via-slate-50 to-slate-100 shadow-sm"
        >
          <div className="grid grid-cols-10 items-center gap-3 px-4 py-3 sm:grid-cols-33">
            <SkeletonBlock className="col-span-2 h-5 w-12 sm:col-span-5" />
            <SkeletonBlock className="col-span-4 h-6 w-full max-w-40 justify-self-center sm:col-span-10" />
            <SkeletonBlock className="col-span-2 h-5 w-14 justify-self-center sm:col-span-5" />
            <SkeletonBlock className="col-span-2 h-5 w-20 justify-self-center sm:col-span-4" />
            <div className="col-span-1 hidden sm:flex" />
            <SkeletonBlock className="hidden h-5 w-10 justify-self-center sm:block" />
            <SkeletonBlock className="hidden h-5 w-10 justify-self-center sm:block" />
            <SkeletonBlock className="hidden h-5 w-10 justify-self-center sm:block" />
            <SkeletonBlock className="hidden h-5 w-10 justify-self-center sm:block" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty/error state container for PGA leaderboard fetch results.
 */
function LeaderboardStatePanel(props: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
      {props.message}
    </div>
  );
}

/**
 * Shared skeleton block used by leaderboard loading states.
 */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200",
        className,
      )}
    />
  );
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
