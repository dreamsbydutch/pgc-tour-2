"use client";

import { useMemo } from "react";

import type { LeaderboardPgaRow } from "@/lib";
import {
  cn,
  formatPercentageDisplay,
  getCountryFlagEmoji,
  isPlayerCut,
} from "@/lib";

/**
 * Renders the expandable details panel for a single PGA golfer row.
 *
 * Behavior:
 * - Applies highlighting when the golfer is on the viewer's team.
 * - Shows a country flag (emoji) when available.
 * - Displays quick stats (make cut / top ten / win / WGR / rating / usage / group).
 *
 * @param props.golfer - The PGA row to display details for.
 * @param props.viewerTeamGolferApiIds - API ids for golfers on the viewer's team.
 * @returns A compact stats panel.
 */
export function PGADropdown(props: {
  golfer: LeaderboardPgaRow;
  viewerTeamGolferApiIds?: number[] | null;
}) {
  const isMissingStats =
    props.golfer.roundOne == null &&
    props.golfer.roundTwo == null &&
    props.golfer.roundThree == null &&
    props.golfer.roundFour == null &&
    props.golfer.usage == null &&
    props.golfer.makeCut == null &&
    props.golfer.topTen == null &&
    props.golfer.win == null;

  const model = usePGADropdown(props);

  if (isMissingStats) {
    return <PGADropdownSkeleton />;
  }

  return (
    <div
      className={cn(
        "col-span-10 mb-2 rounded-lg p-2 pt-1",
        model.isUserTeamGolfer && "bg-slate-100",
        model.cutOrWithdrawn && "text-gray-400",
      )}
    >
      <div className="mx-auto grid max-w-2xl grid-cols-12 sm:grid-cols-16">
        <div className="col-span-2 row-span-2 flex items-center justify-center text-sm font-bold">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center overflow-hidden",
              model.cutOrWithdrawn && "opacity-40",
            )}
          >
            {model.flagNode}
          </div>
        </div>

        <div className="col-span-6 text-sm font-bold sm:hidden">Rounds</div>
        <div className="col-span-2 text-sm font-bold sm:hidden">Usage</div>
        <div className="col-span-2 text-sm font-bold sm:hidden">Group</div>
        <div className="col-span-6 text-lg sm:hidden">
          {model.roundsDisplay}
        </div>
        <div className="col-span-2 text-lg sm:hidden">{model.usageDisplay}</div>
        <div className="col-span-2 text-lg sm:hidden">{model.groupDisplay}</div>

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
          {model.makeCutDisplay}
        </div>
        <div className="col-span-3 text-lg sm:col-span-2">
          {model.topTenDisplay}
        </div>
        <div className="col-span-2 text-lg">{model.winDisplay}</div>
        <div className="col-span-2 text-lg">{model.worldRankDisplay}</div>
        <div className="col-span-2 text-lg">{model.ratingDisplay}</div>
        <div className="col-span-2 hidden text-lg sm:grid">
          {model.usageDisplay}
        </div>
        <div className="col-span-2 hidden text-lg sm:grid">
          {model.groupDisplay}
        </div>
      </div>
    </div>
  );
}

/**
 * Derives the expandable PGA row detail panel view model.
 *
 * @param args.golfer - The PGA row.
 * @param args.viewerTeamGolferApiIds - API ids on the viewer's team.
 * @returns Display-ready values for the dropdown panel.
 */
function usePGADropdown(args: {
  golfer: LeaderboardPgaRow;
  viewerTeamGolferApiIds?: number[] | null;
}) {
  return useMemo(() => {
    const isUserTeamGolfer = !!args.viewerTeamGolferApiIds?.includes(
      args.golfer.apiId,
    );

    const cutOrWithdrawn = isPlayerCut(args.golfer.position);

    const emoji = getCountryFlagEmoji(args.golfer.country);
    const flagNode = emoji ? (
      <span
        aria-label={args.golfer.country ?? ""}
        className="block text-4xl leading-none"
      >
        {emoji}
      </span>
    ) : args.golfer.country ? (
      <span className="flex h-full w-full items-center justify-center text-center text-[10px] font-semibold leading-none">
        {args.golfer.country}
      </span>
    ) : null;

    const roundsDisplay = [
      args.golfer.roundOne,
      args.golfer.roundTwo,
      args.golfer.roundThree,
      args.golfer.roundFour,
    ]
      .filter((v): v is number => typeof v === "number")
      .join(" / ");

    const usageDisplay = formatPercentageDisplay(args.golfer.usage);
    const makeCutDisplay = formatPercentageDisplay(args.golfer.makeCut);
    const topTenDisplay = formatPercentageDisplay(args.golfer.topTen);
    const winDisplay = formatPercentageDisplay(args.golfer.win);

    const worldRankDisplay = args.golfer.worldRank
      ? `#${args.golfer.worldRank}`
      : "-";

    const ratingDisplay = args.golfer.rating ?? "-";

    const groupDisplay =
      args.golfer.group === 0 ? "-" : (args.golfer.group ?? "-");

    return {
      isUserTeamGolfer,
      cutOrWithdrawn,
      flagNode,
      roundsDisplay,
      usageDisplay,
      makeCutDisplay,
      topTenDisplay,
      winDisplay,
      worldRankDisplay,
      ratingDisplay,
      groupDisplay,
    };
  }, [args.golfer, args.viewerTeamGolferApiIds]);
}

/**
 * Loading UI for `PGADropdown`.
 */
function PGADropdownSkeleton() {
  return <div className="h-20 w-full rounded-md bg-slate-100" />;
}
