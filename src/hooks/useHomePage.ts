import { useState } from "react";

import {
  api,
  useConvex,
  useConvexConnectionState,
  useQuery,
  useViewerBootstrap,
} from "@/convex";
import type { HomePageModel } from "@/types";
import type {
  EnhancedTournamentDoc,
  MemberDoc,
  SeasonDoc,
  TourCardDoc,
  TourDoc,
} from "convex/types/types";

export function useHomePage(): HomePageModel {
  const convex = useConvex();
  const connection = useConvexConnectionState();
  const queriedDashboard = useQuery(api.functions.home.getPublicHomeDashboard);
  const bootstrap = useViewerBootstrap();
  const [retriedDashboard, setRetriedDashboard] =
    useState<typeof queriedDashboard>();
  const [isRetrying, setIsRetrying] = useState(false);
  const dashboard = queriedDashboard ?? retriedDashboard;
  const freshness = connection.isWebSocketConnected ? "live" : "stale";

  const retry = () => {
    if (isRetrying) return;
    setIsRetrying(true);
    void convex
      .query(api.functions.home.getPublicHomeDashboard, {})
      .then(setRetriedDashboard)
      .catch(() => undefined)
      .finally(() => setIsRetrying(false));
  };

  if (dashboard === undefined || bootstrap === undefined) {
    if (!connection.hasEverConnected && connection.connectionRetries >= 3) {
      return {
        kind: "failed",
        message:
          "The clubhouse could not connect. Check your connection and try again.",
        retry,
        isRetrying,
      };
    }
    return { kind: "loading" };
  }

  const member = bootstrap.member as MemberDoc | null;
  const role = member?.role?.trim() || null;

  if (!dashboard.season) return { kind: "noSeason", role, freshness };

  const tournaments = dashboard.tournaments as EnhancedTournamentDoc[];
  const now = Date.now();
  return {
    kind: "ready",
    currentSeason: dashboard.season as SeasonDoc,
    nextTournament:
      tournaments.find((tournament) => tournament.startDate > now) ?? null,
    seasonTournaments: tournaments,
    member,
    tours: dashboard.tours as TourDoc[],
    seasonTourCards: bootstrap.tourCards as TourCardDoc[],
    role,
    account: typeof member?.account === "number" ? member.account : null,
    freshness,
  };
}
