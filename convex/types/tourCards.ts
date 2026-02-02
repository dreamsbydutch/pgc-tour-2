import type { Doc } from "../_generated/dataModel";

export type ValidateTourCardDataInput = Partial<
  Pick<
    Doc<"tourCards">,
    | "displayName"
    | "earnings"
    | "points"
    | "wins"
    | "topTen"
    | "appearances"
    | "madeCut"
  >
>;
