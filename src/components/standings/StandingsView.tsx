import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Loader2, MoveDown, MoveHorizontal, MoveUp, Star } from "lucide-react";

import { Card, CardContent, CardHeader, Skeleton } from "@/ui";
import { api, useQuery } from "@/convex";
import type { Doc, Id } from "@/convex";
import { useFriendManagement } from "@/hooks";
import {
  cn,
  formatMoney,
  parseRankFromPositionString,
  Team,
  Tier,
  Tour,
  TourCard,
  Tournament,
} from "@/lib";

type StandingsViewProps = {
  initialSeasonId?: Id<"seasons">;
  initialTourId?: Id<"tours"> | "playoffs";
  onSeasonChange?: (seasonId: Id<"seasons">) => void;
  onTourChange?: (tourId: Id<"tours"> | "playoffs") => void;
};

type StandingsMember = Doc<"members">;

type ExtendedStandingsTourCard = TourCard & {
  standingsPosition: string;
  isFriend: boolean;
  posChange: number;
  posChangePO: number;
};

type StandingsViewModel =
  | { status: "loading" }
  | { status: "error"; errorMessage: string }
  | {
      status: "ready";
      selectedSeasonId: Id<"seasons">;
      activeSeasonId: string;
      setActiveSeasonId: (nextSeasonId: string) => void;
      seasonOptions: Array<{ id: string; label: string }>;
      activeView: string;
      setActiveView: (nextView: string) => void;
      displayedTitle: string;
      toggles: Array<{
        _id: string;
        shortForm: string;
        logoUrl?: string | null;
      }>;
      areToursLoading: boolean;
      areCardsLoading: boolean;
      isPlayoffMetaLoading: boolean;
      currentMemberId: string | null;
      friendsOnly: boolean;
      setFriendsOnly: (next: boolean) => void;
      friendIds: Set<string>;
      isFriendChanging: (memberId: string) => boolean;
      onAddFriend: (memberId: string) => void;
      onRemoveFriend: (memberId: string) => void;
      regularGroups: {
        goldCutCards: ExtendedStandingsTourCard[];
        silverCutCards: ExtendedStandingsTourCard[];
        remainingCards: ExtendedStandingsTourCard[];
      };
      playoffGroups: {
        goldTeams: ExtendedStandingsTourCard[];
        silverTeams: ExtendedStandingsTourCard[];
        bumpedTeams: ExtendedStandingsTourCard[];
      };
      playoffGold: { points: number[]; payouts: number[] } | null;
      playoffSilver: { points: number[]; payouts: number[] } | null;
      playoffGoldStrokes: Map<string, number>;
      playoffSilverStrokes: Map<string, number>;
      toursById: Map<string, Tour>;
    };

const PLAYOFF_TOGGLE = {
  _id: "playoffs",
  shortForm: "Playoffs",
  logoUrl:
    "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPJiXqZRs47Fgtd9BSMeHQ2WnVuLfP8IaTAp6E",
} as const;

/**
 * Displays a lazy-loaded standings page.
 *
 * Top-level behavior:
 * - Resolves the selected season and tour.
 * - Fetches only the tour-card list needed for the active standings view.
 * - Defers tournament history and per-card team details until a row is expanded.
 * - Keeps friend filtering and friend management on the page.
 *
 * @param props Selected season/tour state and route callbacks.
 * @returns The standings page UI.
 */
export function StandingsView(props: StandingsViewProps) {
  const model = useStandingsViewModel(props);

  if (model.status === "loading") {
    return <StandingsViewSkeleton />;
  }

  if (model.status === "error") {
    return (
      <Card>
        <CardHeader>
          <div className="font-varela text-lg font-semibold">
            Standings unavailable
          </div>
        </CardHeader>
        <CardContent>
          <div className="font-varela text-sm text-muted-foreground">
            {model.errorMessage}
          </div>
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

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="font-yellowtail text-5xl font-bold sm:text-6xl md:text-7xl">
          {model.displayedTitle}
        </h1>
        <p className="font-varela text-sm text-muted-foreground">
          Click a player to load stats and history
        </p>
        {model.seasonOptions.length > 0 ? (
          <div className="mx-auto flex w-fit items-center justify-center gap-2">
            <span className="font-varela text-xs text-muted-foreground">
              Season
            </span>
            <select
              aria-label="Season"
              value={model.activeSeasonId}
              onChange={(event) => model.setActiveSeasonId(event.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {model.seasonOptions.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <StandingsTourTabs
        toggles={model.toggles}
        activeTourId={model.activeView}
        isLoading={model.areToursLoading}
        onChangeTourId={model.setActiveView}
      />

      {model.areCardsLoading ? (
        <StandingsRowsSkeleton />
      ) : model.activeView === "playoffs" ? (
        <div className="space-y-10 px-1">
          <StandingsSection
            variant="gold"
            friendsOnlyToggle={friendsOnlyToggle}
            playoffDetails={
              model.isPlayoffMetaLoading ? (
                <StandingsPlayoffDetailsSkeleton />
              ) : model.playoffGold ? (
                <PointsAndPayoutsDetails
                  title="Points & payouts"
                  points={model.playoffGold.points}
                  payouts={model.playoffGold.payouts}
                />
              ) : undefined
            }
            rows={model.playoffGroups.goldTeams}
            emptyMessage="No Gold playoff qualifiers yet."
            renderRow={(card) => (
              <StandingsListingRow
                key={card._id}
                card={card}
                seasonId={model.selectedSeasonId}
                mode="playoff"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                positionLabel={card.standingsPosition}
                positionChange={card.posChangePO}
                startingStrokes={
                  model.playoffGoldStrokes.get(String(card._id)) ?? null
                }
                tourLogoUrl={model.toursById.get(String(card.tourId))?.logoUrl}
              />
            )}
          />

          <StandingsSection
            variant="silver"
            friendsOnlyToggle={friendsOnlyToggle}
            playoffDetails={
              model.isPlayoffMetaLoading ? (
                <StandingsPlayoffDetailsSkeleton />
              ) : model.playoffSilver ? (
                <PointsAndPayoutsDetails
                  title="Points & payouts"
                  points={model.playoffSilver.points}
                  payouts={model.playoffSilver.payouts}
                />
              ) : undefined
            }
            rows={model.playoffGroups.silverTeams}
            emptyMessage="No Silver playoff qualifiers yet."
            renderRow={(card) => (
              <StandingsListingRow
                key={card._id}
                card={card}
                seasonId={model.selectedSeasonId}
                mode="playoff"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                positionLabel={card.standingsPosition}
                positionChange={card.posChangePO}
                startingStrokes={
                  model.playoffSilverStrokes.get(String(card._id)) ?? null
                }
                tourLogoUrl={model.toursById.get(String(card.tourId))?.logoUrl}
              />
            )}
          />

          <StandingsSection
            variant="bumped"
            friendsOnlyToggle={friendsOnlyToggle}
            rows={model.playoffGroups.bumpedTeams}
            emptyMessage="No knocked-out teams in this view."
            renderRow={(card) => (
              <StandingsListingRow
                key={card._id}
                card={card}
                seasonId={model.selectedSeasonId}
                mode="bumped"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                positionLabel={card.standingsPosition}
                positionChange={card.posChangePO}
                tourLogoUrl={model.toursById.get(String(card.tourId))?.logoUrl}
              />
            )}
          />
        </div>
      ) : (
        <div className="space-y-3 px-1">
          <StandingsSection
            variant="regular"
            friendsOnlyToggle={friendsOnlyToggle}
            rows={model.regularGroups.goldCutCards}
            emptyMessage="No standings available for this tour yet."
            renderRow={(card) => (
              <StandingsListingRow
                key={card._id}
                card={card}
                seasonId={model.selectedSeasonId}
                mode="regular"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                positionLabel={card.standingsPosition}
                positionChange={card.posChange}
              />
            )}
          />

          <StandingsCutLine label="GOLD PLAYOFF CUT LINE" tone="gold" />

          <StandingsRowList
            rows={model.regularGroups.silverCutCards}
            emptyMessage="No Silver cutoff players in this view."
            renderRow={(card) => (
              <StandingsListingRow
                key={card._id}
                card={card}
                seasonId={model.selectedSeasonId}
                mode="regular"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                positionLabel={card.standingsPosition}
                positionChange={card.posChange}
              />
            )}
          />

          <StandingsCutLine label="SILVER PLAYOFF CUT LINE" tone="silver" />

          <StandingsRowList
            rows={model.regularGroups.remainingCards}
            emptyMessage="No remaining players in this view."
            renderRow={(card) => (
              <StandingsListingRow
                key={card._id}
                card={card}
                seasonId={model.selectedSeasonId}
                mode="regular"
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                positionLabel={card.standingsPosition}
                positionChange={card.posChange}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Builds the lazy standings page model.
 *
 * @param props Selected season/tour state and route callbacks.
 * @returns The current render model for the standings page.
 */
function useStandingsViewModel(props: StandingsViewProps): StandingsViewModel {
  const { user } = useUser();
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [activeView, setActiveViewState] = useState<string>(
    props.initialTourId ?? "",
  );

  const currentSeason = useQuery(
    api.functions.seasons.getCurrentSeason,
    props.initialSeasonId ? "skip" : {},
  );
  const seasons = useQuery(api.functions.seasons.getSeasons, {
    options: {
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const selectedSeasonId = props.initialSeasonId ?? currentSeason?._id ?? null;

  const tours = useQuery(
    api.functions.tours.getTours,
    selectedSeasonId
      ? { options: { filter: { seasonId: selectedSeasonId } } }
      : "skip",
  ) as Tour[] | undefined;

  const activeTourId = useMemo(() => {
    if (activeView === "playoffs") {
      return "playoffs";
    }

    if (!tours?.length) {
      return activeView;
    }

    const hasActiveTour = tours.some((tour) => String(tour._id) === activeView);
    if (hasActiveTour) {
      return activeView;
    }

    return String(tours[0]?._id ?? "");
  }, [activeView, tours]);

  const tourCards = useQuery(
    api.functions.tourCards.getTourCards,
    selectedSeasonId && activeTourId
      ? {
          options: {
            seasonId: selectedSeasonId,
            ...(activeTourId === "playoffs"
              ? {}
              : { tourId: activeTourId as Id<"tours"> }),
          },
        }
      : "skip",
  ) as TourCard[] | undefined;

  const currentMember = useQuery(
    api.functions.members.getMembers,
    user?.id ? { options: { clerkId: user.id } } : "skip",
  ) as StandingsMember | null | undefined;

  const playoffTiers = useQuery(
    api.functions.tiers.getTiers,
    selectedSeasonId && activeTourId === "playoffs"
      ? { options: { filter: { seasonId: selectedSeasonId } } }
      : "skip",
  ) as Tier[] | undefined;

  useEffect(() => {
    if (props.initialTourId) {
      setActiveViewState(props.initialTourId);
    }
  }, [props.initialTourId]);

  useEffect(() => {
    if (!tours?.length) {
      return;
    }

    if (activeView === "playoffs") {
      return;
    }

    const hasActiveTour = tours.some((tour) => String(tour._id) === activeView);
    if (hasActiveTour) {
      return;
    }

    setActiveViewState(String(tours[0]!._id));
  }, [activeView, tours]);

  const currentMemberValue = currentMember ?? null;
  const friendManagement = useFriendManagement(currentMemberValue);

  const seasonOptions = useMemo(() => {
    if (!seasons) {
      return [];
    }

    return seasons.map((season) => ({
      id: String(season._id),
      label: String(season.year),
    }));
  }, [seasons]);

  const toggles = useMemo(() => {
    const base = (tours ?? []).map((tour) => ({
      _id: String(tour._id),
      shortForm: tour.shortForm,
      logoUrl: tour.logoUrl,
    }));

    const hasPlayoffSpots = (tours ?? []).some((tour) =>
      Array.isArray(tour.playoffSpots)
        ? tour.playoffSpots.reduce((total, value) => total + value, 0) > 0
        : false,
    );

    return hasPlayoffSpots ? [...base, PLAYOFF_TOGGLE] : base;
  }, [tours]);

  const currentMemberId = currentMemberValue
    ? String(currentMemberValue._id)
    : null;
  const friendIds = useMemo(() => {
    const ids = new Set<string>();
    (currentMemberValue?.friends ?? []).forEach((friendId) => {
      ids.add(String(friendId));
    });
    return ids;
  }, [currentMemberValue?.friends]);

  const extendedCards = useMemo(() => {
    if (!tourCards) {
      return [];
    }

    return computeStandingsPositions(
      tourCards.map((card) => ({
        ...card,
        isFriend: friendIds.has(String(card.memberId)),
        posChange: 0,
        posChangePO: 0,
        standingsPosition: "-",
      })),
    );
  }, [friendIds, tourCards]);

  const toursById = useMemo(() => {
    const map = new Map<string, Tour>();
    (tours ?? []).forEach((tour) => {
      map.set(String(tour._id), tour);
    });
    return map;
  }, [tours]);

  const activeTour =
    activeTourId && activeTourId !== "playoffs"
      ? (toursById.get(activeTourId) ?? null)
      : null;

  const regularGroups = useMemo(() => {
    if (!activeTour) {
      return {
        goldCutCards: [],
        silverCutCards: [],
        remainingCards: extendedCards,
      };
    }

    const goldCount = activeTour.playoffSpots[0] ?? 0;
    const silverCount = activeTour.playoffSpots[1] ?? 0;

    return {
      goldCutCards: extendedCards.slice(0, goldCount),
      silverCutCards: extendedCards.slice(goldCount, goldCount + silverCount),
      remainingCards: extendedCards.slice(goldCount + silverCount),
    };
  }, [activeTour, extendedCards]);

  const playoffGroups = useMemo(() => {
    if (activeTourId !== "playoffs") {
      return {
        goldTeams: [],
        silverTeams: [],
        bumpedTeams: [],
      };
    }

    const goldTeams: ExtendedStandingsTourCard[] = [];
    const silverTeams: ExtendedStandingsTourCard[] = [];
    const bumpedTeams: ExtendedStandingsTourCard[] = [];

    for (const tour of tours ?? []) {
      const cardsInTour = computeStandingsPositions(
        extendedCards.filter(
          (card) => String(card.tourId) === String(tour._id),
        ),
      );
      const goldCount = tour.playoffSpots[0] ?? 0;
      const silverCount = tour.playoffSpots[1] ?? 0;

      goldTeams.push(...cardsInTour.slice(0, goldCount));
      silverTeams.push(
        ...cardsInTour.slice(goldCount, goldCount + silverCount),
      );
      bumpedTeams.push(...cardsInTour.slice(goldCount + silverCount));
    }

    return {
      goldTeams: computeStandingsPositions(goldTeams),
      silverTeams: computeStandingsPositions(silverTeams),
      bumpedTeams: computeStandingsPositions(bumpedTeams),
    };
  }, [activeTourId, extendedCards, tours]);

  const playoffTier = useMemo(() => {
    return (
      (playoffTiers ?? []).find(
        (tier) => tier.name.toLowerCase() === "playoff",
      ) ?? null
    );
  }, [playoffTiers]);

  const playoffGold = useMemo(() => {
    if (!playoffTier) {
      return null;
    }

    return {
      points: playoffTier.points.slice(0, playoffGroups.goldTeams.length),
      payouts: playoffTier.payouts.slice(0, playoffGroups.goldTeams.length),
    };
  }, [playoffGroups.goldTeams.length, playoffTier]);

  const playoffSilver = useMemo(() => {
    if (!playoffTier) {
      return null;
    }

    return {
      points: playoffTier.points.slice(0, playoffGroups.silverTeams.length),
      payouts: playoffTier.payouts.slice(
        75,
        75 + playoffGroups.silverTeams.length,
      ),
    };
  }, [playoffGroups.silverTeams.length, playoffTier]);

  const playoffGoldStrokes = useMemo(
    () => buildStartingStrokes(playoffGroups.goldTeams),
    [playoffGroups.goldTeams],
  );
  const playoffSilverStrokes = useMemo(
    () => buildStartingStrokes(playoffGroups.silverTeams),
    [playoffGroups.silverTeams],
  );

  const isLoadingSelectedSeason =
    !props.initialSeasonId && currentSeason === undefined;
  const isMissingSelectedSeason = !selectedSeasonId;
  const areToursLoading = Boolean(selectedSeasonId) && tours === undefined;
  const areCardsLoading =
    Boolean(selectedSeasonId && activeTourId) && tourCards === undefined;
  const isPlayoffMetaLoading =
    activeTourId === "playoffs" && playoffTiers === undefined;

  if (isLoadingSelectedSeason || seasons === undefined) {
    return { status: "loading" };
  }

  if (isMissingSelectedSeason) {
    return {
      status: "error",
      errorMessage: "No active season found.",
    };
  }

  if (!areToursLoading && (!tours || tours.length === 0)) {
    return {
      status: "error",
      errorMessage: "No tours found for this season.",
    };
  }

  const displayedTitle =
    activeTourId === "playoffs"
      ? "PGC Playoff Standings"
      : (activeTour?.name ?? "PGC Standings");

  return {
    status: "ready",
    selectedSeasonId,
    activeSeasonId: String(selectedSeasonId),
    setActiveSeasonId: (nextSeasonId: string) => {
      props.onSeasonChange?.(nextSeasonId as Id<"seasons">);
    },
    seasonOptions,
    activeView: activeTourId,
    setActiveView: (nextView: string) => {
      setActiveViewState(nextView);
      props.onTourChange?.(nextView as Id<"tours"> | "playoffs");
    },
    displayedTitle,
    toggles,
    areToursLoading,
    areCardsLoading,
    isPlayoffMetaLoading,
    currentMemberId,
    friendsOnly,
    setFriendsOnly,
    friendIds,
    isFriendChanging: (memberId: string) =>
      friendManagement.state.friendChangingIds.has(memberId),
    onAddFriend: (memberId: string) => {
      void friendManagement.actions.addFriend(memberId);
    },
    onRemoveFriend: (memberId: string) => {
      void friendManagement.actions.removeFriend(memberId);
    },
    regularGroups,
    playoffGroups,
    playoffGold,
    playoffSilver,
    playoffGoldStrokes,
    playoffSilverStrokes,
    toursById,
  };
}

/**
 * Renders one expandable standings row and lazily loads its detail panel.
 *
 * @param props Row identity, friend actions, and presentation settings.
 * @returns A standings row with on-demand details.
 */
function StandingsListingRow(props: {
  card: ExtendedStandingsTourCard;
  seasonId: Id<"seasons">;
  mode: "regular" | "playoff" | "bumped";
  currentMemberId: string | null;
  friendsOnly: boolean;
  friendIds: ReadonlySet<string>;
  isFriendChanging: (memberId: string) => boolean;
  onAddFriend: (memberId: string) => void;
  onRemoveFriend: (memberId: string) => void;
  positionLabel: string;
  positionChange: number;
  startingStrokes?: number | null;
  tourLogoUrl?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const details = useStandingsRowDetails({
    open: isOpen,
    seasonId: props.seasonId,
    tourCardId: props.card._id,
  });

  const memberId = String(props.card.memberId);
  const isCurrent = Boolean(
    props.currentMemberId && props.currentMemberId === memberId,
  );
  const isFriend = props.friendIds.has(memberId);

  if (props.friendsOnly && !isCurrent && !isFriend) {
    return null;
  }

  const canFriend =
    props.mode === "regular" && Boolean(props.currentMemberId) && !isCurrent;
  const isFriendChanging = props.isFriendChanging(memberId);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsOpen((value) => !value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        setIsOpen((value) => !value);
      }}
      className={cn(
        "grid grid-cols-16 rounded-lg py-[1px] text-center",
        "cursor-pointer transition-colors",
        isCurrent && "bg-slate-200 font-semibold",
        !isCurrent && isFriend && "bg-slate-100",
      )}
    >
      <div className="col-span-2 flex place-self-center font-varela text-sm sm:text-base">
        {props.positionLabel}
        <StandingsPositionChange posChange={props.positionChange} />
      </div>

      <div
        className={cn(
          "col-span-7 flex items-center justify-center place-self-center font-varela text-lg sm:col-span-5 sm:text-xl",
          props.mode === "playoff" && "min-[550px]:col-span-5",
        )}
      >
        {getCardDisplayName(props.card)}
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
          ? (props.startingStrokes ?? "-")
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
        className="col-span-1 flex place-self-center"
        onClick={(event) => {
          if (!canFriend) {
            return;
          }

          event.stopPropagation();
          if (isFriendChanging) {
            return;
          }

          if (isFriend) {
            props.onRemoveFriend(memberId);
            return;
          }

          props.onAddFriend(memberId);
        }}
        role={canFriend ? "button" : undefined}
        tabIndex={canFriend ? 0 : -1}
        onKeyDown={(event) => {
          if (!canFriend) {
            return;
          }

          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          if (isFriendChanging) {
            return;
          }

          if (isFriend) {
            props.onRemoveFriend(memberId);
            return;
          }

          props.onAddFriend(memberId);
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
        <div
          className="col-span-16 pb-2"
          onClick={(event) => event.stopPropagation()}
        >
          {details.status === "loading" ? (
            <StandingsRowDetailsSkeleton
              isCurrent={isCurrent}
              isFriend={isFriend}
            />
          ) : (
            <StandingsRowDetails
              card={props.card}
              details={details}
              isCurrent={isCurrent}
              isFriend={isFriend}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Loads row detail data only after a row has been expanded.
 *
 * @param props Controls when queries start and which card/season to load.
 * @returns The detail model for a single row.
 */
function useStandingsRowDetails(props: {
  open: boolean;
  seasonId: Id<"seasons">;
  tourCardId: Id<"tourCards">;
}) {
  const teams = useQuery(
    api.functions.teams.getTeams,
    props.open
      ? {
          options: {
            filter: {
              seasonId: props.seasonId,
              tourCardId: props.tourCardId,
            },
          },
        }
      : "skip",
  ) as Team[] | undefined;

  const tournaments = useQuery(
    api.functions.tournaments.getTournaments,
    props.open
      ? {
          options: {
            filter: { seasonId: props.seasonId },
            sort: { sortBy: "startDate", sortOrder: "asc" },
          },
        }
      : "skip",
  ) as Tournament[] | undefined;

  if (!props.open || teams === undefined || tournaments === undefined) {
    return { status: "loading" as const };
  }

  const nonPlayoffTournaments = tournaments.filter(
    (tournament) => !tournament.tier.name.toLowerCase().includes("playoff"),
  );

  return {
    status: "ready" as const,
    teams,
    tournaments: nonPlayoffTournaments,
    weekdayAverage: calculateAverageScore(teams, "weekday"),
    weekendAverage: calculateAverageScore(teams, "weekend"),
  };
}

/**
 * Renders the lazily loaded row detail panel.
 *
 * @param props Card metadata, loaded detail data, and row highlight state.
 * @returns Tournament history and aggregate scoring stats for one card.
 */
function StandingsRowDetails(props: {
  card: ExtendedStandingsTourCard;
  details: {
    status: "ready";
    teams: Team[];
    tournaments: Tournament[];
    weekdayAverage: string;
    weekendAverage: string;
  };
  isCurrent: boolean;
  isFriend: boolean;
}) {
  const desktopGridStyle = {
    gridTemplateColumns: `repeat(${Math.max(1, props.details.tournaments.length)}, minmax(0, 1fr))`,
  } as const;
  const mobileGridStyle = {
    gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(props.details.tournaments.length / 2))}, minmax(0, 1fr))`,
    gridTemplateRows: "repeat(2, minmax(0, 1fr))",
  } as const;

  return (
    <div
      className={cn(
        "mt-2 rounded-md border",
        props.isCurrent && "bg-blue-50",
        !props.isCurrent && props.isFriend && "bg-muted/40",
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
            <div>{props.details.weekdayAverage}</div>
            <div>{props.details.weekendAverage}</div>
          </div>
        </div>

        <div className="mt-4 text-xs font-medium text-muted-foreground">
          Tournament history
        </div>
      </div>

      {props.details.tournaments.length === 0 ? (
        <div className="px-3 pb-3 pt-2 text-sm text-muted-foreground">
          No tournaments
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto border-t">
          <div className="grid sm:hidden" style={mobileGridStyle}>
            {props.details.tournaments.map((tournament) => (
              <StandingsTournamentCell
                key={tournament._id}
                tournament={tournament}
                team={
                  props.details.teams.find(
                    (team) => team.tournamentId === tournament._id,
                  ) ?? null
                }
                tourId={props.card.tourId}
              />
            ))}
          </div>

          <div className="hidden sm:grid" style={desktopGridStyle}>
            {props.details.tournaments.map((tournament) => (
              <StandingsTournamentCell
                key={tournament._id}
                tournament={tournament}
                team={
                  props.details.teams.find(
                    (team) => team.tournamentId === tournament._id,
                  ) ?? null
                }
                tourId={props.card.tourId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renders one tournament result cell inside a row detail grid.
 *
 * @param props Tournament metadata, the matching team result, and the tour id for deep links.
 * @returns One tournament history tile.
 */
function StandingsTournamentCell(props: {
  tournament: Tournament;
  team: Team | null;
  tourId: Id<"tours">;
}) {
  const isMajor = props.tournament.tier.name === "Major";
  const isPastEvent = props.tournament.endDate < Date.now();
  const didNotMakeCut = props.team?.position === "CUT";
  const didNotPlay = !props.team && isPastEvent;
  const numericFinish = props.team?.position
    ? parseRankFromPositionString(props.team.position)
    : Number.POSITIVE_INFINITY;
  const isWinner = numericFinish === 1;

  return (
    <div
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
          tournamentId: props.tournament._id,
          tourId: props.tourId,
        }}
        className="flex flex-col items-center gap-1"
      >
        {props.tournament.logoUrl ? (
          <img
            src={props.tournament.logoUrl}
            alt={props.tournament.name}
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
            : !props.team
              ? "DNP"
              : props.team.position === "CUT"
                ? "CUT"
                : props.team.position}
        </div>
      </Link>
    </div>
  );
}

/**
 * Renders the friends-only toggle button.
 *
 * @param props Toggle pressed state and handler.
 * @returns A compact standings filter control.
 */
function StandingsFriendsOnlyToggle(props: {
  pressed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onToggle}
      className={cn(
        "mx-auto flex h-6 w-6 items-center justify-center rounded-md",
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
 * Renders a position change indicator next to a standings rank.
 *
 * @param props.posChange Positive values move up; negative values move down.
 * @returns A compact movement indicator.
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
 * Renders the standings page tour tabs without fetching additional data.
 *
 * @param props Toggle options, loading state, selected value, and change handler.
 * @returns Tour toggle buttons or a skeleton row.
 */
function StandingsTourTabs(props: {
  toggles: Array<{ _id: string; shortForm: string; logoUrl?: string | null }>;
  activeTourId: string;
  isLoading: boolean;
  onChangeTourId: (tourId: string) => void;
}) {
  if (props.isLoading) {
    return (
      <div className="mx-auto my-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "flex h-9 items-center gap-2 rounded-md border border-input px-3",
              index === 0 ? "w-20" : index % 3 === 0 ? "w-28" : "w-24",
            )}
          >
            <Skeleton className="h-5 w-5 rounded-sm" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (props.toggles.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto my-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
      {props.toggles.map((tour) => {
        const isActive = tour._id === props.activeTourId;
        return (
          <button
            key={tour._id}
            type="button"
            onClick={() => props.onChangeTourId(tour._id)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-md border px-3 transition-colors",
              isActive
                ? "border-slate-900 bg-slate-900 text-white shadow"
                : "border-input bg-background text-foreground hover:bg-muted",
            )}
          >
            {tour.logoUrl ? (
              <img
                src={tour.logoUrl}
                alt={tour.shortForm}
                className={cn(
                  "h-5 w-5 rounded-sm object-contain",
                  isActive &&
                    tour.shortForm !== "PGA" &&
                    tour.shortForm !== "Gold" &&
                    tour.shortForm !== "Silver" &&
                    "invert",
                )}
              />
            ) : null}
            <span className="font-varela text-xs sm:text-sm">
              {tour.shortForm}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Renders one standings section with a shared header and row list.
 *
 * @param props Section header config, rows, and row renderer.
 * @returns A standings section block.
 */
function StandingsSection(props: {
  variant: "regular" | "gold" | "silver" | "bumped";
  friendsOnlyToggle: ReactNode;
  playoffDetails?: ReactNode;
  rows: ExtendedStandingsTourCard[];
  emptyMessage: string;
  renderRow: (card: ExtendedStandingsTourCard) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      <StandingsTableHeader
        variant={props.variant}
        friendsOnlyToggle={props.friendsOnlyToggle}
        playoffDetails={props.playoffDetails}
      />
      <StandingsRowList
        rows={props.rows}
        emptyMessage={props.emptyMessage}
        renderRow={props.renderRow}
      />
    </div>
  );
}

/**
 * Renders a simple standings row list with an empty state.
 *
 * @param props Rows and their render function.
 * @returns A stack of rendered rows or an empty message.
 */
function StandingsRowList(props: {
  rows: ExtendedStandingsTourCard[];
  emptyMessage: string;
  renderRow: (card: ExtendedStandingsTourCard) => ReactNode;
}) {
  if (props.rows.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground">
        {props.emptyMessage}
      </div>
    );
  }

  return <div className="space-y-1">{props.rows.map(props.renderRow)}</div>;
}

/**
 * Renders the common standings header row for regular and playoff sections.
 *
 * @param props Header variant, friend toggle slot, and optional playoff details.
 * @returns The section header layout.
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
      ? "rounded-xl bg-gradient-to-b from-yellow-200"
      : props.variant === "silver"
        ? "rounded-xl bg-gradient-to-b from-zinc-300"
        : props.variant === "bumped"
          ? "rounded-xl bg-gradient-to-b from-red-200 text-red-900"
          : "";

  const titleTextClass =
    props.variant === "gold"
      ? "text-yellow-900"
      : props.variant === "silver"
        ? "text-zinc-700"
        : props.variant === "bumped"
          ? "text-red-900"
          : "";

  return (
    <div
      className={cn(
        "grid grid-cols-16 text-center",
        wrapperClass,
        props.variant === "regular" && "text-slate-700",
      )}
    >
      {title ? (
        props.playoffDetails &&
        (props.variant === "gold" || props.variant === "silver") ? (
          <details className="col-span-16">
            <summary
              className={cn(
                "my-2 cursor-pointer list-none font-varela text-2xl font-extrabold",
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
          "col-span-7 place-self-center font-varela text-base font-bold sm:col-span-5 sm:text-lg",
          props.variant !== "regular" && titleTextClass,
          (props.variant === "gold" || props.variant === "silver") &&
            "min-[550px]:col-span-5",
        )}
      >
        Name
      </div>
      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-xs font-bold xs:text-sm sm:col-span-2 sm:text-base",
          props.variant !== "regular" && titleTextClass,
          (props.variant === "gold" || props.variant === "silver") &&
            "min-[550px]:col-span-2",
        )}
      >
        Cup Points
      </div>
      <div
        className={cn(
          "col-span-3 place-self-center font-varela text-2xs xs:text-xs sm:col-span-2 sm:text-sm",
          props.variant !== "regular" && titleTextClass,
          (props.variant === "gold" || props.variant === "silver") &&
            "min-[550px]:col-span-2",
        )}
      >
        {props.variant === "gold" || props.variant === "silver"
          ? "Starting Strokes"
          : "Earnings"}
      </div>

      {props.variant === "gold" || props.variant === "silver" ? (
        <>
          <div
            className={cn(
              "col-span-2 hidden place-self-center font-varela text-2xs font-bold min-[550px]:block sm:text-xs",
              titleTextClass,
            )}
          >
            Earnings
          </div>
          <div
            className={cn(
              "col-span-1 hidden place-self-center font-varela text-2xs font-bold min-[550px]:block sm:text-xs",
              titleTextClass,
            )}
          >
            Wins
          </div>
          <div
            className={cn(
              "col-span-1 hidden place-self-center font-varela text-2xs font-bold min-[550px]:block sm:text-xs",
              titleTextClass,
            )}
          >
            Top 10
          </div>
        </>
      ) : (
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
      )}

      <div className="col-span-1 place-self-center overflow-x-clip">
        {props.friendsOnlyToggle}
      </div>
    </div>
  );
}

/**
 * Renders a labeled regular-season cutoff divider.
 *
 * @param props Divider label and tone.
 * @returns A cutoff banner.
 */
function StandingsCutLine(props: { label: string; tone: "gold" | "silver" }) {
  return (
    <div
      className={cn(
        "rounded-md py-1 text-center font-varela text-2xs font-bold xs:text-xs sm:text-sm",
        props.tone === "gold"
          ? "bg-yellow-100 text-yellow-900"
          : "bg-zinc-200 text-zinc-700",
      )}
    >
      {props.label}
    </div>
  );
}

/**
 * Loading UI for the standings page shell.
 *
 * @returns A page-level standings skeleton.
 */
function StandingsViewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-10 w-64" />
        <Skeleton className="mx-auto h-4 w-72" />
        <Skeleton className="mx-auto h-8 w-28" />
      </div>
      <div className="mx-auto my-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn("h-9 rounded-md", index === 0 ? "w-20" : "w-24")}
          />
        ))}
      </div>
      <StandingsRowsSkeleton />
    </div>
  );
}

/**
 * Loading UI for the row list area.
 *
 * @returns Skeleton rows matching the standings list density.
 */
function StandingsRowsSkeleton() {
  return (
    <div className="space-y-3 px-1">
      <div className="grid grid-cols-16 rounded-lg bg-muted/40 px-2 py-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn("h-4", index === 1 ? "col-span-7" : "col-span-2")}
          />
        ))}
      </div>
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-16 items-center gap-2 rounded-lg border px-2 py-3"
        >
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="col-span-7 h-5 sm:col-span-5" />
          <Skeleton className="col-span-3 h-4 sm:col-span-2" />
          <Skeleton className="col-span-3 h-4 sm:col-span-2" />
          <Skeleton className="col-span-1 h-5 w-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Loading UI for playoff points-and-payouts details.
 *
 * @returns A compact details skeleton.
 */
function StandingsPlayoffDetailsSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border bg-background/70 p-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

/**
 * Loading UI for an expanded row detail panel.
 *
 * @param props Row highlight state.
 * @returns A detail panel skeleton.
 */
function StandingsRowDetailsSkeleton(props: {
  isCurrent: boolean;
  isFriend: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-2 rounded-md border px-3 py-3",
        props.isCurrent && "bg-blue-50",
        !props.isCurrent && props.isFriend && "bg-muted/40",
      )}
    >
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
      <Skeleton className="mt-4 h-4 w-28" />
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-md border p-2">
            <Skeleton className="mx-auto h-8 w-8 rounded" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Computes displayed positions for a list of cards sorted by standings rules.
 *
 * @param cards Cards to rank.
 * @returns Ranked cards with tie-aware position labels.
 */
function computeStandingsPositions(
  cards: ExtendedStandingsTourCard[],
): ExtendedStandingsTourCard[] {
  const sorted = cards.slice().sort(compareCards);

  return sorted.map((card, index) => {
    const previous = sorted[index - 1];
    const hasTie = previous ? previous.points === card.points : false;
    const betterCount = sorted.filter(
      (candidate) => candidate.points > card.points,
    ).length;
    const tiedCount = sorted.filter(
      (candidate) => candidate.points === card.points,
    ).length;

    return {
      ...card,
      standingsPosition: `${tiedCount > 1 ? "T" : ""}${betterCount + 1}`,
      posChange: hasTie ? card.posChange : card.posChange,
      posChangePO: hasTie ? card.posChangePO : card.posChangePO,
    };
  });
}

/**
 * Builds a card-id map of starting strokes for playoff groups.
 *
 * @param cards Ranked playoff cards.
 * @returns Starting strokes keyed by tour card id.
 */
function buildStartingStrokes(
  cards: ExtendedStandingsTourCard[],
): Map<string, number> {
  const map = new Map<string, number>();
  if (cards.length === 0) {
    return map;
  }

  const highPoints = cards[0]!.points;
  const lowPoints = cards[cards.length - 1]!.points;
  const denominator = highPoints - lowPoints;

  cards.forEach((card) => {
    if (!Number.isFinite(denominator) || denominator <= 0) {
      map.set(String(card._id), 0);
      return;
    }

    const percentile = (card.points - lowPoints) / denominator;
    const strokes = Math.round(-10 * percentile * 10) / 10;
    map.set(String(card._id), strokes);
  });

  return map;
}

/**
 * Formats the display name for a standings card.
 *
 * @param card Hydrated tour card.
 * @returns The preferred label for the standings list.
 */
function getCardDisplayName(card: TourCard) {
  if (card.displayName?.trim()) {
    return card.displayName;
  }

  const firstname = card.member.firstname?.trim() ?? "";
  const lastname = card.member.lastname?.trim() ?? "";

  if (firstname || lastname) {
    return `${firstname} ${lastname}`.trim();
  }

  return card.member.email;
}

/**
 * Sorts standings cards by points, then name, then id.
 *
 * @param left Left card.
 * @param right Right card.
 * @returns Sort comparator result.
 */
function compareCards(left: TourCard, right: TourCard) {
  const pointsDelta = (right.points ?? 0) - (left.points ?? 0);
  if (pointsDelta !== 0) {
    return pointsDelta;
  }

  const nameDelta = getCardDisplayName(left).localeCompare(
    getCardDisplayName(right),
  );
  if (nameDelta !== 0) {
    return nameDelta;
  }

  return String(left._id).localeCompare(String(right._id));
}

/**
 * Calculates a simple average score display for weekday or weekend rounds.
 *
 * @param teams Team results for one tour card.
 * @param kind Which tournament rounds to average.
 * @returns A formatted average or `-` when unavailable.
 */
function calculateAverageScore(teams: Team[], kind: "weekday" | "weekend") {
  const values = teams.flatMap((team) => {
    const rounds =
      kind === "weekday"
        ? [team.roundOne, team.roundTwo]
        : [team.roundThree, team.roundFour];

    return rounds.filter((round): round is number => typeof round === "number");
  });

  if (values.length === 0) {
    return "-";
  }

  const average =
    values.reduce((total, value) => total + value, 0) / values.length;
  return average.toFixed(1);
}

/**
 * Renders a compact, collapsible table that shows a rank → points/payouts mapping.
 *
 * This is a presentational-only component used by standings/playoff screens.
 * It does not fetch data; it formats and displays whatever arrays are provided.
 *
 * @param props.title - Label shown in the `<summary>` row.
 * @param props.points - Points awarded for each rank (1-indexed display).
 * @param props.payouts - Payout (cents) awarded for each rank (1-indexed display).
 * @returns A `<details>` element containing the mapping grid.
 */
export function PointsAndPayoutsDetails(props: {
  title: string;
  points: number[];
  payouts: number[];
}) {
  const rowCount = Math.min(props.points.length, props.payouts.length);

  return (
    <details className="rounded-md border p-2">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        {props.title}
        <ChevronDown className="h-4 w-4" />
      </summary>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="font-medium">Rank</div>
        <div className="col-span-1 font-medium">Points</div>
        <div className="col-span-1 font-medium">Payout</div>
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className="contents">
            <div className="text-muted-foreground">{i + 1}</div>
            <div className="text-muted-foreground">{props.points[i]}</div>
            <div className="text-muted-foreground">
              {formatMoney(props.payouts[i] ?? 0,true)}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
