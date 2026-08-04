import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type Id, useMutation } from "@/convex";
import type { SeasonDoc, TourCardDoc } from "convex/types/types";

const CLOSED_MESSAGE =
  "Tour card changes closed when the season's first event started.";
const MAX_TIMEOUT_MS = 2_147_000_000;

export function useTourCardChange({
  currentSeason,
  currentTourCard,
  closesAt,
}: {
  currentSeason: SeasonDoc;
  currentTourCard: TourCardDoc;
  closesAt: number | null;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [effect, setEffect] = useState(false);
  const [confirmEffect, setConfirmEffect] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState<Id<"tours"> | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const switchTourCard = useMutation(api.functions.tourCards.switchTourCards);
  const deleteTourCardAndFee = useMutation(
    api.functions.tourCards.deleteTourCardAndFee,
  );
  const isSelfServiceOpen = closesAt === null || now < closesAt;
  const closesAtLabel = useMemo(
    () =>
      closesAt === null
        ? null
        : new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(closesAt),
    [closesAt],
  );

  useEffect(() => {
    if (closesAt === null || Date.now() >= closesAt) return;
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(closesAt - Date.now() + 25, MAX_TIMEOUT_MS),
    );
    return () => window.clearTimeout(timeout);
  }, [closesAt, now]);

  useEffect(() => {
    if (isSelfServiceOpen) return;
    setIsModalOpen(false);
    setSelectedTourId(null);
  }, [isSelfServiceOpen]);

  const toUserMessage = useCallback((error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    return message.includes(CLOSED_MESSAGE) ? CLOSED_MESSAGE : message;
  }, []);

  const handleSwitch = useCallback(async () => {
    if (!selectedTourId || !isSelfServiceOpen) return;
    setIsLoading(true);
    setConfirmEffect(true);
    setErrorMessage(null);
    try {
      await switchTourCard({
        id: currentTourCard._id,
        tourId: selectedTourId,
      });
      setIsModalOpen(false);
      setSelectedTourId(null);
    } catch (error) {
      setErrorMessage(toUserMessage(error, "Unable to switch tours"));
    } finally {
      setIsLoading(false);
    }
  }, [
    currentTourCard._id,
    isSelfServiceOpen,
    selectedTourId,
    switchTourCard,
    toUserMessage,
  ]);

  const handleRemoveTourCard = useCallback(async () => {
    if (!isSelfServiceOpen) return;
    if (
      !window.confirm(
        `This will delete your tour card for the ${currentSeason.year} season`,
      )
    ) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await deleteTourCardAndFee({ id: currentTourCard._id });
      setIsModalOpen(false);
      setSelectedTourId(null);
    } catch (error) {
      setErrorMessage(toUserMessage(error, "Failed to remove tour card."));
    } finally {
      setIsLoading(false);
    }
  }, [
    currentSeason.year,
    currentTourCard._id,
    deleteTourCardAndFee,
    isSelfServiceOpen,
    toUserMessage,
  ]);

  const handleButtonClick = useCallback(() => {
    if (!isSelfServiceOpen) return;
    setEffect(true);
    setIsModalOpen(true);
    setErrorMessage(null);
  }, [isSelfServiceOpen]);

  return {
    isLoading,
    effect,
    setEffect,
    confirmEffect,
    setConfirmEffect,
    isModalOpen,
    setIsModalOpen,
    errorMessage,
    setErrorMessage,
    selectedTourId,
    setSelectedTourId,
    handleButtonClick,
    handleSwitch,
    handleRemoveTourCard,
    isSelfServiceOpen,
    closesAtLabel,
    closedMessage: CLOSED_MESSAGE,
  };
}
