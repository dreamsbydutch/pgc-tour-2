"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TourCardFormButtonProps } from "@/lib/types";

/**
 * TourCardFormButton
 *
 * Renders a single selectable “tour card” option used by `TourCardForm`.
 *
 * Data sources:
 * - Convex mutation: `tourCards.createTourCards`.
 *
 * Major render states:
 * - `loading`: renders a local skeleton matching the button size.
 * - Otherwise: renders a clickable button that creates a tour card for the selected tour.
 *
 * Behavior:
 * - Disabled when `spotsRemaining <= 0`.
 * - Also disabled while any tour card is being created (shared parent state) or while this
 *   specific button is in-flight.
 *
 * @param props - Component props.
 * @returns A button-like card for selecting a tour, or a skeleton when loading.
 *
 * @example
 * <TourCardFormButton
 *   tour={tour}
 *   spotsRemaining={12}
 *   seasonId={seasonId}
 *   memberDisplayName={memberDisplayName}
 *   buyInLabel={"$250"}
 *   isCreatingTourCard={isCreatingTourCard}
 *   setIsCreatingTourCard={setIsCreatingTourCard}
 * />
 */
export function TourCardFormButton(props: TourCardFormButtonProps) {
  if ("loading" in props && props.loading) {
    return <TourCardFormButtonSkeleton />;
  }

  const {
    tour,
    spotsRemaining,
    seasonId,
    memberDisplayName,
    buyInLabel,
    isCreatingTourCard,
    setIsCreatingTourCard,
  } = props;

  const { effect, setEffect, isDisabled, isLoading, handleSubmit } =
    useTourCardFormButton({
      tourId: tour._id,
      spotsRemaining,
      seasonId,
      memberDisplayName,
      isCreatingTourCard,
      setIsCreatingTourCard,
    });

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
        <Loader2 className="h-6 w-6 animate-spin text-gray-700" />
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
}

/**
 * useTourCardFormButton
 *
 * Owns the “create tour card” mutation flow and derives UI state for `TourCardFormButton`.
 *
 * @param input - Hook inputs.
 * @param input.tourId - The tour being selected.
 * @param input.spotsRemaining - Remaining capacity; disables when `<= 0`.
 * @param input.seasonId - Season id to associate with the created tour card.
 * @param input.memberDisplayName - Display name stored on the created tour card.
 * @param input.isCreatingTourCard - Shared parent flag used to disable sibling buttons.
 * @param input.setIsCreatingTourCard - Setter for the shared parent flag.
 * @returns UI state and handlers for the button.
 */
function useTourCardFormButton({
  tourId,
  spotsRemaining,
  seasonId,
  memberDisplayName,
  isCreatingTourCard,
  setIsCreatingTourCard,
}: {
  tourId: Id<"tours">;
  spotsRemaining: number;
  seasonId: Id<"seasons">;
  memberDisplayName: string;
  isCreatingTourCard: boolean;
  setIsCreatingTourCard: (value: boolean) => void;
}) {
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
          tourId,
          seasonId,
          earnings: 0,
          points: 0,
          wins: 0,
          topTen: 0,
          topFive: 0,
          madeCut: 0,
          appearances: 0,
        },
      } as any);
    } catch (error) {
      console.error("Error creating tour card:", error);
    } finally {
      setIsLoading(false);
      setIsCreatingTourCard(false);
    }
  }, [
    createTourCard,
    isLoading,
    memberDisplayName,
    seasonId,
    setIsCreatingTourCard,
    spotsRemaining,
    tourId,
  ]);

  const isDisabled = isCreatingTourCard || isLoading || spotsRemaining <= 0;

  return { effect, setEffect, isDisabled, isLoading, handleSubmit };
}

/**
 * Loading UI for `TourCardFormButton`.
 */
function TourCardFormButtonSkeleton() {
  return (
    <div className="h-[16rem] w-[14rem] rounded-md border-2 p-2 shadow-lg">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Skeleton className="h-28 w-28 rounded" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  );
}
