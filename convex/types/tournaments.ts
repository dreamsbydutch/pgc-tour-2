import type { Doc } from "../_generated/dataModel";

export type TournamentStatus = Doc<"tournaments">["status"];

export type ValidateTournamentDataInput = Partial<
  Pick<
    Doc<"tournaments">,
    | "name"
    | "seasonId"
    | "tierId"
    | "courseId"
    | "startDate"
    | "endDate"
    | "status"
  >
>;
