export type CourseEnhancementOptions = {
  includeTournaments?: boolean;
  includeStatistics?: boolean;
};

import type { Doc } from "../_generated/dataModel";

export type ValidateCourseDataInput = Partial<
  Pick<
    Doc<"courses">,
    "apiId" | "name" | "location" | "par" | "front" | "back" | "timeZoneOffset"
  >
>;
