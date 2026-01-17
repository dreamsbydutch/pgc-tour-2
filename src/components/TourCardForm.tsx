"use client";

import { Link } from "@tanstack/react-router";
import { useUser } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_MAX_PARTICIPANTS = 75;

type ClerkUser = ReturnType<typeof useUser>["user"];
type TourDoc = Doc<"tours">;
type TourCardDoc = Doc<"tourCards">;
type MemberDoc = Doc<"members">;

const LoadingSpinner = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900",
      className,
    )}
  />
);

export function TourCardForm() {
  const [isCreatingTourCard, setIsCreatingTourCard] = useState(false);
  const { user } = useUser();
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
  const memberResult = useQuery(
    api.functions.members.getMembers,
    clerkId ? { options: { clerkId } } : "skip",
  );

  const memberDoc = isMemberDoc(memberResult) ? memberResult : null;

  const tourCardFeeResult = useQuery(
    api.functions.transactions.getTransactions,
    memberDoc && currentSeason
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
    () => getMemberDisplayName(memberDoc as MemberDoc, user),
    [memberDoc, user],
  );

  const tourCardsList = useMemo(() => {
    return (
      Array.isArray(seasonTourCards) ? seasonTourCards : []
    ) as TourCardDoc[];
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
        : Array.isArray((toursResult as { tours?: TourDoc[] })?.tours)
          ? (toursResult as { tours: TourDoc[] }).tours
          : []
    ) as TourDoc[];
  }, [toursResult]);

  const toursWithMeta = useMemo(() => {
    return tours.map((tour) => {
      const maxParticipants = tour.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;
      const taken = tourCounts.get(tour._id) ?? 0;
      return {
        tour,
        maxParticipants,
        spotsRemaining: Math.max(0, maxParticipants - taken),
      };
    });
  }, [tourCounts, tours]);

  const headingYear = currentSeason?.year ?? new Date().getFullYear();

  const toursLoading = currentSeason ? toursResult === undefined : false;
  const tourCardsLoading = currentSeason
    ? seasonTourCards === undefined
    : false;
  const memberLoading = clerkId ? memberResult === undefined : false;
  const tourCardFeeLoading =
    memberDoc && currentSeason ? tourCardFeeResult === undefined : false;

  const isLoading =
    currentSeason === undefined ||
    toursLoading ||
    tourCardsLoading ||
    memberLoading ||
    tourCardFeeLoading;

  const hasPaidTourCardFee = useMemo(() => {
    if (!Array.isArray(tourCardFeeResult)) return false;
    return tourCardFeeResult.some(
      (tx) =>
        tx?.transactionType === "TourCardFee" && tx?.status === "completed",
    );
  }, [tourCardFeeResult]);

  if (!clerkId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (!currentSeason || currentTourCard || toursWithMeta.length === 0) {
    return null;
  }

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
        {toursWithMeta.map(({ tour, spotsRemaining }) => (
          <TourCardFormButton
            key={tour._id}
            tour={tour}
            spotsRemaining={spotsRemaining}
            seasonId={currentSeason._id}
            memberDisplayName={memberDisplayName}
            buyInLabel={formatBuyIn(tour.buyIn)}
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

type TourCardFormButtonProps = {
  tour: TourDoc;
  spotsRemaining: number;
  seasonId: Id<"seasons">;
  memberDisplayName: string;
  buyInLabel: string;
  isCreatingTourCard: boolean;
  setIsCreatingTourCard: Dispatch<SetStateAction<boolean>>;
};

const TourCardFormButton = ({
  tour,
  spotsRemaining,
  seasonId,
  memberDisplayName,
  buyInLabel,
  isCreatingTourCard,
  setIsCreatingTourCard,
}: TourCardFormButtonProps) => {
  const createTourCard = useMutation(api.functions.tourCards.createTourCards);
  const [isLoading, setIsLoading] = useState(false);
  const [effect, setEffect] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (spotsRemaining <= 0 || isLoading) return;

    setIsCreatingTourCard(true);
    setIsLoading(true);
    setEffect(true);

    try {
      await createTourCard({
        data: {
          displayName: memberDisplayName,
          tourId: tour._id,
          seasonId,
          earnings: 0,
          points: 0,
          wins: 0,
          topTen: 0,
          topFive: 0,
          madeCut: 0,
          appearances: 0,
        },
      });
    } catch (error) {
      console.error("Error creating tour card:", error);
    } finally {
      setIsLoading(false);
      setIsCreatingTourCard(false);
    }
  }, [
    spotsRemaining,
    isLoading,
    setIsCreatingTourCard,
    createTourCard,
    memberDisplayName,
    tour._id,
    seasonId,
  ]);

  const isDisabled = isCreatingTourCard || isLoading || spotsRemaining <= 0;

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleSubmit}
      disabled={isDisabled}
      className={cn(
        effect && "animate-toggleClick",
        "flex h-[16rem] w-[14rem] flex-col items-center justify-center border-2 p-2 text-lg shadow-lg",
      )}
      onAnimationEnd={() => setEffect(false)}
    >
      {isLoading ? (
        <LoadingSpinner className="h-6 w-6 border-gray-700" />
      ) : (
        <>
          {typeof tour.logoUrl === "string" && tour.logoUrl ? (
            <img
              src={tour.logoUrl}
              alt={`${tour.name} logo`}
              width={128}
              height={128}
              loading="lazy"
              className="w-4/5 object-contain"
            />
          ) : (
            <div className="mb-2 h-28 w-28 rounded bg-gray-200" />
          )}
          <span className="mt-2 text-center text-base font-semibold">
            {tour.name}
          </span>
          <div className="text-xs text-slate-600">
            {spotsRemaining <= 0
              ? `${tour.name} is full!`
              : `${spotsRemaining} spots remaining`}
          </div>
          <div className="text-xs text-slate-600">{`Buy-in: ${buyInLabel}`}</div>
        </>
      )}
    </Button>
  );
};

function isMemberDoc(value: unknown): value is MemberDoc {
  return Boolean(value && typeof value === "object" && "_id" in value);
}

function getMemberDisplayName(
  member: MemberDoc | null,
  user: ClerkUser | null | undefined,
): string {
  const nameParts = [member?.firstname, member?.lastname].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  if (nameParts.length) {
    return nameParts.join(" ").trim();
  }

  if (member?.email) {
    return member.email.split("@")[0];
  }

  if (user?.fullName) {
    const fn = user.fullName.split(" ")[0];
    const ln = user.fullName.split(" ").slice(1).join(" ");
    return fn[0] + ". " + ln;
  }

  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress;

  if (email) {
    return email.split("@")[0];
  }

  return "PGC Member";
}

function formatBuyIn(cents?: number): string {
  if (typeof cents !== "number") {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
