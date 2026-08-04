import { useUser } from "@clerk/tanstack-react-start";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, type Id, useQuery, useViewerBootstrap } from "@/convex";
import type {
  ExtendedStandingsTourCard,
  StandingsTier,
  StandingsTour,
  StandingsTourCard,
  StandingsViewProps,
} from "@/types";
import {
  computeStandingsPositionStrings,
  isStandingsMember,
  parsePositionToNumber,
} from "@/utils/app";
import { buildPlayoffStartingStrokes } from "@/utils";
import { useAnalytics } from "./useAnalytics";
import { useFriendManagement } from "./useFriendManagement";

export function useStandingsPage(props: StandingsViewProps) {
  type ViewMode = string;

  const { user } = useUser();
  const { trackStandingsViewChanged } = useAnalytics();
  const clerkId = user?.id;
  const bootstrap = useViewerBootstrap();
  const initialSeasonId = props.initialSeasonId;
  const initialTourId = props.initialTourId;
  const onSeasonChange = props.onSeasonChange;
  const onTourChange = props.onTourChange;

  const selectedSeasonId = useMemo(() => {
    if (initialSeasonId) return initialSeasonId as Id<"seasons">;
    return bootstrap?.appState.currentSeasonId ?? null;
  }, [bootstrap?.appState.currentSeasonId, initialSeasonId]);

  const standingsData = useQuery(api.functions.seasons.getStandingsIndex, {
    seasonId: selectedSeasonId ?? undefined,
  });

  const currentMember = clerkId ? bootstrap?.member : undefined;

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
  const resolvedSeasonId =
    selectedSeasonId ?? standingsData?.currentSeason?._id ?? null;

  const isLoading =
    standingsData === undefined ||
    (clerkId ? currentMemberStable === undefined : false);

  const error = useMemo(() => {
    if (isLoading) return null;
    if (!resolvedSeasonId) {
      return new Error("No active season found");
    }
    if (!standingsData?.tours?.length) return new Error("No tours found");
    return null;
  }, [isLoading, resolvedSeasonId, standingsData?.tours?.length]);

  const data = useMemo(() => {
    if (isLoading) return null;
    if (!standingsData) return null;

    const tours = standingsData.tours as unknown as StandingsTour[];
    const tiers = standingsData.tiers as unknown as StandingsTier[];
    const tourCards =
      standingsData.standingsRows as unknown as StandingsTourCard[];

    const friendIds = new Set(
      (currentMemberDoc?.friends ?? []).map((f) => String(f)),
    );

    const byTour = new Map<string, ExtendedStandingsTourCard[]>();

    for (const tc of tourCards) {
      const tour = tours.find((t) => t._id === tc.tourId);
      if (!tour) continue;

      const materialized = tc as unknown as ExtendedStandingsTourCard;

      const extended: ExtendedStandingsTourCard = {
        ...(tc as unknown as ExtendedStandingsTourCard),
        tour,
        isFriend: friendIds.has(String(tc.memberId)),
        pastPoints: materialized.pastPoints,
        posChange: materialized.posChange ?? 0,
        posChangePO: materialized.posChangePO ?? 0,
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
      currentSeason: standingsData.currentSeason,
      majorChampionBadgesByMemberId:
        standingsData.majorChampionBadgesByMemberId,
    };
  }, [currentMemberDoc, isLoading, standingsData]);

  const [friendsOnly, setFriendsOnly] = useState(false);
  const friendManagement = useFriendManagement(
    data?.currentMember ?? null,
    clerkId,
  );

  const tours = useMemo(() => data?.tours ?? [], [data?.tours]);
  const tiers = useMemo(() => data?.tiers ?? [], [data?.tiers]);
  const allTourCards = useMemo(() => data?.tourCards ?? [], [data?.tourCards]);

  const [activeView, setActiveViewState] = useState<ViewMode>(
    initialTourId ?? "",
  );

  useEffect(() => {
    if (!initialTourId) return;
    setActiveViewState(initialTourId);
  }, [initialSeasonId, initialTourId]);

  useEffect(() => {
    if (activeView === "playoffs") return;
    if (!tours.length) return;
    const exists = tours.some((t) => t._id === activeView);
    if (activeView && exists) return;

    const preferredTourId =
      !initialTourId && data?.currentTourCard?.tourId
        ? String(data.currentTourCard.tourId)
        : null;
    const fallbackTourId = tours[0]!._id;
    const nextView =
      preferredTourId && tours.some((t) => t._id === preferredTourId)
        ? preferredTourId
        : fallbackTourId;

    setActiveViewState(nextView);
    if (!initialTourId) {
      onTourChange?.(nextView);
    }
  }, [
    activeView,
    data?.currentTourCard?.tourId,
    initialTourId,
    onTourChange,
    tours,
  ]);

  const setActiveView = (next: ViewMode) => {
    trackStandingsViewChanged(next === "playoffs" ? "playoffs" : "tour");
    setActiveViewState(next);
    onTourChange?.(next);
  };

  const seasonOptions = useMemo(() => {
    return (standingsData?.seasons ?? []).map((s) => {
      const label = `${s.year}`;
      return { id: String(s._id), label };
    });
  }, [standingsData?.seasons]);

  const activeSeasonId = resolvedSeasonId ? String(resolvedSeasonId) : null;

  const setActiveSeasonId = (nextSeasonId: string) => {
    onSeasonChange?.(nextSeasonId);
  };

  const currentMemberId =
    data && data.currentMember ? String(data.currentMember._id) : null;

  const friendIds = friendManagement.state.friendIds;

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
    const strokesById = buildPlayoffStartingStrokes(
      teams.map((team) => ({ id: String(team._id), points: team.points })),
      "gold",
    );
    return teams.map((team) => strokesById.get(String(team._id)) ?? 0);
  }, [playoffGroups.goldTeams]);

  const playoffStrokesSilver = useMemo(() => {
    const teams = playoffGroups.silverTeams;
    const strokesById = buildPlayoffStartingStrokes(
      teams.map((team) => ({ id: String(team._id), points: team.points })),
      "silver",
    );
    return teams.map((team) => strokesById.get(String(team._id)) ?? 0);
  }, [playoffGroups.silverTeams]);

  if (isLoading) return { status: "loading" } as const;

  if (error) {
    return {
      status: "error",
      errorMessage: error?.message ?? "No active season found.",
      retry: () => {
        const currentSeasonId = bootstrap?.appState.currentSeasonId;
        if (currentSeasonId) onSeasonChange?.(String(currentSeasonId));
      },
    } as const;
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
    toursById,
    tourGroups,
    playoffGroups,
    playoffGold,
    playoffSilver,
    playoffStrokesGold,
    playoffStrokesSilver,
    majorChampionBadgesByMemberId: data?.majorChampionBadgesByMemberId ?? {},
  } as const;
}
