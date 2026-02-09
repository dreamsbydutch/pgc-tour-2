import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";

import { PointsAndPayoutsDetails, ToursToggle } from "@/displays";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/ui";
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
  calculateAverageScore,
  cn,
  computeStandingsPositionChangeByTour,
  computeStandingsPositionStrings,
  formatMoney,
  includesPlayoff,
  isStandingsMember,
  parsePositionToNumber,
  parseRankFromPositionString,
} from "@/lib";
import { api, useQuery } from "@/convex";
import type { Doc, Id } from "@/convex";
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
          _id: string;
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
      _id: t._id,
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
    parsePosition,
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

  const canFriend =
    props.mode === "regular" && !!props.currentMemberId && !isCurrent;

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

      <div
        className={cn(
          "col-span-7 flex items-center justify-center place-self-center font-varela text-lg sm:col-span-5 sm:text-xl",
          props.mode === "playoff" && "min-[550px]:col-span-5",
        )}
      >
        {props.card.displayName}
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

            {nonPlayoffTournaments.length === 0 ? (
              <div className="px-3 pb-3 pt-2 text-sm text-muted-foreground">
                No tournaments
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto border-t">
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
