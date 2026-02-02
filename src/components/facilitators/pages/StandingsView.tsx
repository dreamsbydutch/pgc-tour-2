import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";

import {
  PointsAndPayoutsDetails,
  StandingsFriendsOnlyToggle,
  StandingsListingRow,
  StandingsPositionChange,
  StandingsTableHeader,
  StandingsViewSkeleton,
  ToursToggle,
} from "@/displays";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";
import { useFriendManagement } from "@/hooks";
import type {
  ExtendedStandingsTourCard,
  StandingsTeam,
  StandingsTier,
  StandingsTour,
  StandingsTourCard,
  StandingsTournament,
  StandingsViewProps,
} from "@/lib";
import {
  computeStandingsPositionChangeByTour,
  computeStandingsPositionStrings,
  isStandingsMember,
  parsePositionToNumber,
} from "@/lib";
import { api, useQuery } from "@/convex";
import type { Doc, Id } from "@/convex";

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
          <Button onClick={() => window.location.reload()}>Retry</Button>
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
            id: "playoffs",
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
                teams={model.teams}
                tournaments={model.tournaments}
                tierById={model.tierById}
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
                teams={model.teams}
                tournaments={model.tournaments}
                tierById={model.tierById}
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
                teams={model.teams}
                tournaments={model.tournaments}
                tierById={model.tierById}
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
                tourLogoUrl={model.toursById.get(String(tc.tourId))?.logoUrl}
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
                teams={model.teams}
                tournaments={model.tournaments}
                tierById={model.tierById}
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
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
                teams={model.teams}
                tournaments={model.tournaments}
                tierById={model.tierById}
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
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
                teams={model.teams}
                tournaments={model.tournaments}
                tierById={model.tierById}
                currentMemberId={model.currentMemberId}
                friendsOnly={model.friendsOnly}
                friendIds={model.friendIds}
                isFriendChanging={model.isFriendChanging}
                onAddFriend={model.onAddFriend}
                onRemoveFriend={model.onRemoveFriend}
                renderPositionChange={renderPositionChange}
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
  type ViewMode = string;
  type Model =
    | { status: "loading" }
    | { status: "error"; errorMessage: string }
    | {
        status: "ready";
        activeSeasonId: string | null;
        setActiveSeasonId: (nextSeasonId: string) => void;
        seasonOptions: Array<{ id: string; label: string }>;
        activeView: ViewMode;
        setActiveView: (next: ViewMode) => void;
        displayedTourName: string | null;
        toursForToggle: Array<{
          id: string;
          shortForm: string;
          logoUrl?: string | null;
        }>;
        currentMemberId: string | null;
        friendsOnly: boolean;
        setFriendsOnly: (next: boolean) => void;
        friendIds: Set<string>;
        isFriendChanging: (memberId: string) => boolean;
        onAddFriend: (memberId: string) => void;
        onRemoveFriend: (memberId: string) => void;
        tourCards: ExtendedStandingsTourCard[];
        tiers: StandingsTier[];
        tournaments: StandingsTournament[];
        teams: StandingsTeam[];
        tierById: Map<string, StandingsTier>;
        toursById: Map<string, StandingsTour>;
        tourGroups: {
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
        playoffStrokesGold: number[];
        playoffStrokesSilver: number[];
      };

  const { user } = useUser();
  const clerkId = user?.id;

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const seasons = useQuery(api.functions.seasons.getSeasons, {
    options: {
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const selectedSeasonId = useMemo(() => {
    if (props.initialSeasonId) return props.initialSeasonId as Id<"seasons">;
    if (currentSeason) return currentSeason._id;
    return null;
  }, [currentSeason, props.initialSeasonId]);

  const standingsData = useQuery(
    api.functions.seasons.getStandingsViewData,
    selectedSeasonId ? { seasonId: selectedSeasonId } : "skip",
  ) as
    | {
        tours: Doc<"tours">[];
        tiers: Doc<"tiers">[];
        tournaments: Doc<"tournaments">[];
        tourCards: Doc<"tourCards">[];
        teams: Doc<"teams">[];
      }
    | undefined;

  const currentMember = useQuery(
    api.functions.members.getMembers,
    clerkId ? { options: { clerkId } } : "skip",
  );

  const lastCurrentMemberRef = useRef<typeof currentMember>(undefined);
  useEffect(() => {
    if (currentMember !== undefined) {
      lastCurrentMemberRef.current = currentMember;
    }
  }, [currentMember]);

  const currentMemberStable =
    currentMember !== undefined ? currentMember : lastCurrentMemberRef.current;

  const currentMemberDoc = isStandingsMember(currentMemberStable)
    ? currentMemberStable
    : null;

  const needsCurrentSeason = !props.initialSeasonId;

  const isLoading =
    (needsCurrentSeason && currentSeason === undefined) ||
    (selectedSeasonId ? standingsData === undefined : false) ||
    (clerkId ? currentMemberStable === undefined : false);

  const error = useMemo(() => {
    if (isLoading) return null;
    if (!selectedSeasonId) {
      return new Error(
        needsCurrentSeason ? "No active season found" : "Season not found",
      );
    }
    if (!standingsData?.tours?.length) return new Error("No tours found");
    return null;
  }, [
    isLoading,
    needsCurrentSeason,
    selectedSeasonId,
    standingsData?.tours?.length,
  ]);

  const data = useMemo(() => {
    if (isLoading) return null;
    if (!standingsData) return null;

    const tours = standingsData.tours as unknown as StandingsTour[];
    const tiers = standingsData.tiers as unknown as StandingsTier[];
    const tournaments =
      standingsData.tournaments as unknown as StandingsTournament[];
    const teams = standingsData.teams as unknown as StandingsTeam[];
    const tourCards = standingsData.tourCards as unknown as StandingsTourCard[];

    const friendIds = new Set(
      (currentMemberDoc?.friends ?? []).map((f) => String(f)),
    );

    const posChangeById = computeStandingsPositionChangeByTour({
      cards: tourCards,
      tours,
      teams,
      tournaments,
      tiers,
    });

    const byTour = new Map<string, ExtendedStandingsTourCard[]>();

    for (const tc of tourCards) {
      const tour = tours.find((t) => t._id === tc.tourId);
      if (!tour) continue;

      const computed = posChangeById.get(tc._id as string);

      const extended: ExtendedStandingsTourCard = {
        ...(tc as unknown as ExtendedStandingsTourCard),
        tour,
        isFriend: friendIds.has(String(tc.memberId)),
        pastPoints: computed?.pastPoints,
        posChange: computed?.posChange ?? 0,
        posChangePO: computed?.posChangePO ?? 0,
      };

      const group = byTour.get(tc.tourId as string) ?? [];
      group.push(extended);
      byTour.set(tc.tourId as string, group);
    }

    const extendedTourCards: ExtendedStandingsTourCard[] = [];
    for (const group of byTour.values()) {
      const sorted = group.slice().sort((a, b) => b.points - a.points);
      extendedTourCards.push(...computeStandingsPositionStrings(sorted));
    }

    const currentTourCard = currentMemberDoc
      ? (extendedTourCards.find((c) => c.memberId === currentMemberDoc._id) ??
        null)
      : null;

    return {
      tours,
      tiers,
      tourCards: extendedTourCards,
      currentTourCard,
      currentMember: currentMemberDoc,
      teams,
      tournaments,
      currentSeason: currentSeason ?? null,
    };
  }, [
    computeStandingsPositionChangeByTour,
    computeStandingsPositionStrings,
    currentMemberDoc,
    currentSeason,
    isLoading,
    standingsData,
  ]);

  const [friendsOnly, setFriendsOnly] = useState(false);
  const friendManagement = useFriendManagement(
    data?.currentMember ?? null,
    clerkId,
  );

  const tours = useMemo(() => data?.tours ?? [], [data?.tours]);
  const tiers = useMemo(() => data?.tiers ?? [], [data?.tiers]);
  const tournaments = useMemo(
    () => data?.tournaments ?? [],
    [data?.tournaments],
  );
  const teams = useMemo(() => data?.teams ?? [], [data?.teams]);
  const allTourCards = useMemo(() => data?.tourCards ?? [], [data?.tourCards]);

  const [activeView, setActiveViewState] = useState<ViewMode>(
    props.initialTourId ?? "",
  );

  useEffect(() => {
    if (!props.initialTourId) return;
    setActiveViewState(props.initialTourId);
  }, [props.initialSeasonId, props.initialTourId]);

  useEffect(() => {
    if (activeView === "playoffs") return;
    if (!tours.length) return;
    const exists = tours.some((t) => t._id === activeView);
    if (activeView && exists) return;
    setActiveViewState(tours[0]!._id);
  }, [activeView, tours]);

  const setActiveView = (next: ViewMode) => {
    setActiveViewState(next);
    props.onTourChange?.(next);
  };

  const seasonOptions = useMemo(() => {
    if (!Array.isArray(seasons)) return [];
    const safeSeasons = seasons.filter(
      (s): s is NonNullable<(typeof seasons)[number]> => s !== null,
    );

    return safeSeasons.map((s) => {
      const label = `${s.year}`;
      return { id: String(s._id), label };
    });
  }, [seasons]);

  const activeSeasonId = selectedSeasonId ? String(selectedSeasonId) : null;

  const setActiveSeasonId = (nextSeasonId: string) => {
    props.onSeasonChange?.(nextSeasonId);
  };

  const currentMemberId =
    data && data.currentMember ? String(data.currentMember._id) : null;

  const friendIds = useMemo(() => {
    const ids = new Set<string>();
    (data?.currentMember?.friends ?? []).forEach((f) => ids.add(String(f)));
    return ids;
  }, [data?.currentMember?.friends]);

  const isFriendChanging = (memberId: string) => {
    return friendManagement.state.friendChangingIds.has(memberId);
  };

  const onAddFriend = (memberId: string) => {
    void friendManagement.actions.addFriend(memberId);
  };

  const onRemoveFriend = (memberId: string) => {
    void friendManagement.actions.removeFriend(memberId);
  };

  const toursForToggle = useMemo(() => {
    return tours.map((t) => ({
      id: t._id,
      shortForm: t.shortForm,
      logoUrl: t.logoUrl,
    }));
  }, [tours]);

  const displayedTourName = useMemo(() => {
    if (activeView === "playoffs") return "Playoffs";
    const tour = tours.find((t) => t._id === activeView);
    return tour ? tour.name : null;
  }, [activeView, tours]);

  const filteredTourCards = useMemo(() => {
    if (activeView === "playoffs") return allTourCards;
    return allTourCards.filter((c) => c.tourId === activeView);
  }, [activeView, allTourCards]);

  const parsePosition = parsePositionToNumber;

  const activeTourPlayoffSpots = useMemo(() => {
    if (!activeView || activeView === "playoffs") return null;
    const tour = tours.find((t) => t._id === activeView);
    if (!tour) return null;
    const spots = Array.isArray(tour.playoffSpots) ? tour.playoffSpots : [];
    return {
      gold: spots[0] ?? 0,
      silver: spots[1] ?? 0,
    };
  }, [activeView, tours]);

  const tourGroups = useMemo(() => {
    const goldCut = activeTourPlayoffSpots?.gold ?? 0;
    const silverCount = activeTourPlayoffSpots?.silver ?? 0;
    const silverCut = goldCut + silverCount;

    const goldCutCards = filteredTourCards.filter(
      (card) => parsePosition(card.currentPosition) <= goldCut,
    );
    const silverCutCards = filteredTourCards.filter((card) => {
      const pos = parsePosition(card.currentPosition);
      return pos > goldCut && pos <= silverCut;
    });
    const remainingCards = filteredTourCards.filter(
      (card) => parsePosition(card.currentPosition) > silverCut,
    );
    return { goldCutCards, silverCutCards, remainingCards };
  }, [
    activeTourPlayoffSpots?.gold,
    activeTourPlayoffSpots?.silver,
    filteredTourCards,
  ]);

  const playoffGroups = useMemo(() => {
    const sortCards = (
      a: ExtendedStandingsTourCard,
      b: ExtendedStandingsTourCard,
    ) => {
      const delta = b.points - a.points;
      if (delta !== 0) return delta;
      const nameDelta = String(a.displayName ?? "").localeCompare(
        String(b.displayName ?? ""),
      );
      if (nameDelta !== 0) return nameDelta;
      return String(a._id).localeCompare(String(b._id));
    };

    const goldTeams: ExtendedStandingsTourCard[] = [];
    const silverTeams: ExtendedStandingsTourCard[] = [];
    const bumpedTeams: ExtendedStandingsTourCard[] = [];

    for (const tour of tours) {
      const spots = Array.isArray(tour.playoffSpots) ? tour.playoffSpots : [];
      const goldCount = spots[0] ?? 0;
      const silverCount = spots[1] ?? 0;
      const cutoff = goldCount + silverCount;
      if (cutoff <= 0) continue;

      const cardsInTour = allTourCards
        .filter((c) => c.tourId === tour._id)
        .slice()
        .sort(sortCards);

      if (goldCount > 0) {
        goldTeams.push(...cardsInTour.slice(0, goldCount));
      }
      if (silverCount > 0) {
        silverTeams.push(
          ...cardsInTour.slice(goldCount, goldCount + silverCount),
        );
      }

      if (cutoff > 0) {
        for (let i = cutoff; i < cardsInTour.length; i++) {
          const card = cardsInTour[i]!;
          const currentRankInTour = i + 1;
          const posChangeInTour = card.posChange ?? 0;
          const pastRankInTour = currentRankInTour + posChangeInTour;
          if (currentRankInTour > cutoff && pastRankInTour <= cutoff) {
            bumpedTeams.push(card);
          }
        }
      }
    }

    goldTeams.sort(sortCards);
    silverTeams.sort(sortCards);
    bumpedTeams.sort(sortCards);

    return { goldTeams, silverTeams, bumpedTeams };
  }, [allTourCards, tours]);

  const playoffSpotTotals = useMemo(() => {
    let goldTotal = 0;
    let silverTotal = 0;
    for (const tour of tours) {
      const spots = Array.isArray(tour.playoffSpots) ? tour.playoffSpots : [];
      goldTotal += spots[0] ?? 0;
      silverTotal += spots[1] ?? 0;
    }
    return { goldTotal, silverTotal };
  }, [tours]);

  const tierById = useMemo(() => {
    const map = new Map<string, StandingsTier>();
    tiers.forEach((t) => map.set(String(t._id), t));
    return map;
  }, [tiers]);

  const toursById = useMemo(() => {
    const map = new Map<string, StandingsTour>();
    tours.forEach((t) => map.set(String(t._id), t));
    return map;
  }, [tours]);

  const playoffTier = useMemo(() => {
    return tiers.find((t) => t.name.toLowerCase() === "playoff") ?? null;
  }, [tiers]);

  const playoffGold = useMemo(() => {
    if (!playoffTier) return null;
    return {
      points: playoffTier.points.slice(0, playoffSpotTotals.goldTotal),
      payouts: playoffTier.payouts.slice(0, playoffSpotTotals.goldTotal),
    };
  }, [playoffTier, playoffSpotTotals.goldTotal]);

  const playoffSilver = useMemo(() => {
    if (!playoffTier) return null;
    return {
      points: playoffTier.points.slice(0, playoffSpotTotals.silverTotal),
      payouts: playoffTier.payouts.slice(
        75,
        75 + playoffSpotTotals.silverTotal,
      ),
    };
  }, [playoffTier, playoffSpotTotals.silverTotal]);

  const playoffStrokesGold = useMemo(() => {
    const teams = playoffGroups.goldTeams;
    if (!teams.length) return [];

    const highPoints = teams[0]!.points;
    const lowPoints = teams[teams.length - 1]!.points;
    const denom = highPoints - lowPoints;
    if (!Number.isFinite(denom) || denom <= 0) return teams.map(() => 0);

    return teams.map((tc) => {
      const percentile = (tc.points - lowPoints) / denom;
      const strokes = -10 * percentile;
      return Math.round(strokes * 10) / 10;
    });
  }, [playoffGroups.goldTeams]);

  const playoffStrokesSilver = useMemo(() => {
    const teams = playoffGroups.silverTeams;
    if (!teams.length) return [];

    const floorIndex = Math.min(35, teams.length - 1);

    const highPoints = teams[0]!.points;
    const floorPoints = teams[floorIndex]!.points;
    const denom = highPoints - floorPoints;

    return teams.map((tc, idx) => {
      if (idx >= floorIndex) return 0;
      if (!Number.isFinite(denom) || denom <= 0) return 0;
      const percentile = (tc.points - floorPoints) / denom;
      const strokes = -10 * percentile;
      return Math.round(strokes * 10) / 10;
    });
  }, [playoffGroups.silverTeams]);

  if (isLoading) return { status: "loading" } as const satisfies Model;

  if (error) {
    return {
      status: "error",
      errorMessage: error?.message ?? "No active season found.",
    } as const satisfies Model;
  }

  return {
    status: "ready",
    activeSeasonId,
    setActiveSeasonId,
    seasonOptions,
    activeView,
    setActiveView,
    displayedTourName,
    toursForToggle,
    currentMemberId,
    friendsOnly,
    setFriendsOnly,
    friendIds,
    isFriendChanging,
    onAddFriend,
    onRemoveFriend,
    tourCards: filteredTourCards,
    tiers,
    tournaments,
    teams,
    tierById,
    toursById,
    tourGroups,
    playoffGroups,
    playoffGold,
    playoffSilver,
    playoffStrokesGold,
    playoffStrokesSilver,
  } as const satisfies Model;
}
