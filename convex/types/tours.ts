import type { Doc } from "../_generated/dataModel";

export type ValidateTourDataInput = Partial<
  Pick<
    Doc<"tours">,
    | "name"
    | "shortForm"
    | "buyIn"
    | "maxParticipants"
    | "playoffSpots"
    | "logoUrl"
  >
>;
