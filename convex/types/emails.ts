import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../_generated/server";

export type LeaderboardTopRow = {
  tourCardId: Id<"tourCards">;
  position: string;
  displayName: string;
  tourShortForm: string;
  scoreText: string;
  isChampion: boolean;
};

export type GroupsEmailContext = {
  tournament: Doc<"tournaments"> & {
    logoUrl?: unknown;
    groupsEmailSentAt?: number | null;
    name: string;
  };
  seasonYear: number;
  previousTournamentName: string;
  previousTournamentLogoUrl: string;
  champions: string;
  leaderboardRows: LeaderboardTopRow[];
  recipients: Array<{
    memberId?: Id<"members">;
    tourCardId?: Id<"tourCards">;
    email: string;
    name?: string;
  }>;
  activeTourCardCount: number;
  memberCount: number;
};

export type GetLeaderboardRowsForTournamentArgs = {
  ctx: QueryCtx;
  tournamentId: Id<"tournaments">;
};

export type GetPreviousCompletedTournamentNameArgs = {
  ctx: QueryCtx;
  tournament: Doc<"tournaments">;
};

export type GetChampionsStringForTournamentIdArgs = {
  ctx: QueryCtx;
  tournamentId: Id<"tournaments">;
};

export type GetAppBaseUrlArgs = {
  allowLocalhostFallback: boolean;
};

export type BuildTournamentUrlArgs = {
  baseUrl: string;
  tournamentId: string;
};

export type SendBrevoTemplateEmailBatchRecipient = {
  email: string;
  name?: string;
  params: Record<string, unknown>;
};

export type SendBrevoTemplateEmailBatchArgs = {
  apiKey: string;
  templateId: number;
  recipients: SendBrevoTemplateEmailBatchRecipient[];
  includeMessageIds?: boolean;
};

export type SendBrevoTemplateEmailBatchResult = {
  attempted: number;
  sent: number;
  failed: number;
  messageIds?: string[];
};

export type RequireAdminForActionCtx = {
  auth: ActionCtx["auth"];
  runQuery: ActionCtx["runQuery"];
};

export type SendGroupsEmailImplArgs = {
  ctx: ActionCtx;
  tournamentId: Id<"tournaments">;
  customBlurb?: string;
  force?: boolean;
};
