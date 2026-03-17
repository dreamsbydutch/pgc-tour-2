import type { Doc, Id } from "../_generated/dataModel";
import type { SortOptions } from "./common";
import type { EnhancedTournamentGolferDoc } from "./golfers";
import type { EnhancedTournamentTeamDoc } from "./teams";

export type TournamentStatus =
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled";

type TournamentFilterOptions = {
  seasonId?: Id<"seasons">;
  status?: TournamentStatus;
};

export type TournamentSortOptions = SortOptions<
  "name" | "startDate" | "endDate" | "status"
>;

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

export type TournamentFetchResult = Doc<"tournaments"> & {
  course: Doc<"courses">;
  tier: Doc<"tiers">;
  season: Doc<"seasons">;
};


export type EnhancedTournamentDoc = TournamentFetchResult & {
  dateRange?: string;
  duration?: number;
  calculatedStatus?: TournamentStatus;
  tours?: Doc<"tours">[];
  teams?: EnhancedTournamentTeamDoc[];
  tourCards?: Doc<"tourCards">[];
  teamCount?: number;
  golfers?: EnhancedTournamentGolferDoc[];
  isPlayoff?: boolean;
  eventIndex?: number;
  playoffEvents?: Id<"tournaments">[] | null;
};
