import type { Doc } from "../_generated/dataModel";

export type ValidateSeasonDataInput = Partial<
  Pick<
    Doc<"seasons">,
    "year" | "number" | "startDate" | "endDate" | "registrationDeadline"
  >
>;
