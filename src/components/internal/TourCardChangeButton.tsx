"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_MAX_PARTICIPANTS } from "@/lib/constants";
import { formatBuyIn } from "@/lib/utils";
import type { TourCardChangeButtonProps } from "@/lib/types";

/**
 * TourCardChangeButton
 *
 * Renders a “Switch Tours” button that opens a dialog for selecting a new tour and updates the
 * existing tour card’s `tourId`.
 *
 * Data sources:
 * - Convex:
 *   - `tourCards.getTourCards({ id })` to load the current tour card.
 *   - `tours.getTours({ seasonId })` to list tours in that season.
 *   - `tourCards.getTourCards({ seasonId })` to compute per-tour capacity.
 *   - `tourCards.switchTourCards` mutation to perform the switch.
 *
 * Major render states:
 * - `loading` prop: renders a local skeleton.
 * - Default: renders the button and dialog flow.
 *
 * Capacity handling:
 * - The UI shows full tours as disabled.
 * - Server-side capacity validation is still enforced by `tourCards.switchTourCards`.
 *
 * @param props - Component props.
 * @param props.tourCardId - The tour card document id to update.
 * @param props.loading - Whether to render the loading skeleton.
 * @returns The switch-tours button and dialog UI.
 */
export function TourCardChangeButton({
  tourCardId,
  loading = false,
}: TourCardChangeButtonProps) {
  if (loading) {
    return <TourCardChangeButtonSkeleton />;
  }

  const {
    effect,
    setEffect,
    confirmEffect,
    setConfirmEffect,
    isModalOpen,
    setIsModalOpen,
    isLoading,
    errorMessage,
    setErrorMessage,
    selectedTourId,
    setSelectedTourId,
    tourCard,
    tourCardResult,
    toursResult,
    seasonTourCards,
    otherToursWithMeta,
    handleButtonClick,
    handleSwitch,
  } = useTourCardChangeButton({ tourCardId });

  return (
    <>
      <Button
        className={[
          effect && "animate-toggleClick",
          "mx-auto mb-2 mt-0.5 h-[1.5rem] w-1/2 max-w-[150px] xs:w-2/5 sm:w-1/3",
        ]
          .filter(Boolean)
          .join(" ")}
        onAnimationEnd={() => setEffect(false)}
        variant="destructive"
        onClick={handleButtonClick}
      >
        Switch Tours
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-full">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Switch Tours</DialogTitle>
                <DialogDescription>
                  Choose a new tour with open spots. Your existing Tour Card
                  will be updated to the new tour.
                </DialogDescription>
              </DialogHeader>

              {tourCardResult === undefined ||
              (tourCard && toursResult === undefined) ||
              (tourCard && seasonTourCards === undefined) ? (
                <div className="flex items-center justify-center p-6">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !tourCard ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Tour card not found.
                </div>
              ) : otherToursWithMeta.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No other tours are available for this season.
                </div>
              ) : (
                <div className="flex flex-col gap-2 py-2">
                  {otherToursWithMeta.map(
                    ({ tour, spotsRemaining, isFull }) => {
                      const isSelected = selectedTourId === tour._id;
                      return (
                        <button
                          key={tour._id}
                          type="button"
                          onClick={() => {
                            if (isFull) return;
                            setSelectedTourId(tour._id);
                          }}
                          disabled={isFull}
                          className={
                            isFull
                              ? "cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 p-3 text-left opacity-60"
                              : isSelected
                                ? "rounded-md border border-slate-300 bg-slate-100 p-3 text-left"
                                : "rounded-md border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {tour.logoUrl ? (
                                <img
                                  src={tour.logoUrl}
                                  alt={`${tour.name} logo`}
                                  width={32}
                                  height={32}
                                  loading="lazy"
                                  className="h-8 w-8 object-contain"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-gray-200" />
                              )}
                              <div>
                                <div className="text-sm font-semibold text-slate-800">
                                  {tour.name}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {isFull
                                    ? "Tour is full"
                                    : `${spotsRemaining} spots remaining`}
                                  {tour.buyIn
                                    ? ` • Buy-in: ${formatBuyIn(tour.buyIn)}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                            <div
                              className={
                                isFull
                                  ? "text-xs font-semibold text-slate-500"
                                  : isSelected
                                    ? "text-xs font-semibold text-slate-900"
                                    : "text-xs text-slate-500"
                              }
                            >
                              {isFull
                                ? "FULL"
                                : isSelected
                                  ? "Selected"
                                  : "Select"}
                            </div>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              {errorMessage ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorMessage}
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedTourId(null);
                    setErrorMessage(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSwitch}
                  disabled={!selectedTourId || otherToursWithMeta.length === 0}
                  className={confirmEffect ? "animate-toggleClick" : ""}
                  onAnimationEnd={() => setConfirmEffect(false)}
                >
                  Confirm Switch
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * useTourCardChangeButton
 *
 * Fetches and derives the view-model for `TourCardChangeButton`, including eligible tours,
 * per-tour remaining capacity, and all UI state/handlers for the dialog.
 *
 * @param input - Hook inputs.
 * @param input.tourCardId - The tour card id to update.
 * @returns A view-model for rendering the button and switch dialog.
 */
function useTourCardChangeButton({
  tourCardId,
}: {
  tourCardId: Id<"tourCards">;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [effect, setEffect] = useState(false);
  const [confirmEffect, setConfirmEffect] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState<Id<"tours"> | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tourCardResult = useQuery(api.functions.tourCards.getTourCards, {
    options: { id: tourCardId },
  });

  const tourCard = useMemo(() => {
    if (!Array.isArray(tourCardResult)) return null;
    return (tourCardResult[0] ?? null) as Doc<"tourCards"> | null;
  }, [tourCardResult]);

  const toursResult = useQuery(
    api.functions.tours.getTours,
    tourCard
      ? { options: { filter: { seasonId: tourCard.seasonId } } }
      : "skip",
  );

  const seasonTourCards = useQuery(
    api.functions.tourCards.getTourCards,
    tourCard ? { options: { seasonId: tourCard.seasonId } } : "skip",
  );

  const tours = useMemo(() => {
    return (
      Array.isArray(toursResult)
        ? toursResult
        : Array.isArray((toursResult as { tours?: Array<Doc<"tours">> })?.tours)
          ? (toursResult as { tours: Array<Doc<"tours">> }).tours
          : []
    ) as Array<Doc<"tours">>;
  }, [toursResult]);

  const tourCardsList = useMemo(() => {
    return (Array.isArray(seasonTourCards) ? seasonTourCards : []) as Array<
      Doc<"tourCards">
    >;
  }, [seasonTourCards]);

  const tourCounts = useMemo(() => {
    const counts = new Map<Id<"tours">, number>();
    for (const card of tourCardsList) {
      counts.set(card.tourId, (counts.get(card.tourId) ?? 0) + 1);
    }
    return counts;
  }, [tourCardsList]);

  const otherToursWithMeta = useMemo(() => {
    if (!tourCard) return [];

    return tours
      .filter((tour) => tour._id !== tourCard.tourId)
      .map((tour) => {
        const maxParticipants =
          tour.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS;
        const taken = tourCounts.get(tour._id) ?? 0;
        const spotsRemaining = Math.max(0, maxParticipants - taken);
        return { tour, spotsRemaining, isFull: spotsRemaining <= 0 };
      });
  }, [tourCard, tourCounts, tours]);

  const switchTourCard = useMutation(api.functions.tourCards.switchTourCards);

  const handleSwitch = useCallback(async () => {
    if (!selectedTourId) return;

    setIsLoading(true);
    setConfirmEffect(true);
    setErrorMessage(null);

    try {
      await switchTourCard({
        id: tourCardId,
        tourId: selectedTourId,
      });
      setIsModalOpen(false);
      setSelectedTourId(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to switch tours",
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedTourId, switchTourCard, tourCardId]);

  const handleButtonClick = useCallback(() => {
    setEffect(true);
    setIsModalOpen(true);
    setErrorMessage(null);
  }, []);

  return {
    effect,
    setEffect,
    confirmEffect,
    setConfirmEffect,
    isModalOpen,
    setIsModalOpen,
    isLoading,
    errorMessage,
    setErrorMessage,
    selectedTourId,
    setSelectedTourId,
    tourCard,
    tourCardResult,
    toursResult,
    seasonTourCards,
    otherToursWithMeta,
    handleButtonClick,
    handleSwitch,
  };
}

/**
 * Loading UI for `TourCardChangeButton`.
 */
function TourCardChangeButtonSkeleton() {
  return (
    <Skeleton className="mx-auto my-2 h-[1.5rem] w-1/2 xs:w-2/5 sm:w-1/3" />
  );
}
