export type LeaderboardAnalyticsView = "pga" | "pgc";

export type StandingsAnalyticsView = "playoffs" | "tour";

export type TeamSubmissionOperation = "create" | "update";

export type TeamSubmissionErrorCategory =
  | "authorization"
  | "conflict"
  | "network"
  | "rate_limited"
  | "unavailable"
  | "validation"
  | "unknown";

export interface AnalyticsEventProperties {
  page_view: { pathname: string };
  leaderboard_tab_changed: { view: LeaderboardAnalyticsView };
  standings_view_changed: { view: StandingsAnalyticsView };
  team_submission_succeeded: { operation: TeamSubmissionOperation };
  team_submission_failed: {
    operation: TeamSubmissionOperation;
    error_category: TeamSubmissionErrorCategory;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventProperties;
