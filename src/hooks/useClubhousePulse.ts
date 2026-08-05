import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  useConvexConnectionState,
  useQuery,
  useViewerBootstrap,
} from "@/convex";
import type {
  ClubhousePulseDestination,
  ClubhousePulseModel,
  ClubhousePulseReadyDto,
} from "@/types";
import { buildClubhousePulseCards } from "@/utils/clubhousePulse";
import { useAnalytics } from "./useAnalytics";

const SELECTED_CARD_SESSION_KEY = "pgc.clubhouse-pulse.selected-card";

export function useClubhousePulse(): ClubhousePulseModel {
  const bootstrap = useViewerBootstrap();
  const connection = useConvexConnectionState();
  const shouldLoad = Boolean(
    bootstrap?.member && bootstrap.appState.currentSeasonId,
  );
  const queried = useQuery(
    api.functions.home.getViewerClubhousePulse,
    shouldLoad ? {} : "skip",
  );
  const [cached, setCached] = useState<ClubhousePulseReadyDto | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedCardId, setSelectedCardId] = useState(() =>
    readSelectedCard(),
  );
  const { trackClubhousePulseCtaClicked, trackClubhousePulseTourChanged } =
    useAnalytics();

  useEffect(() => {
    if (queried?.kind === "ready") setCached(queried);
  }, [queried]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = queried?.kind === "ready" ? queried : cached;
  const built = useMemo(
    () =>
      data
        ? buildClubhousePulseCards({
            data,
            friendIds: (bootstrap?.member?.friends ?? []).map(String),
            now,
          })
        : null,
    [bootstrap?.member?.friends, data, now],
  );
  const fallbackCardId = built?.tabs[0]?.cardId ?? "";
  const activeCardId = built?.tabs.some((tab) => tab.cardId === selectedCardId)
    ? selectedCardId
    : fallbackCardId;
  const card = built?.cards.find((item) => item.cardId === activeCardId);

  useEffect(() => {
    if (!activeCardId || activeCardId === selectedCardId) return;
    setSelectedCardId(activeCardId);
    writeSelectedCard(activeCardId);
  }, [activeCardId, selectedCardId]);

  const selectCard = useCallback(
    (cardId: string) => {
      const selected = built?.cards.find((item) => item.cardId === cardId);
      if (!selected || cardId === activeCardId) return;
      setSelectedCardId(cardId);
      writeSelectedCard(cardId);
      trackClubhousePulseTourChanged(selected.phase);
    },
    [activeCardId, built?.cards, trackClubhousePulseTourChanged],
  );

  const activateAction = useCallback(
    (destination?: ClubhousePulseDestination) => {
      if (!card) return;
      trackClubhousePulseCtaClicked(
        card.phase,
        destination ?? card.action.destination,
      );
    },
    [card, trackClubhousePulseCtaClicked],
  );

  if (!shouldLoad) return { kind: "idle" };
  if (!data && queried === undefined) return { kind: "loading" };
  if (!built || !card || built.tabs.length === 0) return { kind: "empty" };
  return {
    kind: "ready",
    freshness: connection.isWebSocketConnected ? "live" : "stale",
    tabs: built.tabs,
    selectedCardId: activeCardId,
    card,
    selectCard,
    activateAction,
  };
}

function readSelectedCard() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(SELECTED_CARD_SESSION_KEY) ?? "";
}

function writeSelectedCard(cardId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SELECTED_CARD_SESSION_KEY, cardId);
}
