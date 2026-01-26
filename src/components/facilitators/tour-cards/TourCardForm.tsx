"use client";

import { Link } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-react-start";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { api } from "@/convex";
import type { Doc, Id } from "@/convex";
import { TourCardFormButton } from "@/widgets";
import { Skeleton } from "@/ui";
import { DEFAULT_MAX_PARTICIPANTS } from "@/lib/constants";
import { formatBuyIn, getMemberDisplayName } from "@/lib";

/**
 * TourCardForm
 *
 * Displays the “choose a tour” UI for the currently signed-in member.
 *
 * Data sources:
 * - Clerk: derives the acting `clerkId` from `useUser()`.
 * - Convex:
 *   - `seasons.getCurrentSeason` to scope everything to the active season.
 *   - `tours.getTours` to list tours in the current season.
 *   - `tourCards.getTourCards` to compute per-tour spots remaining and detect if the member already has a tour card.
 *   - `members.getMembers` to resolve the member record by `clerkId`.
 *   - `transactions.getTransactions` to detect whether the Tour Card Fee is already paid.
 *
 * Major render states:
 * - Signed out: returns `null`.
 * - Loading: renders `TourCardFormSkeleton`.
 * - Hidden: returns `null` when the season is missing, tours are missing, or the member already has a tour card.
 * - Ready: renders selectable tour options via `TourCardFormButton`.
 *
 * @returns A tour-selection UI fragment or `null`.
 *
 * @example
 * <TourCardForm />
 */
export function TourCardForm() {
  const {
    state,
    headingYear,
    hasPaidTourCardFee,
    toursWithMeta,
    isCreatingTourCard,
    setIsCreatingTourCard,
    memberDisplayName,
    seasonId,
  } = useTourCardForm();

  if (state === "signed_out") return null;
  if (state === "loading") return <TourCardFormSkeleton />;
  if (state !== "ready") return null;

  return (
    <div className="my-4 flex flex-col items-center justify-center gap-4">
      <h2 className="text-center font-varela text-lg text-slate-600">
        {`Choose your Tour for the ${headingYear} season below.`}
      </h2>
      {hasPaidTourCardFee ? (
        <p className="text-center text-sm text-emerald-800">
          Your Tour Card Fee for this season is already paid for.
        </p>
      ) : null}
      <div className="flex h-full flex-col gap-2 sm:flex-row">
        {toursWithMeta.map(({ tour, spotsRemaining, buyInLabel }) => (
          <TourCardFormButton
            key={tour._id}
            tour={tour}
            spotsRemaining={spotsRemaining}
            seasonId={seasonId}
            memberDisplayName={memberDisplayName}
            buyInLabel={buyInLabel}
            isCreatingTourCard={isCreatingTourCard}
            setIsCreatingTourCard={setIsCreatingTourCard}
          />
        ))}
      </div>
      <div className="text-center font-varela text-base text-slate-600">
        Coordinate with your friends to make sure you sign up for the same tour
        for the best experience. For more info on the PGC Tour, check out the{" "}
        <Link
          to="/rulebook"
          params={(current) => current}
          search={(current) => current}
          className="underline"
        >
          Rulebook.
        </Link>
      </div>
    </div>
  );
}

/**
 * useTourCardForm
 *
 * Fetches and derives the view-model used by `TourCardForm`.
 *
 * @returns A stateful view-model which includes render-state discrimination and, when ready,
 * the tour options + metadata needed to render `TourCardFormButton`.
 */
function useTourCardForm() {
  const [isCreatingTourCard, setIsCreatingTourCard] = useState(false);
  const { user } = useUser();
  const convexAuth = useConvexAuth();
  const clerkId = user?.id ?? null;

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);
  const toursResult = useQuery(
    api.functions.tours.getTours,
    currentSeason
      ? { options: { filter: { seasonId: currentSeason._id } } }
      : "skip",
  );
  const seasonTourCards = useQuery(
    api.functions.tourCards.getTourCards,
    currentSeason ? { options: { seasonId: currentSeason._id } } : "skip",
  );
  const reservedSpotsResult = useQuery(
    api.functions.tourCards.getReservedTourSpotsForSeason,
    currentSeason ? { options: { seasonId: currentSeason._id } } : "skip",
  );
  const memberResult = useQuery(
    api.functions.members.getMembers,
    clerkId && convexAuth.isAuthenticated ? { options: { clerkId } } : "skip",
  );

  const memberDoc = useMemo(() => {
    if (!memberResult || typeof memberResult !== "object") return null;
    return "_id" in memberResult ? (memberResult as Doc<"members">) : null;
  }, [memberResult]);

  const tourCardFeeResult = useQuery(
    api.functions.transactions.getTransactions,
    memberDoc && currentSeason && convexAuth.isAuthenticated
      ? {
          options: {
            filter: {
              memberId: memberDoc._id,
              seasonId: currentSeason._id,
              transactionType: "TourCardFee",
              status: "completed",
            },
            limit: 1,
          },
        }
      : "skip",
  );

  const memberDisplayName = useMemo(
    () => getMemberDisplayName(memberDoc, user),
    [memberDoc, user],
  );

  const tourCardsList = useMemo(() => {
    return (Array.isArray(seasonTourCards) ? seasonTourCards : []) as Array<
      Doc<"tourCards">
    >;
  }, [seasonTourCards]);

  const currentTourCard = useMemo(() => {
    if (!memberDoc) return null;
    return (
      tourCardsList.find((card) => card.memberId === memberDoc._id) ?? null
    );
  }, [memberDoc, tourCardsList]);

  const tourCounts = useMemo(() => {
    const counts = new Map<Id<"tours">, number>();
    tourCardsList.forEach((card) => {
      counts.set(card.tourId, (counts.get(card.tourId) ?? 0) + 1);
    });
    return counts;
  }, [tourCardsList]);

  const tours = useMemo(() => {
    return (
      Array.isArray(toursResult)
        ? toursResult
        : Array.isArray((toursResult as { tours?: Array<Doc<"tours">> })?.tours)
          ? (toursResult as { tours: Array<Doc<"tours">> }).tours
          : []
    ) as Array<Doc<"tours">>;
  }, [toursResult]);

  const toursWithMeta = useMemo(() => {
    const reservedByTourId =
      reservedSpotsResult && typeof reservedSpotsResult === "object"
        ? ((
            reservedSpotsResult as { reservedByTourId?: Record<string, number> }
          ).reservedByTourId ?? {})
        : {};

    return tours.map((tour) => {
      const maxParticipants = tour.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;
      const taken = tourCounts.get(tour._id) ?? 0;
      const reserved = reservedByTourId[tour._id] ?? 0;
      return {
        tour,
        spotsRemaining: Math.max(0, maxParticipants - taken - reserved),
        buyInLabel: formatBuyIn(tour.buyIn),
      };
    });
  }, [reservedSpotsResult, tourCounts, tours]);

  const headingYear = currentSeason?.year ?? new Date().getFullYear();

  const toursLoading = currentSeason ? toursResult === undefined : false;
  const tourCardsLoading = currentSeason
    ? seasonTourCards === undefined
    : false;
  const reservedSpotsLoading = currentSeason
    ? reservedSpotsResult === undefined
    : false;
  const memberLoading =
    clerkId && convexAuth.isAuthenticated ? memberResult === undefined : false;
  const tourCardFeeLoading =
    memberDoc && currentSeason && convexAuth.isAuthenticated
      ? tourCardFeeResult === undefined
      : false;

  const authLoading = Boolean(clerkId) && !convexAuth.isAuthenticated;

  const isLoading =
    currentSeason === undefined ||
    authLoading ||
    toursLoading ||
    tourCardsLoading ||
    reservedSpotsLoading ||
    memberLoading ||
    tourCardFeeLoading;

  const hasPaidTourCardFee = useMemo(() => {
    if (!Array.isArray(tourCardFeeResult)) return false;
    return tourCardFeeResult.some(
      (tx) =>
        tx?.transactionType === "TourCardFee" && tx?.status === "completed",
    );
  }, [tourCardFeeResult]);

  if (!clerkId) {
    return { state: "signed_out" as const };
  }

  if (isLoading) {
    return { state: "loading" as const };
  }

  if (!currentSeason || currentTourCard || toursWithMeta.length === 0) {
    return { state: "hidden" as const };
  }

  return {
    state: "ready" as const,
    headingYear,
    hasPaidTourCardFee,
    toursWithMeta,
    isCreatingTourCard,
    setIsCreatingTourCard,
    memberDisplayName,
    seasonId: currentSeason._id,
  };
}

/**
 * Loading UI for `TourCardForm`.
 */
function TourCardFormSkeleton() {
  return (
    <div className="my-4 flex flex-col items-center justify-center gap-4">
      <Skeleton className="h-6 w-72" />
      <div className="flex h-full flex-col gap-2 sm:flex-row">
        <TourCardFormButton loading />
        <TourCardFormButton loading />
      </div>
      <div className="flex items-center justify-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <Skeleton className="h-4 w-80" />
      </div>
    </div>
  );
}
