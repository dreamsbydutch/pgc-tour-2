import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Star } from "lucide-react";

import type {
  ExtendedStandingsTourCard,
  StandingsTeam,
  StandingsTier,
  StandingsTournament,
} from "@/lib";
import {
  calculateAverageScore,
  cn,
  formatMoney,
  includesPlayoff,
  parseRankFromPositionString,
} from "@/lib";

/**
 * Renders a single standings listing row (regular tour standings or playoff standings).
 *
 * Behavior:
 * - Collapsible: clicking the row toggles a details panel with stats + tournament history.
 * - Friends filter: callers provide `friendsOnly` + `friendIds`; non-friends are hidden when enabled.
 * - Friend management: callers provide `onAddFriend` / `onRemoveFriend` and `isFriendChanging`.
 * - Playoff mode: computes position label and starting strokes from the provided playoff groups.
 *
 * Data inputs:
 * - Teams/tournaments/tiers are provided as props; this component does not fetch data.
 *
 * @param props - Listing row inputs and callbacks.
 * @returns A row (or `null` when filtered out).
 */
export function StandingsListingRow(props: {
  card: ExtendedStandingsTourCard;
  mode: "regular" | "playoff" | "bumped";
  teams: StandingsTeam[];
  tournaments: StandingsTournament[];
  tierById: Map<string, StandingsTier>;
  currentMemberId: string | null;
  friendsOnly: boolean;
  friendIds: ReadonlySet<string>;
  isFriendChanging: (memberId: string) => boolean;
  onAddFriend: (memberId: string) => void;
  onRemoveFriend: (memberId: string) => void;
  renderPositionChange: (posChange: number) => ReactNode;
  teamsForPlayoff?: ExtendedStandingsTourCard[];
  strokes?: number[];
  tourLogoUrl?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const isCurrent =
    !!props.currentMemberId &&
    String(props.card.memberId) === props.currentMemberId;

  const memberId = String(props.card.memberId);
  const isFriend = props.friendIds.has(memberId);
  if (props.friendsOnly && !isFriend && !isCurrent) return null;

  const isFriendChanging = props.isFriendChanging(memberId);

  const positionLabel =
    props.mode === "playoff" && props.teamsForPlayoff
      ? (() => {
          const teamsBetterCount = props.teamsForPlayoff.filter(
            (obj) => (obj.points ?? 0) > (props.card.points ?? 0),
          ).length;
          const teamsTiedCount = props.teamsForPlayoff.filter(
            (obj) => (obj.points ?? 0) === (props.card.points ?? 0),
          ).length;
          return (teamsTiedCount > 1 ? "T" : "") + String(teamsBetterCount + 1);
        })()
      : (props.card.currentPosition ?? "-");

  const startingStrokes =
    props.mode === "playoff" && props.teamsForPlayoff && props.strokes
      ? (() => {
          const teamsBetterCount = props.teamsForPlayoff.filter(
            (obj) => (obj.points ?? 0) > (props.card.points ?? 0),
          ).length;
          const teamsTiedCount = props.teamsForPlayoff.filter(
            (obj) => (obj.points ?? 0) === (props.card.points ?? 0),
          ).length;
          const positionIndex = teamsBetterCount;
          if (teamsTiedCount > 1) {
            const slice = props.strokes.slice(
              positionIndex,
              positionIndex + teamsTiedCount,
            );
            const avg =
              slice.reduce((acc, v) => acc + v, 0) / (slice.length || 1);
            return Math.round(avg * 10) / 10;
          }
          return props.strokes[positionIndex];
        })()
      : null;

  const canFriend = !!props.currentMemberId && !isCurrent;

  const teamsForCard = props.teams.filter(
    (t) => t.tourCardId === props.card._id,
  );

  const nonPlayoffTournaments = props.tournaments
    .filter((t) => {
      const tier = props.tierById.get(String(t.tierId));
      return !includesPlayoff(tier?.name);
    })
    .slice()
    .sort((a, b) => a.startDate - b.startDate);

  const count = Math.max(1, nonPlayoffTournaments.length);
  const desktopGridStyle = {
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  } as const;

  const mobileCols = Math.max(1, Math.ceil(count / 2));
  const mobileGridStyle = {
    gridTemplateColumns: `repeat(${mobileCols}, minmax(0, 1fr))`,
    gridTemplateRows: "repeat(2, minmax(0, 1fr))",
  } as const;

  const parseRank = parseRankFromPositionString;
  const posChange =
    props.mode === "playoff"
      ? (props.card.posChangePO ?? 0)
      : (props.card.posChange ?? 0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        setIsOpen((v) => !v);
      }}
      className={cn(
        "grid cursor-pointer grid-flow-row grid-cols-16 rounded-lg py-[1px] text-center",
        isCurrent ? "bg-slate-200 font-semibold" : "",
        !isCurrent && isFriend ? "bg-slate-100" : "",
      )}
    >
      <div className="col-span-2 flex place-self-center font-varela text-sm sm:text-base">
        {positionLabel}
        {props.renderPositionChange(posChange)}
      </div>

      <div className="col-span-7 flex items-center justify-center place-self-center font-varela text-lg sm:text-xl">
        {props.card.displayName}
      </div>

      <div className="col-span-3 place-self-center font-varela text-sm xs:text-base sm:text-lg">
        {props.card.points}
      </div>

      <div className="col-span-3 place-self-center font-varela text-xs xs:text-sm sm:text-base">
        {props.mode === "playoff"
          ? (startingStrokes ?? "-")
          : formatMoney(props.card.earnings)}
      </div>

      <div
        className="col-span-1 flex place-self-center"
        onClick={(e) => {
          if (!canFriend) return;
          e.stopPropagation();
          if (isFriendChanging) return;
          if (isFriend) props.onRemoveFriend(memberId);
          else props.onAddFriend(memberId);
        }}
        role={canFriend ? "button" : undefined}
        tabIndex={canFriend ? 0 : -1}
        onKeyDown={(e) => {
          if (!canFriend) return;
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          if (isFriendChanging) return;
          if (isFriend) props.onRemoveFriend(memberId);
          else props.onAddFriend(memberId);
        }}
      >
        {props.mode === "bumped" && props.tourLogoUrl ? (
          <div className="max-h-8 min-h-6 min-w-6 max-w-8 place-self-center p-1">
            <img
              src={props.tourLogoUrl}
              alt="Tour"
              className="h-6 w-6 object-contain"
            />
          </div>
        ) : !canFriend ? (
          <div className="h-6 w-6" />
        ) : isFriendChanging ? (
          <Loader2 className="m-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Star
            size={12}
            className={cn(
              "m-auto",
              isFriend ? "fill-slate-900 text-slate-900" : "text-slate-700",
            )}
          />
        )}
      </div>

      {isOpen ? (
        <div
          className="col-span-16 px-2 pb-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={cn(
              "mt-2 rounded-md border p-3",
              isCurrent && "bg-blue-50",
              !isCurrent && isFriend && "bg-muted/40",
            )}
          >
            <div className="grid grid-cols-5 gap-2 text-center text-xs font-medium text-muted-foreground">
              <div>Wins</div>
              <div>Top 10</div>
              <div>Cuts</div>
              <div>Weekday</div>
              <div>Weekend</div>
            </div>
            <div className="mt-1 grid grid-cols-5 gap-2 text-center text-sm">
              <div>{props.card.wins ?? 0}</div>
              <div>{props.card.topTen}</div>
              <div>
                {props.card.madeCut} / {props.card.appearances}
              </div>
              <div>{calculateAverageScore(teamsForCard, "weekday")}</div>
              <div>{calculateAverageScore(teamsForCard, "weekend")}</div>
            </div>

            <div className="mt-4 text-xs font-medium text-muted-foreground">
              Tournament history
            </div>

            {nonPlayoffTournaments.length === 0 ? (
              <div className="mt-2 text-sm text-muted-foreground">
                No tournaments
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-md border">
                <div className="grid sm:hidden" style={mobileGridStyle}>
                  {nonPlayoffTournaments.map((t) => {
                    const tier = props.tierById.get(String(t.tierId));
                    const isMajor = tier?.name === "Major";
                    const team = teamsForCard.find(
                      (x) => x.tournamentId === t._id,
                    );
                    const isPastEvent = t.endDate < Date.now();
                    const didNotMakeCut = team?.position === "CUT";
                    const didNotPlay = !team && isPastEvent;
                    const numericFinish = team?.position
                      ? parseRank(team.position)
                      : Number.POSITIVE_INFINITY;
                    const isWinner = numericFinish === 1;

                    return (
                      <div
                        key={t._id}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1 border-r border-dashed p-2 text-center text-xs",
                          isMajor && "bg-yellow-50",
                          didNotPlay && "opacity-40",
                          didNotMakeCut && "opacity-60",
                          isWinner && "font-semibold",
                        )}
                      >
                        <Link
                          to="/tournament"
                          search={{
                            tournamentId: t._id,
                            tourId: props.card.tourId,
                            variant: null,
                          }}
                          className="flex flex-col items-center gap-1"
                        >
                          {t.logoUrl ? (
                            <img
                              src={t.logoUrl}
                              alt={t.name}
                              className="h-8 w-8 object-contain"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted" />
                          )}
                          <div
                            className={cn(
                              "whitespace-nowrap",
                              didNotPlay && "text-red-700",
                              didNotMakeCut && "text-muted-foreground",
                              isWinner && "text-yellow-700",
                            )}
                          >
                            {!isPastEvent
                              ? "-"
                              : !team
                                ? "DNP"
                                : team.position === "CUT"
                                  ? "CUT"
                                  : team.position}
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden sm:grid" style={desktopGridStyle}>
                  {nonPlayoffTournaments.map((t) => {
                    const tier = props.tierById.get(String(t.tierId));
                    const isMajor = tier?.name === "Major";
                    const team = teamsForCard.find(
                      (x) => x.tournamentId === t._id,
                    );
                    const isPastEvent = t.endDate < Date.now();
                    const didNotMakeCut = team?.position === "CUT";
                    const didNotPlay = !team && isPastEvent;
                    const numericFinish = team?.position
                      ? parseRank(team.position)
                      : Number.POSITIVE_INFINITY;
                    const isWinner = numericFinish === 1;

                    return (
                      <div
                        key={t._id}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1 border-r border-dashed p-2 text-center text-xs",
                          isMajor && "bg-yellow-50",
                          didNotPlay && "opacity-40",
                          didNotMakeCut && "opacity-60",
                          isWinner && "font-semibold",
                        )}
                      >
                        <Link
                          to="/tournament"
                          search={{
                            tournamentId: t._id,
                            tourId: props.card.tourId,
                            variant: null,
                          }}
                          className="flex flex-col items-center gap-1"
                        >
                          {t.logoUrl ? (
                            <img
                              src={t.logoUrl}
                              alt={t.name}
                              className="h-8 w-8 object-contain"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted" />
                          )}
                          <div
                            className={cn(
                              "whitespace-nowrap",
                              didNotPlay && "text-red-700",
                              didNotMakeCut && "text-muted-foreground",
                              isWinner && "text-yellow-700",
                            )}
                          >
                            {!isPastEvent
                              ? "-"
                              : !team
                                ? "DNP"
                                : team.position === "CUT"
                                  ? "CUT"
                                  : team.position}
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
