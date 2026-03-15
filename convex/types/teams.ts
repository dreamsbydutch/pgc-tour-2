import type { Doc, Id } from "../_generated/dataModel";
import type { PaginationOptions, SortOptions } from "./common";

export type TeamReadFilter = {
  tournamentId?: Id<"tournaments">;
  tourCardId?: Id<"tourCards">;
  seasonId?: Id<"seasons">;
};

export type TeamSortOptions = SortOptions<"createdAt" | "points" | "updatedAt">;

export type TeamPaginationOptions = PaginationOptions;

export type TeamQueryOptions = {
  filter?: TeamReadFilter;
  sort?: TeamSortOptions;
  pagination?: TeamPaginationOptions;
};

type TeamWritableFields = Pick<
  Doc<"teams">,
  "tournamentId" | "tourCardId" | "golferIds"
> &
  Pick<
    Doc<"teams">,
    | "earnings"
    | "points"
    | "makeCut"
    | "position"
    | "pastPosition"
    | "score"
    | "topTen"
    | "topFive"
    | "topThree"
    | "win"
    | "today"
    | "thru"
    | "round"
    | "roundOneTeeTime"
    | "roundOne"
    | "roundTwoTeeTime"
    | "roundTwo"
    | "roundThreeTeeTime"
    | "roundThree"
    | "roundFourTeeTime"
    | "roundFour"
  >;

export type TeamCreatePayload = TeamWritableFields;

export type TeamUpdatePayload = Partial<TeamWritableFields>;

export type TeamImportRow = {
  tournamentId?: string;
  tourCardId?: string;
  golferIds?: number[];
};

export type EnhancedTournamentTeamDoc = Doc<"teams"> & {
  tourId?: Id<"tours">;
  displayName?: string;
  memberId?: Id<"members">;
  appearances?: number;
  playoff?: number;
  standingsPosition?: string;
  totalEarnings?: number;
  totalPoints?: number;
};
