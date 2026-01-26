"use client";

import { useUser } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import type {
  EnhancedTourDoc,
  MemberDoc,
  TourCardDoc,
} from "convex/types/types";
import { TourCardChangeButton } from "@/widgets";
import { Skeleton } from "@/ui";
import { formatMonthDay, formatMoney } from "@/lib/utils";
import { api } from "@/convex";

/**
 * TourCardOutput
 *
 * Displays the signed-in member’s current tour card (name + tour branding), shows remaining
 * spots for that tour, and provides a CTA to change tours.
 *
 * Data sources:
 * - Clerk: current user (`useUser`) for identity and display fallback.
 * - Convex:
 *   - `tourCards.getCurrentYearTourCard` (by clerkId + year) to load the member’s current-year tour card
 *   - `members.getMembers` (by clerkId) for account balance
 *   - `tours.getTours` (by tourId, enhanced with season) for tour/season display
 *   - `tourCards.getTourCards` (by tourId + seasonId) to derive remaining capacity
 *
 * Major render states:
 * - While auth/data is loading: renders an internal skeleton.
 * - If the user is not signed in or has no tour card: renders `null`.
 * - Otherwise: renders the tour card, spots remaining, and the change-tour CTA.
 *
 * @returns The tour card UI or `null` when unavailable.
 *
 * @example
 * <TourCardOutput />
 */
export function TourCardOutput() {
  const {
    state,
    user,
    member,
    tour,
    tourCard,
    spotsRemaining,
    name,
    pictureUrl,
  } = useTourCardOutput();

  if (state === "loading") {
    return <TourCardOutputSkeleton />;
  }

  if (state !== "ready" || !tourCard || !tour || !user) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col items-center justify-center">
      <h2 className="max-w-xl text-center font-varela text-lg text-slate-600">
        {`You have secured your spot on the ${tour.name}. The ${tour.season?.year} season will begin with the Waste Management Open on ${formatMonthDay(tour.season?.startDate)}.`}
      </h2>
      <div className="mx-auto mt-4 flex w-[12rem] min-w-fit flex-col items-center justify-center rounded-lg border-2 border-gray-400 bg-gray-300 p-4 text-center shadow-2xl 2xs:w-[18rem] sm:w-[22rem]">
        {pictureUrl ? (
          <img
            src={pictureUrl}
            alt="Tour Logo"
            width={75}
            height={75}
            loading="lazy"
            className="h-3/4 max-h-32 w-3/4 max-w-32 object-contain"
          />
        ) : (
          <div className="h-3/4 max-h-32 w-3/4 max-w-32 rounded bg-gray-200" />
        )}
        <h2 className="text-2xl font-bold text-gray-800">{name}</h2>
        <p className="text-base italic text-gray-600">{tour.name}</p>
      </div>
      <div className="mb-2 mt-2 text-xs text-slate-600">
        {spotsRemaining === 0
          ? `${tour.name} is full!`
          : `${spotsRemaining} spots remaining`}
      </div>
      <TourCardChangeButton tourCardId={tourCard._id} />
      {member && member.account < 0 && (
        <div className="mb-2 max-w-2xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-800">
          {`You currently owe ${formatMoney(Math.abs(member.account))}. Please send payment to puregolfcollectivetour@gmail.com before the start of the next tournament to make picks.`}
        </div>
      )}
    </div>
  );
}

/**
 * useTourCardOutput
 *
 * Fetches/derives the view-model required by `TourCardOutput`.
 *
 * Data sources:
 * - Clerk user (`useUser`) for `clerkId` and name fallback.
 * - Convex queries for the member’s tour card, the tour details (including season),
 *   the tour’s current tour-card count, and the member’s account balance.
 *
 * @returns A view-model object including a `state` discriminator and, when ready, the tour card,
 * tour, spots remaining, and related member/user info.
 */
function useTourCardOutput() {
  const { user, isLoaded } = useUser();
  const clerkId = user?.id ?? null;
  const currentYear = new Date().getFullYear();

  const tourCard = useQuery(
    api.functions.tourCards.getCurrentYearTourCard,
    clerkId ? { options: { clerkId, year: currentYear } } : "skip",
  ) as TourCardDoc | null | undefined;

  const member = useQuery(
    api.functions.members.getMembers,
    clerkId ? { options: { clerkId } } : "skip",
  ) as MemberDoc | null | undefined;

  const tour = useQuery(
    api.functions.tours.getTours,
    tourCard
      ? {
          options: {
            id: tourCard.tourId,
            enhance: { includeSeason: true },
          },
        }
      : "skip",
  ) as EnhancedTourDoc | undefined | null;

  const tourCardsForTour = useQuery(
    api.functions.tourCards.getTourCards,
    tourCard
      ? { options: { tourId: tourCard.tourId, seasonId: tourCard.seasonId } }
      : "skip",
  ) as TourCardDoc[] | undefined | null;

  const reservedSpotsResult = useQuery(
    api.functions.tourCards.getReservedTourSpotsForSeason,
    tourCard ? { options: { seasonId: tourCard.seasonId } } : "skip",
  ) as { reservedByTourId?: Record<string, number> } | undefined;

  const isLoadingTourCard = Boolean(clerkId) && tourCard === undefined;
  const isLoadingMember = Boolean(clerkId) && member === undefined;
  const isLoadingTourDetails = Boolean(tourCard) && tour === undefined;

  if (
    !isLoaded ||
    isLoadingTourCard ||
    isLoadingTourDetails ||
    isLoadingMember
  ) {
    return { state: "loading" as const };
  }

  if (!clerkId || !tourCard || !tour || !user) {
    return { state: "empty" as const };
  }

  const name = tourCard.displayName ?? user.fullName ?? "PGC Member";
  const pictureUrl = tour.logoUrl;
  const reservedByTourId = reservedSpotsResult?.reservedByTourId ?? {};
  const reserved = reservedByTourId[tourCard.tourId] ?? 0;
  const spotsRemaining =
    +(tour.maxParticipants ?? 75) - (tourCardsForTour?.length ?? 0) - reserved;

  return {
    state: "ready" as const,
    user,
    member: member ?? null,
    tour,
    tourCard,
    spotsRemaining,
    name,
    pictureUrl,
  };
}

/**
 * Loading UI for `TourCardOutput`.
 */
function TourCardOutputSkeleton() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-4">
        <Skeleton className="h-6 w-5/6" />
        <div className="w-full rounded-lg border-2 border-gray-400 bg-gray-300 p-4 shadow-2xl">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-24 w-24 rounded" />
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>
    </div>
  );
}
