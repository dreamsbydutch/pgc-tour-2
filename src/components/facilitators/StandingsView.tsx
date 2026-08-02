import { ReactNode, useState } from "react";

import { PointsAndPayoutsDetails, ToursToggle } from "@/displays";
import { useStandingsHistory, useStandingsPage } from "@/hooks";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  MemberNameWithBadges,
  Skeleton,
} from "@/ui";
import type { MajorChampionBadgesByMemberId } from "@/types";
import type { ExtendedStandingsTourCard, StandingsViewProps } from "@/types";
import {
  calculateAverageScore,
  cn,
  formatMoney,
  getMemberRowHighlightClass,
  parseRankFromPositionString,
} from "@/utils/app";
import { Loader2, MoveDown, MoveHorizontal, MoveUp, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * Displays the standings screen (tour standings + playoff view) with friend filtering.
 *
 * Data sources:
 * - Convex queries for the selected season (defaults to current), standings dataset, and current member.
 * - `useFriendManagement()` for adding/removing friends.
 *
 * Major render states:
 * - Loading: renders an internal skeleton.
 * - Error: renders a card with retry.
 * - Ready: renders a header, tour toggles (including Playoffs), and the chosen standings view.
 * - Season selection: supports choosing past seasons via `initialSeasonId`/`onSeasonChange`.
 *
 * @param props - `StandingsViewProps`.
 * @returns Standings UI.
 */
export function StandingsView(props: StandingsViewProps) {
  const model = useStandingsView(props);

  if (model.status === "loading") return <StandingsViewSkeleton />;

  if (model.status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Standings unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{model.errorMessage}</p>
          <Button onClick={model.retry}>Retry standings</Button>
        </CardContent>
      </Card>
    );
  }

  const friendsOnlyToggle = (
    <StandingsFriendsOnlyToggle
      pressed={model.friendsOnly}
      disabled={!model.currentMemberId}
      onToggle={() => model.setFriendsOnly(!model.friendsOnly)}
    />
  );

  const renderPositionChange = (posChange: number) => {
    return <StandingsPositionChange posChange={posChange} />;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-yellowtail text-5xl font-bold sm:text-6xl md:text-7xl">
          {model.activeView === "playoffs"
            ? "PGC Playoff Standings"
            : (model.displayedTourName ?? "Standings")}
        </h1>
        <p className="font-varela text-sm text-muted-foreground">
          Click a player to see stats and history
        </p>
        {model.seasonOptions.length ? (
          <div className="mx-auto flex w-fit items-center justify-center gap-2">
            <span className="font-varela text-xs text-muted-foreground">
              Season
            </span>
            <select
              aria-label="Season"
              value={model.activeSeasonId ?? ""}
              onChange={(e) => model.setActiveSeasonId(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {model.seasonOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <ToursToggle
        tours={model.toursForToggle}
        extraToggles={[
          {
            _id: "playoffs",
            shortForm: "Playoffs",
            logoUrl:
              "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPJiXqZRs47Fgtd9BSMeHQ2WnVuLfP8IaTAp6E",
          },
        ]}
        activeTourId={model.activeView}
        onChangeTourId={(next) => model.setActiveView(next)}
      />

      {model.activeView === "playoffs" ? (
        <div className="mx-auto px-1">
          <StandingsTableHeader
            variant="gold"
            friendsOnlyToggle={friendsOnlyToggle}
            playoffDetails={
              model.playoffGold ? (
                <PointsAndPayoutsDetails
                  title="Points & payouts"
                  points={model.playoffGold.points}
                  payouts={model.playoffGold.payouts}
                />
              ) : undefined
            }
          />
          <div className="mt-2 space-y-1">
            {model.playoffGroups.goldTeams.map((tc) => (
              <StandingsListingRow
                key={tc._id}
                card={tc}
                mode="playoff"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
                teamsForPlayoff={model.playoffGroups.goldTeams}
                strokes={model.playoffStrokesGold}
                tourLogoUrl={model.toursById.get(String(tc.tourId))?.logoUrl}
                majorChampionBadgesByMemberId={
                  model.majorChampionBadgesByMemberId
                }
              />
            ))}
          </div>

          <StandingsTableHeader
            variant="silver"
            friendsOnlyToggle={friendsOnlyToggle}
            playoffDetails={
              model.playoffSilver ? (
                <PointsAndPayoutsDetails
                  title="Points & payouts"
                  points={model.playoffSilver.points}
                  payouts={model.playoffSilver.payouts}
                />
              ) : undefined
            }
          />
          <div className="mt-2 space-y-1">
            {model.playoffGroups.silverTeams.map((tc) => (
              <StandingsListingRow
                key={tc._id}
                card={tc}
                mode="playoff"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
                teamsForPlayoff={model.playoffGroups.silverTeams}
                strokes={model.playoffStrokesSilver}
                tourLogoUrl={model.toursById.get(String(tc.tourId))?.logoUrl}
                majorChampionBadgesByMemberId={
                  model.majorChampionBadgesByMemberId
                }
              />
            ))}
          </div>

          <StandingsTableHeader
            variant="bumped"
            friendsOnlyToggle={friendsOnlyToggle}
          />
          <div className="mt-2 space-y-1">
            {model.playoffGroups.bumpedTeams.map((tc) => (
              <StandingsListingRow
                key={tc._id}
                card={tc}
                mode="bumped"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
                tourLogoUrl={model.toursById.get(String(tc.tourId))?.logoUrl}
                majorChampionBadgesByMemberId={
                  model.majorChampionBadgesByMemberId
                }
              />
            ))}
          </div>
        </div>
      ) : model.displayedTourName ? (
        <div className="mx-auto px-1">
          <StandingsTableHeader
            variant="regular"
            friendsOnlyToggle={friendsOnlyToggle}
          />

          <div className="mt-2 space-y-1">
            {model.tourGroups.goldCutCards.map((tc) => (
              <StandingsListingRow
                key={tc._id}
                card={tc}
                mode="regular"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
                majorChampionBadgesByMemberId={
                  model.majorChampionBadgesByMemberId
                }
              />
            ))}
          </div>

          <div className="my-3 rounded-md bg-yellow-100 py-1 text-center font-varela text-2xs font-bold text-yellow-900 xs:text-xs sm:text-sm">
            GOLD PLAYOFF CUT LINE
          </div>

          <div className="space-y-1">
            {model.tourGroups.silverCutCards.map((tc) => (
              <StandingsListingRow
                key={tc._id}
                card={tc}
                mode="regular"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
                majorChampionBadgesByMemberId={
                  model.majorChampionBadgesByMemberId
                }
              />
            ))}
          </div>

          <div className="my-3 rounded-md bg-zinc-200 py-1 text-center font-varela text-2xs font-bold text-zinc-700 xs:text-xs sm:text-sm">
            SILVER PLAYOFF CUT LINE
          </div>

          <div className="space-y-1">
            {model.tourGroups.remainingCards.map((tc) => (
              <StandingsListingRow
                key={tc._id}
                card={tc}
                mode="regular"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
                majorChampionBadgesByMemberId={
                  model.majorChampionBadgesByMemberId
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground">
          Select a tour.
        </div>
      )}
    </div>
  );
}

/**
 * Fetches and shapes the view-model for `StandingsView`.
 *
 * @param props - `StandingsViewProps`.
 * @returns A discriminated union model describing the current render state.
 */
function useStandingsView(props: StandingsViewProps) {
  return useStandingsPage(props);
}

/**
 * Renders a single standings listing row (regular tour standings or playoff standings).
 *
 * Behavior:
 * - Collapsible: clicking the row toggles a details panel with stats + tournament history.
 * - Friends filter: callers provide `friendsOnly` + `friendIds`; non-friends are hidden when enabled.
 * - Friend management (regular only): callers provide `onAddFriend` / `onRemoveFriend` and `isFriendChanging`.
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
  majorChampionBadgesByMemberId: MajorChampionBadgesByMemberId;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const history = useStandingsHistory(props.card._id, isOpen);

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

  const canFriend =
    props.mode === "regular" && !!props.currentMemberId && !isCurrent;

  const teamsForCard = history.items;
  const nonPlayoffTournaments = history.items
    .filter((item) => !item.isPlayoff)
    .map((item) => item.tournament)
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
      aria-expanded={isOpen}
      aria-label={`${isOpen ? "Collapse" : "Expand"} ${props.card.displayName ?? "player"} standings details`}
      onClick={() => setIsOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        setIsOpen((v) => !v);
      }}
      className={cn(
        "grid min-h-11 cursor-pointer grid-flow-row grid-cols-16 rounded-lg py-[1px] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        getMemberRowHighlightClass({
          isCurrent,
          isFriend,
        }),
      )}
    >
      <div className="col-span-2 flex place-self-center font-varela text-sm sm:text-base">
        {positionLabel}
        {props.renderPositionChange(posChange)}
      </div>

      <div
        className={cn(
          "col-span-7 flex items-center justify-center place-self-center font-varela text-lg sm:col-span-5 sm:text-xl",
          props.mode === "playoff" && "min-[550px]:col-span-5",
        )}
      >
        <MemberNameWithBadges
          name={props.card.displayName ?? ""}
          badges={props.majorChampionBadgesByMemberId[memberId]}
        />
      </div>

      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-sm xs:text-base sm:col-span-2 sm:text-lg",
          props.mode === "playoff" && "min-[550px]:col-span-2",
        )}
      >
        {props.card.points}
      </div>

      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-xs xs:text-sm sm:col-span-2 sm:text-base",
          props.mode === "playoff" && "min-[550px]:col-span-2",
        )}
      >
        {props.mode === "playoff"
          ? (startingStrokes ?? "-")
          : formatMoney(props.card.earnings, false)}
      </div>

      {props.mode === "playoff" ? (
        <div className="col-span-2 hidden place-self-center font-varela text-xs min-[550px]:block sm:text-sm">
          {formatMoney(props.card.earnings, false)}
        </div>
      ) : null}

      {props.mode === "playoff" ? (
        <div className="col-span-1 hidden place-self-center font-varela text-xs min-[550px]:block sm:text-sm">
          {props.card.wins ?? 0}
        </div>
      ) : null}

      {props.mode === "playoff" ? (
        <div className="col-span-1 hidden place-self-center font-varela text-xs min-[550px]:block sm:text-sm">
          {props.card.topTen ?? 0}
        </div>
      ) : null}

      {props.mode === "regular" ? (
        <>
          <div className="col-span-1 hidden place-self-center font-varela text-xs sm:block sm:text-sm">
            {props.card.wins ?? 0}
          </div>

          <div className="col-span-1 hidden place-self-center font-varela text-xs sm:block sm:text-sm">
            {props.card.topTen ?? 0}
          </div>

          <div className="col-span-2 hidden place-self-center font-varela text-xs sm:block sm:text-sm">
            {props.card.madeCut ?? 0}/{props.card.appearances ?? 0}
          </div>
        </>
      ) : null}

      <div
        className="col-span-1 flex h-11 w-11 items-center justify-center place-self-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(e) => {
          if (!canFriend) return;
          e.stopPropagation();
          if (isFriendChanging) return;
          if (isFriend) props.onRemoveFriend(memberId);
          else props.onAddFriend(memberId);
        }}
        role={canFriend ? "button" : undefined}
        tabIndex={canFriend ? 0 : -1}
        aria-label={
          canFriend
            ? `${isFriend ? "Remove" : "Add"} ${props.card.displayName ?? "player"} ${isFriend ? "from" : "to"} friends`
            : undefined
        }
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
        {props.mode !== "regular" ? (
          props.tourLogoUrl ? (
            <div className="max-h-8 min-h-6 min-w-6 max-w-8 place-self-center p-1">
              <img
                src={props.tourLogoUrl}
                alt="Tour"
                className="h-6 w-6 object-contain"
              />
            </div>
          ) : (
            <div className="h-6 w-6" />
          )
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
        <div className="col-span-16 pb-2" onClick={(e) => e.stopPropagation()}>
          <div
            className={cn(
              "mt-2 rounded-md border",
              isCurrent && "bg-blue-50",
              !isCurrent && isFriend && "bg-muted/40",
            )}
          >
            <div className="px-3 pt-3">
              <div className="sm:hidden">
                <div className="grid grid-cols-5 gap-2 text-center text-xs font-medium text-muted-foreground">
                  <div>Wins</div>
                  <div>Top 10</div>
                  <div>Cuts</div>
                  <div>Weekday</div>
                  <div>Weekend</div>
                </div>
                <div className="mt-1 grid grid-cols-5 gap-2 text-center text-sm">
                  <div>{props.card.wins ?? 0}</div>
                  <div>{props.card.topTen ?? 0}</div>
                  <div>
                    {props.card.madeCut ?? 0} / {props.card.appearances ?? 0}
                  </div>
                  <div>{calculateAverageScore(teamsForCard, "weekday")}</div>
                  <div>{calculateAverageScore(teamsForCard, "weekend")}</div>
                </div>
              </div>

              <div className="mt-4 text-xs font-medium text-muted-foreground">
                Tournament history
              </div>
            </div>

            {history.isLoading ? (
              <div className="px-3 pb-3 pt-2 text-sm text-muted-foreground">
                Loading tournament history…
              </div>
            ) : nonPlayoffTournaments.length === 0 ? (
              <div className="px-3 pb-3 pt-2 text-sm text-muted-foreground">
                No tournaments
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto border-t">
                <div className="grid sm:hidden" style={mobileGridStyle}>
                  {nonPlayoffTournaments.map((t) => {
                    const isMajor =
                      teamsForCard.find((x) => x.tournamentId === t._id)
                        ?.tierName === "Major";
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
                            variant: undefined,
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
                    const isMajor =
                      teamsForCard.find((x) => x.tournamentId === t._id)
                        ?.tierName === "Major";
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
                            variant: undefined,
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
                {history.canLoadMore ? (
                  <div className="border-t p-2 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={history.loadMore}
                    >
                      Load more
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Toggles the standings "friends only" filter.
 *
 * @param props.pressed - Whether the filter is active.
 * @param props.disabled - Whether the toggle is currently disabled.
 * @param props.onToggle - Called when the user clicks the toggle.
 * @returns A compact star button appropriate for standings headers.
 */
export function StandingsFriendsOnlyToggle(props: {
  pressed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.pressed ? "Show all standings" : "Show friends only"}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onToggle}
      className={cn(
        "mx-auto flex h-11 w-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        props.pressed ? "bg-slate-200" : "bg-transparent",
        props.disabled && "opacity-50",
      )}
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          props.pressed ? "fill-slate-900 text-slate-900" : "text-slate-700",
        )}
      />
    </button>
  );
}
/**
 * Renders a small icon + delta count indicating movement in standings.
 *
 * @param props.posChange - Positive means moved up, negative means moved down.
 * @returns A compact inline indicator suitable for placing next to a rank.
 */
function StandingsPositionChange(props: { posChange: number }) {
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
 * Renders the standings table header row for both regular tours and playoffs.
 *
 * This is presentational-only: it does not read router/auth/data hooks.
 * Callers provide any interactive UI (like the friends-only toggle) via slots.
 *
 * @param props.variant - Controls styling and optional title copy.
 * @param props.friendsOnlyToggle - Slot rendered in the far-right column.
 * @param props.playoffDetails - Optional content shown beneath the playoff title.
 * @returns A responsive grid header matching standings listing rows.
 */
function StandingsTableHeader(props: {
  variant: "regular" | "gold" | "silver" | "bumped";
  friendsOnlyToggle: ReactNode;
  playoffDetails?: ReactNode;
}) {
  const title =
    props.variant === "gold"
      ? "PGC GOLD PLAYOFF"
      : props.variant === "silver"
        ? "PGC SILVER PLAYOFF"
        : props.variant === "bumped"
          ? "KNOCKED OUT"
          : null;

  const wrapperClass =
    props.variant === "gold"
      ? "mt-4 rounded-xl bg-gradient-to-b from-yellow-200"
      : props.variant === "silver"
        ? "mt-12 rounded-xl bg-gradient-to-b from-zinc-300"
        : props.variant === "bumped"
          ? "mt-12 rounded-xl bg-gradient-to-b from-red-200 text-red-900"
          : "";

  const titleTextClass =
    props.variant === "gold"
      ? "text-yellow-900"
      : props.variant === "silver"
        ? "text-zinc-600"
        : props.variant === "bumped"
          ? "text-red-900"
          : "";

  return (
    <div
      className={cn(
        "grid grid-flow-row grid-cols-16 text-center",
        wrapperClass,
        props.variant === "regular" && "text-slate-700",
      )}
    >
      {title && props.variant !== "regular" ? (
        props.playoffDetails &&
        (props.variant === "gold" || props.variant === "silver") ? (
          <details className="col-span-16">
            <summary
              className={cn(
                "col-span-16 my-2 cursor-pointer list-none font-varela text-2xl font-extrabold",
                titleTextClass,
              )}
            >
              {title}
            </summary>
            <div className="mx-auto w-full max-w-xl px-2 pb-3">
              {props.playoffDetails}
            </div>
          </details>
        ) : (
          <div
            className={cn(
              "col-span-16 my-2 font-varela text-2xl font-extrabold",
              titleTextClass,
            )}
          >
            {title}
          </div>
        )
      ) : null}

      <div
        className={cn(
          "col-span-2 place-self-center font-varela text-xs font-bold sm:text-sm",
          props.variant !== "regular" && titleTextClass,
        )}
      >
        Rank
      </div>
      <div
        className={cn(
          "col-span-7 place-self-center font-varela text-base font-bold sm:text-lg",
          props.variant !== "regular" && titleTextClass,
          props.variant === "gold" || props.variant === "silver"
            ? "min-[550px]:col-span-5 sm:col-span-5"
            : "sm:col-span-5",
        )}
      >
        Name
      </div>
      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-xs font-bold xs:text-sm sm:text-base",
          props.variant !== "regular" && titleTextClass,
          props.variant === "gold" || props.variant === "silver"
            ? "min-[550px]:col-span-2 sm:col-span-2"
            : "sm:col-span-2",
        )}
      >
        Cup Points
      </div>
      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-2xs xs:text-xs sm:text-sm",
          props.variant !== "regular" && titleTextClass,
          props.variant === "gold" || props.variant === "silver"
            ? "min-[550px]:col-span-2 sm:col-span-2"
            : "sm:col-span-2",
        )}
      >
        {props.variant === "gold" || props.variant === "silver"
          ? "Starting Strokes"
          : "Earnings"}
      </div>

      {props.variant === "gold" || props.variant === "silver" ? (
        <div
          className={cn(
            "col-span-2 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground min-[550px]:block sm:text-xs",
            titleTextClass,
          )}
        >
          Earnings
        </div>
      ) : null}

      {props.variant === "gold" || props.variant === "silver" ? (
        <div
          className={cn(
            "col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground min-[550px]:block sm:text-xs",
            titleTextClass,
          )}
        >
          Wins
        </div>
      ) : null}

      {props.variant === "gold" || props.variant === "silver" ? (
        <div
          className={cn(
            "col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground min-[550px]:block sm:text-xs",
            titleTextClass,
          )}
        >
          Top 10
        </div>
      ) : null}

      {props.variant === "regular" ? (
        <>
          <div className="col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground sm:block sm:text-xs">
            Wins
          </div>
          <div className="col-span-1 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground sm:block sm:text-xs">
            Top 10
          </div>
          <div className="col-span-2 hidden place-self-center font-varela text-2xs font-bold text-muted-foreground sm:block sm:text-xs">
            Cuts
          </div>
        </>
      ) : null}

      <div className="col-span-1 place-self-center overflow-x-clip">
        {props.friendsOnlyToggle}
      </div>
    </div>
  );
}

/**
 * Loading UI for the standings page.
 *
 * @returns A skeleton layout that matches the main standings page structure.
 */
export function StandingsViewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-56" />
        <Skeleton className="mx-auto h-4 w-72" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
