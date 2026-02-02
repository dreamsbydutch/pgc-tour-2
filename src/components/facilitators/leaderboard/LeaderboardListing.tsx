"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { MoveDown, MoveHorizontal, MoveUp, Trophy } from "lucide-react";

import type {
  LeaderboardListingProps,
  LeaderboardPgaRow,
  LeaderboardTeamRow,
} from "@/lib";
import {
  cn,
  formatMoneyUsd,
  formatTeeTimeTimeOfDay,
  formatToPar,
  getLeaderboardRowClass,
  getPositionChangeForTeam,
  isPlayerCut,
} from "@/lib";

import { PGADropdown, TeamGolfersTable } from "@/displays";

function formatLeaderboardThruDisplay(args: {
  thru: number | null | undefined;
  teeTimeDisplay?: string | null | undefined;
}): string {
  if (args.thru === 18) return "F";
  if (args.thru == null || args.thru === 0) {
    return formatTeeTimeTimeOfDay(args.teeTimeDisplay) ?? "-";
  }
  return String(args.thru);
}

function formatLeaderboardStandingsPosition(args: {
  points: number;
  allPoints: number[];
}): { rank: number; display: string } {
  const same = args.allPoints.filter((p) => p === args.points).length;
  const better = args.allPoints.filter((p) => p > args.points).length;
  const rank = better + 1;
  return { rank, display: `${same > 1 ? "T" : ""}${rank}` };
}

function getStandingsPlayoffVariant(rank: number): "gold" | "silver" | null {
  const goldCut = 15;
  const silverCut = 35;
  if (rank <= goldCut) return "gold";
  if (rank <= silverCut) return "silver";
  return null;
}

function getStandingsVariantClass(variant: "gold" | "silver" | null): string {
  if (variant === "gold") return "font-semibold text-amber-700";
  if (variant === "silver") return "font-semibold text-slate-600";
  return "text-muted-foreground";
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

function ScoreDisplay(
  args:
    | { type: "PGA"; row: LeaderboardPgaRow; tournamentComplete: boolean }
    | { type: "PGC"; row: LeaderboardTeamRow; tournamentComplete: boolean },
) {
  if (args.type === "PGA") {
    const row = args.row;
    const cutOrWithdrawn = isPlayerCut(row.position);

    if (cutOrWithdrawn) {
      return (
        <>
          <ScoreCell
            value={row.group === 0 ? "-" : (row.group ?? "-")}
            className="col-span-1 sm:col-span-2"
          />
          <ScoreCell
            value={row.rating ?? "-"}
            className="col-span-1 sm:col-span-2"
          />
          <div className="col-span-1 hidden sm:flex" />
          <ScoreCell
            value={row.roundOne ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundTwo ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundThree ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundFour ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
        </>
      );
    }

    if (args.tournamentComplete) {
      const firstValue = row.group === 0 ? "-" : (row.group ?? "-");
      const secondValue = row.rating ?? "-";

      return (
        <>
          <ScoreCell value={firstValue} className="col-span-1 sm:col-span-2" />
          <ScoreCell
            value={secondValue}
            className="col-span-1 whitespace-nowrap sm:col-span-2"
          />
          <div className="col-span-1 hidden sm:flex" />
          <ScoreCell
            value={row.roundOne ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundTwo ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundThree ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
          <ScoreCell
            value={row.roundFour ?? "-"}
            className="col-span-1"
            hiddenOnMobile
          />
        </>
      );
    }

    return (
      <>
        <ScoreCell
          value={row.today == null ? "-" : formatToPar(row.today)}
          className="col-span-1 sm:col-span-2"
        />
        <ScoreCell
          value={formatLeaderboardThruDisplay({
            thru: row.thru,
            teeTimeDisplay: row.teeTimeDisplay,
          })}
          className="col-span-1 sm:col-span-2"
        />
        <div className="col-span-1 hidden sm:flex" />
        <ScoreCell
          value={row.roundOne ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundTwo ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundThree ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
        <ScoreCell
          value={row.roundFour ?? "-"}
          className="col-span-1"
          hiddenOnMobile
        />
      </>
    );
  }

  const row = args.row;
  const isComplete = args.tournamentComplete;
  const isOut = isPlayerCut(row.position);

  const money =
    typeof row.earnings === "number" ? formatMoneyUsd(row.earnings) : "-";
  const points = typeof row.points === "number" ? row.points : "-";
  const score = formatToPar(row.score);
  const today = row.today == null ? "-" : formatToPar(row.today);
  const thru = isOut
    ? "-"
    : formatLeaderboardThruDisplay({
        thru: row.thru,
        teeTimeDisplay: row.teeTimeDisplay,
      });

  return (
    <>
      <ScoreCell
        value={isComplete ? points : today}
        className="col-span-1 sm:col-span-2"
      />
      <ScoreCell
        value={isComplete ? money : thru}
        className="col-span-1 sm:col-span-2"
      />
      <div className="col-span-1 hidden sm:flex" />
      <ScoreCell
        value={row.roundOne ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={row.roundTwo ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={row.roundThree ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <ScoreCell
        value={row.roundFour ?? "-"}
        className="col-span-1"
        hiddenOnMobile
      />
      <div className="hidden">{score}</div>
    </>
  );
}

function PositionChange(props: { posChange: number }) {
  if (props.posChange === 0) {
    return (
      <span className="ml-1 inline-flex items-center text-xs text-muted-foreground">
        <MoveHorizontal className="h-3 w-3" />
      </span>
    );
  }

  const isPositive = props.posChange > 0;
  const Icon = isPositive ? MoveUp : MoveDown;
  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center text-xs",
        isPositive ? "text-green-700" : "text-red-700",
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(props.posChange)}
    </span>
  );
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
export function LeaderboardListing(props: LeaderboardListingProps) {
  const model = useLeaderboardListing(props);

  if (!model.nameDisplay.trim()) {
    return <LeaderboardListingSkeleton />;
  }

  return (
    <div
      onClick={model.onToggleOpen}
      className="mx-auto my-0.5 grid max-w-4xl cursor-pointer grid-flow-row grid-cols-10 rounded-md text-center"
    >
      <div className={model.rowClass}>
        <div className="col-span-2 flex place-self-center font-varela text-base sm:col-span-5">
          {model.rankDisplay}
          {model.showPosChange ? (
            <PositionChange posChange={model.posChange} />
          ) : null}
        </div>

        <div className="col-span-4 flex items-center justify-center place-self-center font-varela text-lg sm:col-span-10">
          {model.nameDisplay}

          {model.championsCount ? (
            <span className="ml-2 inline-flex items-center gap-1 text-2xs text-muted-foreground">
              <Trophy className="h-3 w-3" />
              {model.championsCount}
            </span>
          ) : null}
        </div>

        <div className="col-span-2 place-self-center font-varela text-base sm:col-span-5">
          {model.scoreDisplay}
        </div>

        {model.type === "PGA" ? (
          <ScoreDisplay
            type="PGA"
            row={model.row as LeaderboardPgaRow}
            tournamentComplete={model.tournamentComplete}
          />
        ) : (
          <ScoreDisplay
            type="PGC"
            row={model.row as LeaderboardTeamRow}
            tournamentComplete={model.tournamentComplete}
          />
        )}
      </div>

      {model.isOpen && !model.isPreTournament ? (
        <div className="col-span-10 mx-auto mb-2 w-full max-w-4xl rounded-md border border-gray-300 bg-white shadow-md">
          {model.type === "PGA" ? (
            <PGADropdown
              golfer={model.row as LeaderboardPgaRow}
              viewerTeamGolferApiIds={model.viewerTeamGolferApiIds}
            />
          ) : (
            <>
              {model.type === "PGC" && model.standings ? (
                <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-2 pt-2 text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground">Standings</span>
                    <span
                      className={getStandingsVariantClass(
                        model.standings.current.variant,
                      )}
                    >
                      {model.standings.current.position}
                    </span>
                    <span className="text-muted-foreground">
                      ({model.standings.current.points} pts)
                    </span>
                  </div>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      model.standings.delta === 0
                        ? "text-muted-foreground"
                        : model.standings.delta < 0
                          ? "text-green-700"
                          : "text-red-700",
                    )}
                  >
                    {model.standings.delta === 0 ? (
                      <MoveHorizontal className="h-3 w-3" />
                    ) : model.standings.delta < 0 ? (
                      <MoveUp className="h-3 w-3" />
                    ) : (
                      <MoveDown className="h-3 w-3" />
                    )}
                    {model.standings.delta === 0
                      ? null
                      : Math.abs(model.standings.delta)}
                  </span>

                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground">Projected</span>
                    <span
                      className={getStandingsVariantClass(
                        model.standings.projected.variant,
                      )}
                    >
                      {model.standings.projected.position}
                    </span>
                    <span className="text-muted-foreground">
                      ({model.standings.projected.points} pts)
                    </span>
                  </div>
                </div>
              ) : null}
              <TeamGolfersTable
                team={model.row as LeaderboardTeamRow}
                tournament={model.tournament}
                allGolfers={model.allGolfers}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Builds derived rendering state for a leaderboard listing row.
 *
 * @param props - `LeaderboardListingProps`.
 * @returns Render-ready fields for the row and dropdown.
 */
function useLeaderboardListing(props: LeaderboardListingProps) {
  const [isOpen, setIsOpen] = useState(false);

  return useMemo(() => {
    const tournamentComplete = (props.tournament.currentRound ?? 0) > 4;

    const shouldShowPositionChange =
      (((props.tournament.currentRound ?? 0) === 2 &&
        props.tournament.livePlay) ??
        false) ||
      (props.tournament.currentRound ?? 0) >= 3;

    const isPga = props.type === "PGA";
    const row = isPga ? props.golfer : props.team;

    const isCut = isPlayerCut(row.position);

    const isUser = (() => {
      if (props.type === "PGA") {
        return !!props.viewer?.teamGolferApiIds?.includes(props.golfer.apiId);
      }
      return props.team.tourCard.id === (props.viewer?.tourCardId ?? "");
    })();

    const isFriend =
      props.type === "PGC"
        ? Boolean(
            props.viewer?.friendIds?.includes(
              props.team.tourCard.ownerClerkId ?? "",
            ) || props.viewer?.friendIds?.includes(props.team.tourCard.id),
          )
        : false;

    const rowClass = getLeaderboardRowClass({
      type: props.type,
      isCut,
      isUser,
      isFriend,
    });

    const posChange =
      props.type === "PGA"
        ? (props.golfer.posChange ?? 0)
        : getPositionChangeForTeam(props.team);

    const showPosChange = shouldShowPositionChange && !isCut;

    const nameDisplay =
      props.type === "PGA"
        ? props.golfer.playerName
        : props.team.tourCard.displayName;

    const championsCount =
      props.type === "PGC" ? (props.team.championsCount ?? null) : null;

    const scoreDisplay = formatToPar(row.score);

    const rankDisplay = row.position ?? "-";

    const onToggleOpen = () => setIsOpen((v) => !v);

    const standings = (() => {
      if (props.type !== "PGC") return null;

      const tourId = props.team.tourCard.tourId ?? null;
      const tourTeams = props.allTeams.filter(
        (t) => t.tourCard.tourId === tourId,
      );
      const tourTeamsForRanking = tourTeams.length ? tourTeams : [props.team];

      const currentPoints = props.team.pointsBeforeTournament ?? 0;
      const currentAllPoints = tourTeamsForRanking.map(
        (t) => t.pointsBeforeTournament ?? 0,
      );
      const currentComputed = formatLeaderboardStandingsPosition({
        points: currentPoints,
        allPoints: currentAllPoints,
      });

      const projectedPoints = currentPoints + (props.team.points ?? 0);
      const projectedAllPoints = tourTeamsForRanking.map((t) => {
        const base = t.pointsBeforeTournament ?? 0;
        return base + (t.points ?? 0);
      });
      const projectedComputed = formatLeaderboardStandingsPosition({
        points: projectedPoints,
        allPoints: projectedAllPoints,
      });

      const currentPositionDisplay =
        props.team.tourCard.currentPosition ?? currentComputed.display;
      const projectedPositionDisplay = projectedComputed.display;

      return {
        current: {
          position: currentPositionDisplay,
          points: currentPoints,
          rank: currentComputed.rank,
          variant: getStandingsPlayoffVariant(currentComputed.rank),
        },
        projected: {
          position: projectedPositionDisplay,
          points: projectedPoints,
          rank: projectedComputed.rank,
          variant: getStandingsPlayoffVariant(projectedComputed.rank),
        },
        delta: projectedComputed.rank - currentComputed.rank,
      };
    })();

    return {
      type: props.type,
      tournament: props.tournament,
      allGolfers: props.allGolfers,
      isPreTournament: Boolean(props.isPreTournament),
      isOpen,
      onToggleOpen,
      tournamentComplete,
      row,
      rowClass,
      rankDisplay,
      nameDisplay,
      scoreDisplay,
      championsCount,
      posChange,
      showPosChange,
      viewerTeamGolferApiIds: props.viewer?.teamGolferApiIds ?? null,
      standings,
    };
  }, [isOpen, props]);
}

/**
 * Loading UI for `LeaderboardListing`.
 */
function LeaderboardListingSkeleton() {
  return (
    <div className="mx-auto my-1 h-8 w-full max-w-4xl rounded-md bg-slate-100" />
  );
}
