"use client";

import { useState, useCallback, type ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./ui/button";
import { EnhancedTourDoc, TourCardDoc, MemberDoc } from "convex/types/types";
import { formatMoney } from "@/lib/utils";
const Dialog = ({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

const DialogContent = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={className}>{children}</div>;

const DialogHeader = ({ children }: { children: ReactNode }) => (
  <div className="p-6 pb-2">{children}</div>
);

const DialogTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="text-lg font-semibold">{children}</h2>
);

const DialogDescription = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-sm text-gray-500">{children}</p>
);

const DialogFooter = ({ children }: { children: ReactNode }) => (
  <div className="flex justify-end gap-2 p-6 pt-2">{children}</div>
);

const DialogTrigger = ({ children }: { children: ReactNode }) => (
  <>{children}</>
);

const LoadingSpinner = ({ className }: { className?: string }) => (
  <div
    className={`h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900 ${className || ""}`}
  ></div>
);

export function TourCardOutput() {
  const { user, isLoaded } = useUser();
  const clerkId = user?.id ?? null;

  const memberTourCards = useQuery(
    api.functions.tourCards.getTourCards,
    clerkId ? { options: { clerkId } } : "skip",
  );

  const member = useQuery(
    api.functions.members.getMembers,
    clerkId ? { options: { clerkId } } : "skip",
  ) as MemberDoc | null | undefined;

  const tourCard = Array.isArray(memberTourCards)
    ? (memberTourCards[0] ?? null)
    : memberTourCards || null;

  const tour = useQuery(api.functions.tours.getTours, {
    options: { id: tourCard?.tourId, enhance: { includeSeason: true } },
  }) as EnhancedTourDoc | undefined | null;

  const tourCardsForTour = useQuery(api.functions.tourCards.getTourCards, {
    options: { tourId: tourCard?.tourId },
  }) as TourCardDoc[] | undefined | null;

  const isLoadingTourCard = Boolean(clerkId) && memberTourCards === undefined;
  const isLoadingMember = Boolean(clerkId) && member === undefined;
  const isLoadingTourDetails = Boolean(tourCard) && tour === undefined;

  if (
    !isLoaded ||
    isLoadingTourCard ||
    isLoadingTourDetails ||
    isLoadingMember
  ) {
    return (
      <div className="flex items-center justify-center py-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (!clerkId || !tourCard || !tour) {
    return null;
  }

  const name = tourCard.displayName ?? user?.fullName ?? "PGC Member";
  const pictureUrl = tour.logoUrl;

  const spotsRemaining =
    +(tour.maxParticipants ?? 75) - (tourCardsForTour?.length ?? 0);

  return (
    <div className="mt-2 flex flex-col items-center justify-center">
      <h2 className="max-w-xl text-center font-varela text-lg text-slate-600">
        {`You have secured your spot on the ${tour.name}. The ${tour.season?.year} season will begin with the Waste Management Open on ${new Intl.DateTimeFormat(
          "en-US",
          {
            month: "short",
            day: "numeric",
          },
        ).format(tour.season?.startDate)}.`}
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
      {member && member.account < 0 && (
        <div className="mb-2 max-w-2xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-800">
          {`You currently owe ${formatMoney(Math.abs(member.account))}. Please send payment to puregolfcollectivetour@gmail.com before the start of the next tournament to make picks.`}
        </div>
      )}
      <TourCardChangeButton tourCard={tourCard} clerkId={clerkId} />
    </div>
  );
}

const TourCardChangeButton = ({
  tourCard,
  clerkId,
}: {
  tourCard: {
    _id: Id<"tourCards">;
    clerkId?: string;
    displayName?: string;
    tourId: Id<"tours">;
  };
  clerkId: string;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [effect, setEffect] = useState(false);
  const [confirmEffect, setConfirmEffect] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const deleteTourCard = useMutation(api.functions.tourCards.deleteTourCards);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    setConfirmEffect(true);
    try {
      await deleteTourCard({
        id: tourCard._id,
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error deleting tour card:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tourCard._id, deleteTourCard]);

  const handleButtonClick = useCallback(() => {
    setEffect(true);
    setIsModalOpen(true);
  }, []);

  if (clerkId !== tourCard.clerkId) return null;

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger>
        <Button
          className={[
            effect && "animate-toggleClick",
            "mx-auto my-2 h-[1.5rem] w-1/2 xs:w-2/5 sm:w-1/3",
          ]
            .filter(Boolean)
            .join(" ")}
          onAnimationEnd={() => setEffect(false)}
          variant="destructive"
          onClick={handleButtonClick}
        >
          Switch Tours
        </Button>
      </DialogTrigger>
      <DialogContent className="w-3/4 sm:max-w-[425px]">
        {isLoading ? (
          <LoadingSpinner className="h-fit" />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete Tour Card</DialogTitle>
              <DialogDescription>
                This will delete your current Tour Card and allow you to re-sign
                up if spots are available.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="submit"
                onClick={handleDelete}
                className={confirmEffect ? "animate-toggleClick" : ""}
                onAnimationEnd={() => setConfirmEffect(false)}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
