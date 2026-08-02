import { useCallback, useMemo, useState } from "react";

import { api, useMutation, useViewerBootstrap } from "@/convex";
import { getMemberDisplayName } from "@/utils/app";
import { DEFAULT_MAX_PARTICIPANTS } from "@/utils/constants";
import type { TourRegistrationOption } from "@/types";
import type { Doc } from "@/convex";
import type { SeasonDoc, TourCardDoc } from "convex/types/types";

export function useTourCardRegistration(args: {
  currentSeason: SeasonDoc;
  tours: Doc<"tours">[];
  member: Doc<"members"> | null;
  seasonTourCards: TourCardDoc[];
}) {
  const bootstrap = useViewerBootstrap();
  const createTourCard = useMutation(api.functions.tourCards.createMyTourCard);
  const [creatingTourId, setCreatingTourId] = useState<string | null>(null);
  const [effectTourId, setEffectTourId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTourCard = useMemo(() => {
    if (!args.member) return null;
    return (
      args.seasonTourCards.find((card) => card.memberId === args.member?._id) ??
      null
    );
  }, [args.member, args.seasonTourCards]);

  const toursWithMeta = useMemo<TourRegistrationOption[]>(
    () =>
      args.tours.map((tour) => {
        const tourCards = args.seasonTourCards.filter(
          (card) => card.tourId === tour._id,
        );
        const registeredCount = tour.registeredCount ?? tourCards.length;
        return {
          tour,
          tourCards,
          registeredCount,
          spotsRemaining:
            (tour.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS) -
            registeredCount,
        };
      }),
    [args.seasonTourCards, args.tours],
  );

  const register = useCallback(
    async (option: TourRegistrationOption) => {
      if (!args.member || option.spotsRemaining <= 0 || creatingTourId) return;
      const tourId = String(option.tour._id);
      setCreatingTourId(tourId);
      setEffectTourId(tourId);
      setError(null);
      try {
        await createTourCard({
          displayName: getMemberDisplayName(args.member, undefined),
          tourId: option.tour._id,
          seasonId: args.currentSeason._id,
        });
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to register for this tour.",
        );
      } finally {
        setCreatingTourId(null);
      }
    },
    [args.currentSeason._id, args.member, createTourCard, creatingTourId],
  );

  const majorChampionBadgesByMemberId = bootstrap?.member
    ? {
        [String(bootstrap.member._id)]: bootstrap.badges.map((badge) => ({
          tournamentId: String(badge.tournamentId),
          tournamentName: badge.tournamentName,
          logoUrl: badge.logoUrl ?? null,
        })),
      }
    : {};

  return {
    state: !args.member
      ? ("signed_out" as const)
      : currentTourCard
        ? ("registered" as const)
        : ("ready" as const),
    currentTourCard,
    toursWithMeta,
    creatingTourId,
    effectTourId,
    clearEffect: () => setEffectTourId(null),
    error,
    register,
    closesAt: bootstrap?.tourCardSelfService.closesAt ?? null,
    majorChampionBadgesByMemberId,
  };
}
