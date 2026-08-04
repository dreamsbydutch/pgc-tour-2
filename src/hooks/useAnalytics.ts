import { useCallback, useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

import type {
  LeaderboardAnalyticsView,
  StandingsAnalyticsView,
  TeamSubmissionOperation,
} from "@/types";
import {
  captureAnalyticsEvent,
  categorizeTeamSubmissionError,
  sanitizeAnalyticsPathname,
} from "@/utils/analytics";

export function usePageViewAnalytics() {
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    void captureAnalyticsEvent("page_view", {
      pathname: sanitizeAnalyticsPathname(pathname),
    });
  }, [pathname]);
}

export function useAnalytics() {
  const trackLeaderboardTabChanged = useCallback(
    (view: LeaderboardAnalyticsView) => {
      void captureAnalyticsEvent("leaderboard_tab_changed", { view });
    },
    [],
  );

  const trackStandingsViewChanged = useCallback(
    (view: StandingsAnalyticsView) => {
      void captureAnalyticsEvent("standings_view_changed", { view });
    },
    [],
  );

  const trackTeamSubmissionSucceeded = useCallback(
    (operation: TeamSubmissionOperation) => {
      void captureAnalyticsEvent("team_submission_succeeded", { operation });
    },
    [],
  );

  const trackTeamSubmissionFailed = useCallback(
    (operation: TeamSubmissionOperation, error: unknown) => {
      void captureAnalyticsEvent("team_submission_failed", {
        operation,
        error_category: categorizeTeamSubmissionError(error),
      });
    },
    [],
  );

  return {
    trackLeaderboardTabChanged,
    trackStandingsViewChanged,
    trackTeamSubmissionSucceeded,
    trackTeamSubmissionFailed,
  };
}
