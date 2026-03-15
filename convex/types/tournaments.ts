import type { Id } from "../_generated/dataModel";

export type TournamentStatus =
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled";

export type TournamentSortBy = "name" | "startDate" | "endDate" | "status";

export type TournamentSortOrder = "asc" | "desc";

export type TournamentFilterOptions = {
  seasonId?: Id<"seasons">;
  status?: TournamentStatus;
};

export type TournamentSortOptions = {
  sortBy?: TournamentSortBy;
  sortOrder?: TournamentSortOrder;
};

export type TournamentEnhanceOptions = {
  includeCourse?: boolean;
  includeTier?: boolean;
  includeSeason?: boolean;
};

export type TournamentPlayoffState = {
  isPlayoff: boolean;
  playoffEventIndex: number;
  isNonFirstPlayoffTournament: boolean;
  firstPlayoffEventId: Id<"tournaments"> | null;
  previousPlayoffEventId: Id<"tournaments"> | null;
};

export type TournamentQueryOptions = {
  filter?: TournamentFilterOptions;
  sort?: TournamentSortOptions;
  enhance?: TournamentEnhanceOptions;
};

export type TournamentCreatePayload = {
  name: string;
  startDate: number;
  endDate: number;
  tierId: Id<"tiers">;
  courseId: Id<"courses">;
  seasonId: Id<"seasons">;
  logoUrl?: string;
  apiId?: string;
  groupsEmailSentAt?: number;
  reminderEmailSentAt?: number;
  status?: TournamentStatus;
  currentRound?: number;
  livePlay?: boolean;
  dataGolfInPlayLastUpdate?: string | number;
  leaderboardLastUpdatedAt?: number;
};

export type TournamentUpdatePayload = {
  name?: string;
  startDate?: number;
  endDate?: number;
  tierId?: Id<"tiers">;
  courseId?: Id<"courses">;
  seasonId?: Id<"seasons">;
  logoUrl?: string;
  apiId?: string;
  groupsEmailSentAt?: number;
  reminderEmailSentAt?: number;
  status?: TournamentStatus;
  currentRound?: number;
  livePlay?: boolean;
  dataGolfInPlayLastUpdate?: string | number;
  leaderboardLastUpdatedAt?: number;
};
