import type { Doc } from "../_generated/dataModel";

export type TourDoc = Doc<"tours">;
export type TournamentDoc = Doc<"tournaments">;
export type SeasonDoc = Doc<"seasons">;
export type TierDoc = Doc<"tiers">;
export type MemberDoc = Doc<"members">;
export type TourCardDoc = Doc<"tourCards">;
export type TeamDoc = Doc<"teams">;
export type CourseDoc = Doc<"courses">;
export type GolferDoc = Doc<"golfers">;
export type TournamentGolferDoc = Doc<"tournamentGolfers">;
export type TransactionDoc = Doc<"transactions">;

export type {
  PaginationOptions,
  SortOptions,
  SortOrder,
  TimestampRangeFilter,
} from "./common";
export type {
  DataGolfFieldPlayer,
  DataGolfFieldUpdatesResponse,
  DataGolfHistoricalEventDataResponse,
  DataGolfHistoricalEventDataStat,
  DataGolfHistoricalRoundDataResponse,
  DataGolfLiveModelPlayer,
  DataGolfLiveModelPredictionsResponse,
  DataGolfLiveTournamentStat,
  DataGolfRankedPlayer,
  DataGolfRankingsResponse,
} from "./datagolf";
export type {
  BuildTournamentUrlArgs,
  GetAppBaseUrlArgs,
  GetChampionsStringForTournamentIdArgs,
  GetLeaderboardRowsForTournamentArgs,
  GetPreviousCompletedTournamentNameArgs,
  GroupsEmailContext,
  LeaderboardTopRow,
  SendBrevoTemplateEmailBatchArgs,
  SendBrevoTemplateEmailBatchResult,
  SendGroupsEmailImplArgs,
} from "./emails";
export type {
  EnhancedTournamentGolferDoc,
  GolferCreatePayload,
  GolferQueryOptions,
  GolferUpdatePayload,
  HydratedGolfer,
  HydratedTournamentGolfer,
  TournamentGolferCreatePayload,
  TournamentGolferQueryFilter,
  TournamentGolferUpdatePayload,
  TournamentScopeFilter,
} from "./golfers";
export type {
  EnhancedMemberDoc,
  MemberQueryOptions,
  MemberSortOptions,
} from "./members";
export type {
  SeasonCreatePayload,
  SeasonQueryOptions,
  SeasonSortOptions,
  SeasonUpdatePayload,
} from "./seasons";
export type {
  EnhancedTournamentTeamDoc,
  TeamCreatePayload,
  TeamImportRow,
  TeamPaginationOptions,
  TeamQueryOptions,
  TeamReadFilter,
  TeamSortOptions,
  TeamUpdatePayload,
} from "./teams";
export type {
  TierCreatePayload,
  TierFilterOptions,
  TierPaginationOptions,
  TierQueryOptions,
  TierSortOptions,
  TierUpdatePayload,
  TierWithSeason,
} from "./tiers";
export type {
  TourCardCreatePayload,
  TourCardQueryOptions,
  TourCardUpdatePayload,
  TourCardWithMember,
} from "./tourCards";
export type {
  EnhancedTournamentDoc,
  TournamentCreatePayload,
  TournamentFetchResult,
  TournamentPlayoffState,
  TournamentQueryOptions,
  TournamentSortOptions,
  TournamentStatus,
  TournamentUpdatePayload,
} from "./tournaments";
export type {
  TourCreatePayload,
  TourEnhanceOptions,
  TourFilterOptions,
  TourPaginationOptions,
  TourQueryOptions,
  TourSortOptions,
  TourUpdatePayload,
  TourWithSeason,
} from "./tours";
