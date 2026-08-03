import { useCallback, useEffect, useMemo, useState } from "react";

import { api, useMutation, useViewerBootstrap } from "@/convex";
import { getMemberDisplayName } from "@/utils/app";
import { DEFAULT_MAX_PARTICIPANTS } from "@/utils/constants";
import type {
  TourRegistrationOption,
  UseTourCardRegistrationArgs,
} from "@/types";
import { getTourCardDisplayDeadline, isTourCardDisplayOpen } from "@/utils";

const MAX_TIMEOUT_MS = 2_147_000_000;

export function useTourCardRegistration(args: UseTourCardRegistrationArgs) {
  const bootstrap = useViewerBootstrap();
  const createTourCard = useMutation(api.functions.tourCards.createMyTourCard);
  const [creatingTourId, setCreatingTourId] = useState<string | null>(null);
  const [effectTourId, setEffectTourId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const currentTourCard = useMemo(() => {
    if (!args.member) return null;
    return (
      args.seasonTourCards.find((card) => card.memberId === args.member?._id) ??
      null
    );
  }, [args.member, args.seasonTourCards]);

  const closesAt = bootstrap?.tourCardSelfService.closesAt ?? null;
  const displayDeadline = useMemo(
    () =>
      getTourCardDisplayDeadline(
        currentTourCard !== null,
        closesAt,
        args.tournaments,
      ),
    [args.tournaments, closesAt, currentTourCard],
  );
  const isDisplayOpen = isTourCardDisplayOpen(displayDeadline, now);

  useEffect(() => {
    if (displayDeadline === null || Date.now() >= displayDeadline) return;
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(displayDeadline - Date.now() + 25, MAX_TIMEOUT_MS),
    );
    return () => window.clearTimeout(timeout);
  }, [displayDeadline, now]);

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
      : !isDisplayOpen
        ? ("hidden" as const)
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
    closesAt,
    majorChampionBadgesByMemberId,
  };
}
